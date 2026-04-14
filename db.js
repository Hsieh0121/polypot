import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const dataDir = path.resolve("./data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "polypot.sqlite");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

// --------------------
// schema
// --------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    serial TEXT NOT NULL UNIQUE,
    assigned_table_id TEXT,
    name TEXT,
    message TEXT,
    avatar_photo TEXT,
    signature TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS table_pots (
    table_id TEXT PRIMARY KEY,
    table_state_json TEXT,
    final_pot_texture_url TEXT,
    chair_count INTEGER,
    chair_color TEXT,
    pot_body_color TEXT,
    pot_handle_color TEXT,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS avatar_presences (
    serial TEXT PRIMARY KEY,
    assigned_table_id TEXT,
    last_pos_x REAL,
    last_pos_y REAL,
    last_pos_z REAL,
    last_rot_y REAL,
    is_online INTEGER NOT NULL DEFAULT 0,
    mode TEXT NOT NULL DEFAULT 'static',
    updated_at INTEGER NOT NULL
  );
`);
try {
  db.exec(`ALTER TABLE table_pots ADD COLUMN pot_body_color TEXT`);
} catch (err) {}

try {
  db.exec(`ALTER TABLE table_pots ADD COLUMN pot_handle_color TEXT`);
} catch (err) {}

// --------------------
// shared helpers
// --------------------
function isBlobUrl(value) {
  return typeof value === "string" && value.startsWith("blob:");
}

function deepStripBlobUrls(value) {
  if (Array.isArray(value)) {
    return value.map(deepStripBlobUrls);
  }

  if (value && typeof value === "object") {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = deepStripBlobUrls(v);
    }
    return out;
  }

  if (isBlobUrl(value)) {
    return null;
  }

  return value;
}

function safeJsonParse(jsonText, fallback = null) {
  if (!jsonText) return fallback;
  try {
    return JSON.parse(jsonText);
  } catch (err) {
    console.error("[db] JSON parse failed:", err);
    return fallback;
  }
}

function sanitizeFinalPotTextureUrl(url) {
  if (isBlobUrl(url)) {
    console.warn("[db] dropping blob finalPotTextureUrl");
    return null;
  }
  return typeof url === "string" ? url : null;
}

// --------------------
// profile helpers
// --------------------
const getProfileBySerialStmt = db.prepare(`
  SELECT
    serial,
    assigned_table_id as assignedTableId,
    name,
    message,
    avatar_photo as avatarPhoto,
    signature,
    created_at as createdAt,
    updated_at as updatedAt
  FROM profiles
  WHERE serial = ?
`);

const upsertProfileStmt = db.prepare(`
  INSERT INTO profiles (
    serial,
    assigned_table_id,
    name,
    message,
    avatar_photo,
    signature,
    created_at,
    updated_at
  )
  VALUES (
    @serial,
    @assignedTableId,
    @name,
    @message,
    @avatarPhoto,
    @signature,
    @createdAt,
    @updatedAt
  )
  ON CONFLICT(serial) DO UPDATE SET
    assigned_table_id = excluded.assigned_table_id,
    name = excluded.name,
    message = excluded.message,
    avatar_photo = excluded.avatar_photo,
    signature = excluded.signature,
    updated_at = excluded.updated_at
`);

export function getProfileBySerial(serial) {
  return getProfileBySerialStmt.get(serial) ?? null;
}

export function saveProfile(profile) {
  const now = Date.now();
  const existing = getProfileBySerial(profile.serial);

  const row = {
    serial: profile.serial,
    assignedTableId: profile.assignedTableId ?? null,
    name: profile.name ?? "",
    message: profile.message ?? "",
    avatarPhoto: profile.avatarPhoto ?? "",
    signature: profile.signature ?? "",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  upsertProfileStmt.run(row);
  return getProfileBySerial(profile.serial);
}

const getMaxProfileIdStmt = db.prepare(`
  SELECT MAX(id) as maxId FROM profiles
`);

export function getNextSerialNumberFallback() {
  const row = getMaxProfileIdStmt.get();
  return (row?.maxId ?? 0) + 1;
}

// --------------------
// pot helpers
// --------------------
const getPotByTableIdStmt = db.prepare(`
  SELECT
    table_id as tableId,
    table_state_json as tableStateJson,
    final_pot_texture_url as finalPotTextureUrl,
    chair_count as chairCount,
    chair_color as chairColor,
    pot_body_color as potBodyColor,
    pot_handle_color as potHandleColor,
    updated_at as updatedAt
  FROM table_pots
  WHERE table_id = ?
`);

const listAllPotsStmt = db.prepare(`
  SELECT
    table_id as tableId,
    table_state_json as tableStateJson,
    final_pot_texture_url as finalPotTextureUrl,
    chair_count as chairCount,
    chair_color as chairColor,
    pot_body_color as potBodyColor,
    pot_handle_color as potHandleColor,
    updated_at as updatedAt
  FROM table_pots
`);

const upsertPotStmt = db.prepare(`
  INSERT INTO table_pots (
    table_id,
    table_state_json,
    final_pot_texture_url,
    chair_count,
    chair_color,
    pot_body_color,
    pot_handle_color,
    updated_at
  )
  VALUES (
    @tableId,
    @tableStateJson,
    @finalPotTextureUrl,
    @chairCount,
    @chairColor,
    @potBodyColor,
    @potHandleColor,
    @updatedAt
  )
  ON CONFLICT(table_id) DO UPDATE SET
    table_state_json = excluded.table_state_json,
    final_pot_texture_url = excluded.final_pot_texture_url,
    chair_count = excluded.chair_count,
    chair_color = excluded.chair_color,
    pot_body_color = excluded.pot_body_color,
    pot_handle_color = excluded.pot_handle_color,
    updated_at = excluded.updated_at
`);

function sanitizeTableState(tableState) {
  return deepStripBlobUrls(tableState ?? null);
}

function parsePotRow(row) {
  if (!row) return null;

  const parsedState = safeJsonParse(row.tableStateJson, null);
  const sanitizedState = sanitizeTableState(parsedState);

  return {
    tableId: row.tableId,
    tableState: sanitizedState,
    finalPotTextureUrl: sanitizeFinalPotTextureUrl(row.finalPotTextureUrl),
    chairCount: row.chairCount ?? 0,
    chairColor: row.chairColor ?? null,
    potBodyColor: row.potBodyColor ?? "#FD6FFF",
    potHandleColor: row.potHandleColor ?? "#E8F25A",
    updatedAt: row.updatedAt,
  };
}

export function getPotByTableId(tableId) {
  return parsePotRow(getPotByTableIdStmt.get(tableId));
}

export function listAllPots() {
  return listAllPotsStmt.all().map(parsePotRow);
}

export function saveTablePot(pot) {
  const safeTableState = sanitizeTableState(pot.tableState);
  const safeFinalPotTextureUrl = sanitizeFinalPotTextureUrl(
    pot.finalPotTextureUrl
  );

  const row = {
    tableId: pot.tableId,
    tableStateJson: JSON.stringify(safeTableState),
    finalPotTextureUrl: safeFinalPotTextureUrl,
    chairCount: pot.chairCount ?? 0,
    chairColor: pot.chairColor ?? null,
    potBodyColor: pot.potBodyColor ?? pot.tableState?.potBodyColor ?? "#FD6FFF",
    potHandleColor: pot.potHandleColor ?? pot.tableState?.potHandleColor ?? "#E8F25A",
    updatedAt: Date.now(),
  };

  upsertPotStmt.run(row);
  return getPotByTableId(pot.tableId);
}

// --------------------
// avatar presence helpers
// --------------------
const getAvatarPresenceBySerialStmt = db.prepare(`
  SELECT
    serial,
    assigned_table_id as assignedTableId,
    last_pos_x as lastPosX,
    last_pos_y as lastPosY,
    last_pos_z as lastPosZ,
    last_rot_y as lastRotY,
    is_online as isOnline,
    mode,
    updated_at as updatedAt
  FROM avatar_presences
  WHERE serial = ?
`);

const listAllAvatarPresencesStmt = db.prepare(`
  SELECT
    serial,
    assigned_table_id as assignedTableId,
    last_pos_x as lastPosX,
    last_pos_y as lastPosY,
    last_pos_z as lastPosZ,
    last_rot_y as lastRotY,
    is_online as isOnline,
    mode,
    updated_at as updatedAt
  FROM avatar_presences
  ORDER BY updated_at DESC
`);

const upsertAvatarPresenceStmt = db.prepare(`
  INSERT INTO avatar_presences (
    serial,
    assigned_table_id,
    last_pos_x,
    last_pos_y,
    last_pos_z,
    last_rot_y,
    is_online,
    mode,
    updated_at
  )
  VALUES (
    @serial,
    @assignedTableId,
    @lastPosX,
    @lastPosY,
    @lastPosZ,
    @lastRotY,
    @isOnline,
    @mode,
    @updatedAt
  )
  ON CONFLICT(serial) DO UPDATE SET
    assigned_table_id = excluded.assigned_table_id,
    last_pos_x = excluded.last_pos_x,
    last_pos_y = excluded.last_pos_y,
    last_pos_z = excluded.last_pos_z,
    last_rot_y = excluded.last_rot_y,
    is_online = excluded.is_online,
    mode = excluded.mode,
    updated_at = excluded.updated_at
`);

function parseAvatarPresenceRow(row) {
  if (!row) return null;

  return {
    serial: row.serial,
    assignedTableId: row.assignedTableId ?? null,
    pos:
      row.lastPosX == null || row.lastPosY == null || row.lastPosZ == null
        ? null
        : {
            x: row.lastPosX,
            y: row.lastPosY,
            z: row.lastPosZ,
          },
    rotY: row.lastRotY ?? 0,
    isOnline: !!row.isOnline,
    mode: row.mode ?? "static",
    updatedAt: row.updatedAt,
  };
}

export function getAvatarPresenceBySerial(serial) {
  return parseAvatarPresenceRow(getAvatarPresenceBySerialStmt.get(serial));
}

export function listAllAvatarPresences() {
  return listAllAvatarPresencesStmt.all().map(parseAvatarPresenceRow);
}

export function saveAvatarPresence(input) {
  if (!input?.serial) {
    throw new Error("saveAvatarPresence: serial is required");
  }

  const profile = getProfileBySerial(input.serial);

  const row = {
    serial: input.serial,
    assignedTableId:
      input.assignedTableId ??
      profile?.assignedTableId ??
      null,
    lastPosX:
      typeof input.pos?.x === "number" ? input.pos.x : null,
    lastPosY:
      typeof input.pos?.y === "number" ? input.pos.y : null,
    lastPosZ:
      typeof input.pos?.z === "number" ? input.pos.z : null,
    lastRotY:
      typeof input.rotY === "number" ? input.rotY : 0,
    isOnline: input.isOnline ? 1 : 0,
    mode: typeof input.mode === "string" ? input.mode : "static",
    updatedAt: Date.now(),
  };

  upsertAvatarPresenceStmt.run(row);
  return getAvatarPresenceBySerial(input.serial);
}

export function setAvatarPresenceOnline(serial, isOnline) {
  const existing = getAvatarPresenceBySerial(serial);
  if (!existing) return null;

  return saveAvatarPresence({
    serial,
    assignedTableId: existing.assignedTableId,
    pos: existing.pos,
    rotY: existing.rotY,
    isOnline,
    mode: existing.mode,
  });
}

export default db;