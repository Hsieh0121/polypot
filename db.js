import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const dataDir = path.resolve("./data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "polypot.sqlite");
const db = new Database(dbPath);

// 比較安全
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
    updated_at INTEGER NOT NULL
  );
`);

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
    updated_at
  )
  VALUES (
    @tableId,
    @tableStateJson,
    @finalPotTextureUrl,
    @chairCount,
    @chairColor,
    @updatedAt
  )
  ON CONFLICT(table_id) DO UPDATE SET
    table_state_json = excluded.table_state_json,
    final_pot_texture_url = excluded.final_pot_texture_url,
    chair_count = excluded.chair_count,
    chair_color = excluded.chair_color,
    updated_at = excluded.updated_at
`);

function parsePotRow(row) {
  if (!row) return null;
  return {
    tableId: row.tableId,
    tableState: row.tableStateJson ? JSON.parse(row.tableStateJson) : null,
    finalPotTextureUrl: row.finalPotTextureUrl ?? null,
    chairCount: row.chairCount ?? 0,
    chairColor: row.chairColor ?? null,
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
  const row = {
    tableId: pot.tableId,
    tableStateJson: JSON.stringify(pot.tableState ?? null),
    finalPotTextureUrl: pot.finalPotTextureUrl ?? null,
    chairCount: pot.chairCount ?? 0,
    chairColor: pot.chairColor ?? null,
    updatedAt: Date.now(),
  };

  upsertPotStmt.run(row);
  return getPotByTableId(pot.tableId);
}

export default db;