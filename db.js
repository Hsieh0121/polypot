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
// shared serial helpers
// --------------------
function parseSerialNumber(serial) {
  const num = parseInt(String(serial).replace(/^P/i, ""), 10);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

function mapSerialToRoom(serial, roomSize = 8) {
  const num = parseSerialNumber(serial);
  if (!num) return null;
  const roomIndex = Math.floor((num - 1) / roomSize) + 1;
  return `room${roomIndex}`;
}

function mapSerialToTable(serial, tableCount = 8) {
  const num = parseSerialNumber(serial);
  if (!num) return null;
  const tableIndex = ((num - 1) % tableCount) + 1;
  return `table${tableIndex}`;
}

// --------------------
// schema bootstrap
// --------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    serial TEXT NOT NULL UNIQUE,
    room_id TEXT,
    assigned_table_id TEXT,
    name TEXT,
    message TEXT,
    avatar_photo TEXT,
    signature TEXT,
    id_card_snapshot TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS avatar_presences (
    serial TEXT PRIMARY KEY,
    room_id TEXT,
    assigned_table_id TEXT,
    last_pos_x REAL,
    last_pos_y REAL,
    last_pos_z REAL,
    last_rot_y REAL,
    is_online INTEGER NOT NULL DEFAULT 0,
    mode TEXT NOT NULL DEFAULT 'static',
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS print_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    serial TEXT NOT NULL,
    room_id TEXT,
    type TEXT NOT NULL,
    image_data TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    printed_at INTEGER
  );
    CREATE TABLE IF NOT EXISTS pot_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    table_id TEXT NOT NULL,
    author_serial TEXT NOT NULL,
    author_name TEXT,
    author_avatar_photo TEXT,
    content TEXT NOT NULL,
    is_owner INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
    CREATE TABLE IF NOT EXISTS feedbacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    serial TEXT,
    room_id TEXT,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

// --------------------
// legacy column migration
// --------------------
function getTableColumns(tableName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all();
}

function hasColumn(tableName, columnName) {
  return getTableColumns(tableName).some((col) => col.name === columnName);
}

try {
  if (!hasColumn("profiles", "room_id")) {
    db.exec(`ALTER TABLE profiles ADD COLUMN room_id TEXT`);
  }
} catch (err) {}

try {
  if (!hasColumn("profiles", "assigned_table_id")) {
    db.exec(`ALTER TABLE profiles ADD COLUMN assigned_table_id TEXT`);
  }
} catch (err) {}

try {
  if (!hasColumn("profiles", "id_card_snapshot")) {
    db.exec(`ALTER TABLE profiles ADD COLUMN id_card_snapshot TEXT`);
  }
} catch (err) {}

try {
  if (!hasColumn("avatar_presences", "room_id")) {
    db.exec(`ALTER TABLE avatar_presences ADD COLUMN room_id TEXT`);
  }
} catch (err) {}

try {
  if (!hasColumn("avatar_presences", "assigned_table_id")) {
    db.exec(`ALTER TABLE avatar_presences ADD COLUMN assigned_table_id TEXT`);
  }
} catch (err) {}

try {
  if (!hasColumn("table_pots", "pot_body_color")) {
    db.exec(`ALTER TABLE table_pots ADD COLUMN pot_body_color TEXT`);
  }
} catch (err) {}

try {
  if (!hasColumn("table_pots", "pot_handle_color")) {
    db.exec(`ALTER TABLE table_pots ADD COLUMN pot_handle_color TEXT`);
  }
} catch (err) {}

// --------------------
// table_pots migration
// old: PRIMARY KEY(table_id)
// new: PRIMARY KEY(room_id, table_id)
// --------------------
function ensureTablePotsV2() {
  const tableExists = db
    .prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'table_pots'
    `)
    .get();

  if (!tableExists) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS table_pots (
        room_id TEXT NOT NULL,
        table_id TEXT NOT NULL,
        table_state_json TEXT,
        final_pot_texture_url TEXT,
        chair_count INTEGER,
        chair_color TEXT,
        pot_body_color TEXT,
        pot_handle_color TEXT,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (room_id, table_id)
      );
    `);
    return;
  }

  const columns = getTableColumns("table_pots");
  const hasRoomId = columns.some((c) => c.name === "room_id");

  if (hasRoomId) {
    return;
  }

  console.warn("[db] migrating legacy table_pots -> room-aware table_pots");

  db.exec(`
    CREATE TABLE IF NOT EXISTS table_pots_v2 (
      room_id TEXT NOT NULL,
      table_id TEXT NOT NULL,
      table_state_json TEXT,
      final_pot_texture_url TEXT,
      chair_count INTEGER,
      chair_color TEXT,
      pot_body_color TEXT,
      pot_handle_color TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (room_id, table_id)
    );
  `);

  const legacyRows = db.prepare(`
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
  `).all();

  const insertV2 = db.prepare(`
    INSERT OR REPLACE INTO table_pots_v2 (
      room_id,
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
      @roomId,
      @tableId,
      @tableStateJson,
      @finalPotTextureUrl,
      @chairCount,
      @chairColor,
      @potBodyColor,
      @potHandleColor,
      @updatedAt
    )
  `);

  const tx = db.transaction(() => {
    for (const row of legacyRows) {
      insertV2.run({
        roomId: "room1",
        tableId: row.tableId,
        tableStateJson: row.tableStateJson,
        finalPotTextureUrl: row.finalPotTextureUrl,
        chairCount: row.chairCount,
        chairColor: row.chairColor,
        potBodyColor: row.potBodyColor ?? "#FD6FFF",
        potHandleColor: row.potHandleColor ?? "#E8F25A",
        updatedAt: row.updatedAt ?? Date.now(),
      });
    }

    db.exec(`DROP TABLE table_pots`);
    db.exec(`ALTER TABLE table_pots_v2 RENAME TO table_pots`);
  });

  tx();
}

ensureTablePotsV2();

// --------------------
// backfill room_id / assigned_table_id from serial
// --------------------
function backfillProfilesRoomAndTable() {
  const rows = db.prepare(`
    SELECT serial, room_id as roomId, assigned_table_id as assignedTableId
    FROM profiles
  `).all();

  const stmt = db.prepare(`
    UPDATE profiles
    SET room_id = @roomId,
        assigned_table_id = @assignedTableId
    WHERE serial = @serial
  `);

  const tx = db.transaction(() => {
    for (const row of rows) {
      const roomId = row.roomId || mapSerialToRoom(row.serial);
      const assignedTableId = row.assignedTableId || mapSerialToTable(row.serial);

      if (roomId !== row.roomId || assignedTableId !== row.assignedTableId) {
        stmt.run({
          serial: row.serial,
          roomId,
          assignedTableId,
        });
      }
    }
  });

  tx();
}

function backfillAvatarPresenceRoomAndTable() {
  const rows = db.prepare(`
    SELECT
      ap.serial as serial,
      ap.room_id as roomId,
      ap.assigned_table_id as assignedTableId,
      p.room_id as profileRoomId,
      p.assigned_table_id as profileAssignedTableId
    FROM avatar_presences ap
    LEFT JOIN profiles p
      ON p.serial = ap.serial
  `).all();

  const stmt = db.prepare(`
    UPDATE avatar_presences
    SET room_id = @roomId,
        assigned_table_id = @assignedTableId
    WHERE serial = @serial
  `);

  const tx = db.transaction(() => {
    for (const row of rows) {
      const roomId =
        row.roomId ||
        row.profileRoomId ||
        mapSerialToRoom(row.serial);

      const assignedTableId =
        row.assignedTableId ||
        row.profileAssignedTableId ||
        mapSerialToTable(row.serial);

      if (roomId !== row.roomId || assignedTableId !== row.assignedTableId) {
        stmt.run({
          serial: row.serial,
          roomId,
          assignedTableId,
        });
      }
    }
  });

  tx();
}

backfillProfilesRoomAndTable();
backfillAvatarPresenceRoomAndTable();

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
    room_id as roomId,
    assigned_table_id as assignedTableId,
    name,
    message,
    avatar_photo as avatarPhoto,
    signature,
    id_card_snapshot as idCardSnapshot,
    created_at as createdAt,
    updated_at as updatedAt
  FROM profiles
  WHERE serial = ?
`);

const upsertProfileStmt = db.prepare(`
  INSERT INTO profiles (
    serial,
    room_id,
    assigned_table_id,
    name,
    message,
    avatar_photo,
    signature,
    id_card_snapshot,
    created_at,
    updated_at
  )
  VALUES (
    @serial,
    @roomId,
    @assignedTableId,
    @name,
    @message,
    @avatarPhoto,
    @signature,
    @idCardSnapshot,
    @createdAt,
    @updatedAt
  )
  ON CONFLICT(serial) DO UPDATE SET
    room_id = excluded.room_id,
    assigned_table_id = excluded.assigned_table_id,
    name = excluded.name,
    message = excluded.message,
    avatar_photo = excluded.avatar_photo,
    signature = excluded.signature,
    id_card_snapshot = excluded.id_card_snapshot,
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
    roomId:
      profile.roomId ??
      existing?.roomId ??
      mapSerialToRoom(profile.serial),
    assignedTableId:
      profile.assignedTableId ??
      existing?.assignedTableId ??
      mapSerialToTable(profile.serial),
    name: profile.name ?? "",
    message: profile.message ?? "",
    avatarPhoto: profile.avatarPhoto ?? "",
    signature: profile.signature ?? "",
    idCardSnapshot: profile.idCardSnapshot ?? "",
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
const getPotByRoomAndTableIdStmt = db.prepare(`
  SELECT
    room_id as roomId,
    table_id as tableId,
    table_state_json as tableStateJson,
    final_pot_texture_url as finalPotTextureUrl,
    chair_count as chairCount,
    chair_color as chairColor,
    pot_body_color as potBodyColor,
    pot_handle_color as potHandleColor,
    updated_at as updatedAt
  FROM table_pots
  WHERE room_id = ? AND table_id = ?
`);

const listAllPotsByRoomStmt = db.prepare(`
  SELECT
    room_id as roomId,
    table_id as tableId,
    table_state_json as tableStateJson,
    final_pot_texture_url as finalPotTextureUrl,
    chair_count as chairCount,
    chair_color as chairColor,
    pot_body_color as potBodyColor,
    pot_handle_color as potHandleColor,
    updated_at as updatedAt
  FROM table_pots
  WHERE room_id = ?
`);

const listAllPotsStmt = db.prepare(`
  SELECT
    room_id as roomId,
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
    room_id,
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
    @roomId,
    @tableId,
    @tableStateJson,
    @finalPotTextureUrl,
    @chairCount,
    @chairColor,
    @potBodyColor,
    @potHandleColor,
    @updatedAt
  )
  ON CONFLICT(room_id, table_id) DO UPDATE SET
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
    roomId: row.roomId,
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

export function getPotByRoomAndTableId(roomId, tableId) {
  return parsePotRow(getPotByRoomAndTableIdStmt.get(roomId, tableId));
}

export function listAllPotsByRoom(roomId) {
  return listAllPotsByRoomStmt.all(roomId).map(parsePotRow);
}

// 保留舊接口，方便之後 debug
export function listAllPots() {
  return listAllPotsStmt.all().map(parsePotRow);
}

export function saveTablePot(pot) {
  const safeTableState = sanitizeTableState(pot.tableState);
  const safeFinalPotTextureUrl = sanitizeFinalPotTextureUrl(
    pot.finalPotTextureUrl
  );

  const resolvedRoomId =
    pot.roomId ||
    safeTableState?.roomId ||
    "room1";

  const row = {
    roomId: resolvedRoomId,
    tableId: pot.tableId,
    tableStateJson: JSON.stringify(safeTableState),
    finalPotTextureUrl: safeFinalPotTextureUrl,
    chairCount: pot.chairCount ?? 0,
    chairColor: pot.chairColor ?? null,
    potBodyColor:
      pot.potBodyColor ?? pot.tableState?.potBodyColor ?? "#FD6FFF",
    potHandleColor:
      pot.potHandleColor ?? pot.tableState?.potHandleColor ?? "#E8F25A",
    updatedAt: Date.now(),
  };

  upsertPotStmt.run(row);
  return getPotByRoomAndTableId(row.roomId, row.tableId);
}

// --------------------
// avatar presence helpers
// --------------------
const getAvatarPresenceBySerialStmt = db.prepare(`
  SELECT
    serial,
    room_id as roomId,
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

const listAllAvatarPresencesByRoomStmt = db.prepare(`
  SELECT
    serial,
    room_id as roomId,
    assigned_table_id as assignedTableId,
    last_pos_x as lastPosX,
    last_pos_y as lastPosY,
    last_pos_z as lastPosZ,
    last_rot_y as lastRotY,
    is_online as isOnline,
    mode,
    updated_at as updatedAt
  FROM avatar_presences
  WHERE room_id = ?
  ORDER BY updated_at DESC
`);

const listAllAvatarPresencesStmt = db.prepare(`
  SELECT
    serial,
    room_id as roomId,
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
    room_id,
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
    @roomId,
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
    room_id = excluded.room_id,
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
    roomId: row.roomId ?? null,
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

export function listAllAvatarPresencesByRoom(roomId) {
  return listAllAvatarPresencesByRoomStmt.all(roomId).map(parseAvatarPresenceRow);
}

// 保留舊接口，方便之後 debug
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
    roomId:
      input.roomId ??
      profile?.roomId ??
      mapSerialToRoom(input.serial),
    assignedTableId:
      input.assignedTableId ??
      profile?.assignedTableId ??
      mapSerialToTable(input.serial),
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
    roomId: existing.roomId,
    assignedTableId: existing.assignedTableId,
    pos: existing.pos,
    rotY: existing.rotY,
    isOnline,
    mode: existing.mode,
  });
}
// --------------------
// pot comment helpers
// --------------------
function parsePotCommentRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    roomId: row.roomId,
    tableId: row.tableId,
    authorSerial: row.authorSerial,
    authorName: row.authorName ?? "",
    authorAvatarPhoto: row.authorAvatarPhoto ?? "",
    content: row.content ?? "",
    isOwner: !!row.isOwner,
    createdAt: row.createdAt,
  };
}
const insertPotCommentStmt = db.prepare(`
  INSERT INTO pot_comments (
    room_id,
    table_id,
    author_serial,
    author_name,
    author_avatar_photo,
    content,
    is_owner,
    created_at
  )
  VALUES (
    @roomId,
    @tableId,
    @authorSerial,
    @authorName,
    @authorAvatarPhoto,
    @content,
    @isOwner,
    @createdAt
  )
`);

const listPotCommentsByRoomAndTableStmt = db.prepare(`
  SELECT
    id,
    room_id as roomId,
    table_id as tableId,
    author_serial as authorSerial,
    author_name as authorName,
    author_avatar_photo as authorAvatarPhoto,
    content,
    is_owner as isOwner,
    created_at as createdAt
  FROM pot_comments
  WHERE room_id = ? AND table_id = ?
  ORDER BY created_at ASC
`);

const listRecentPotCommentsByRoomAndTableStmt = db.prepare(`
  SELECT
    id,
    room_id as roomId,
    table_id as tableId,
    author_serial as authorSerial,
    author_name as authorName,
    author_avatar_photo as authorAvatarPhoto,
    content,
    is_owner as isOwner,
    created_at as createdAt
  FROM pot_comments
  WHERE room_id = ? AND table_id = ?
  ORDER BY created_at DESC
  LIMIT ?
`);
export function createPotComment(input) {
  if (!input?.roomId) {
    throw new Error("createPotComment: roomId is required");
  }
  if (!input?.tableId) {
    throw new Error("createPotComment: tableId is required");
  }
  if (!input?.authorSerial) {
    throw new Error("createPotComment: authorSerial is required");
  }
  if (!input?.content || !String(input.content).trim()) {
    throw new Error("createPotComment: content is required");
  }

  const row = {
    roomId: input.roomId,
    tableId: input.tableId,
    authorSerial: input.authorSerial,
    authorName: input.authorName ?? "",
    authorAvatarPhoto: input.authorAvatarPhoto ?? "",
    content: String(input.content).trim().slice(0, 200),
    isOwner: input.isOwner ? 1 : 0,
    createdAt: Date.now(),
  };

  const result = insertPotCommentStmt.run(row);

  return db.prepare(`
    SELECT
      id,
      room_id as roomId,
      table_id as tableId,
      author_serial as authorSerial,
      author_name as authorName,
      author_avatar_photo as authorAvatarPhoto,
      content,
      is_owner as isOwner,
      created_at as createdAt
    FROM pot_comments
    WHERE id = ?
  `).get(result.lastInsertRowid);
}

export function listPotCommentsByRoomAndTable(roomId, tableId) {
  return listPotCommentsByRoomAndTableStmt
    .all(roomId, tableId)
    .map(parsePotCommentRow);
}

export function listRecentPotCommentsByRoomAndTable(roomId, tableId, limit = 5) {
  return listRecentPotCommentsByRoomAndTableStmt
    .all(roomId, tableId, limit)
    .map(parsePotCommentRow)
    .reverse();
}
// --------------------
// feedback helpers
// --------------------
function parseFeedbackRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    serial: row.serial ?? "",
    roomId: row.roomId ?? null,
    content: row.content ?? "",
    createdAt: row.createdAt,
  };
}

const insertFeedbackStmt = db.prepare(`
  INSERT INTO feedbacks (
    serial,
    room_id,
    content,
    created_at
  )
  VALUES (
    @serial,
    @roomId,
    @content,
    @createdAt
  )
`);

const listAllFeedbacksStmt = db.prepare(`
  SELECT
    id,
    serial,
    room_id as roomId,
    content,
    created_at as createdAt
  FROM feedbacks
  ORDER BY created_at DESC
`);

export function createFeedback(input) {
  if (!input?.content || !String(input.content).trim()) {
    throw new Error("createFeedback: content is required");
  }

  const row = {
    serial: input.serial ?? "",
    roomId: input.roomId ?? null,
    content: String(input.content).trim().slice(0, 500),
    createdAt: Date.now(),
  };

  const result = insertFeedbackStmt.run(row);

  return parseFeedbackRow(
    db.prepare(`
      SELECT
        id,
        serial,
        room_id as roomId,
        content,
        created_at as createdAt
      FROM feedbacks
      WHERE id = ?
    `).get(result.lastInsertRowid)
  );
}

export function listAllFeedbacks() {
  return listAllFeedbacksStmt.all().map(parseFeedbackRow);
}
// --------------------
// print job helpers
// --------------------
const insertPrintJobStmt = db.prepare(`
  INSERT INTO print_jobs (
    serial,
    room_id,
    type,
    image_data,
    status,
    created_at,
    printed_at
  )
  VALUES (
    @serial,
    @roomId,
    @type,
    @imageData,
    @status,
    @createdAt,
    @printedAt
  )
`);

const listPendingPrintJobsStmt = db.prepare(`
  SELECT
    id,
    serial,
    room_id as roomId,
    type,
    image_data as imageData,
    status,
    created_at as createdAt,
    printed_at as printedAt
  FROM print_jobs
  WHERE status = 'pending'
  ORDER BY created_at ASC
`);

const getPrintJobByIdStmt = db.prepare(`
  SELECT
    id,
    serial,
    room_id as roomId,
    type,
    image_data as imageData,
    status,
    created_at as createdAt,
    printed_at as printedAt
  FROM print_jobs
  WHERE id = ?
`);

const markPrintJobPrintedStmt = db.prepare(`
  UPDATE print_jobs
  SET status = 'printed',
      printed_at = @printedAt
  WHERE id = @id
`);

function parsePrintJobRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    serial: row.serial,
    roomId: row.roomId ?? null,
    type: row.type,
    imageData: row.imageData,
    status: row.status,
    createdAt: row.createdAt,
    printedAt: row.printedAt ?? null,
  };
}

export function createPrintJob(input) {
  if (!input?.serial) {
    throw new Error("createPrintJob: serial is required");
  }
  if (!input?.type) {
    throw new Error("createPrintJob: type is required");
  }
  if (!input?.imageData) {
    throw new Error("createPrintJob: imageData is required");
  }

  const row = {
    serial: input.serial,
    roomId: input.roomId ?? null,
    type: input.type,
    imageData: input.imageData,
    status: "pending",
    createdAt: Date.now(),
    printedAt: null,
  };

  const result = insertPrintJobStmt.run(row);
  return getPrintJobById(result.lastInsertRowid);
}

export function getPrintJobById(id) {
  return parsePrintJobRow(getPrintJobByIdStmt.get(id));
}

export function listPendingPrintJobs() {
  return listPendingPrintJobsStmt.all().map(parsePrintJobRow);
}

export function markPrintJobPrinted(id) {
  const printedAt = Date.now();
  markPrintJobPrintedStmt.run({ id, printedAt });
  return getPrintJobById(id);
}

export default db;