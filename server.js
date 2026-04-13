import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import {
  getProfileBySerial,
  saveProfile,
  listAllPots,
  saveTablePot,
  getNextSerialNumberFallback,
  listAllAvatarPresences,
  saveAvatarPresence,
  setAvatarPresenceOnline,
} from "./db.js";

console.log("[server] boot", new Date().toISOString());

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  process.env.CLIENT_ORIGIN,
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST"],
}));

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});

app.get("/health", (_, res) => res.send("ok"));
app.get("/profiles/:serial", (req, res) => {
  try {
    const rawSerial =
      typeof req.params.serial === "string" ? req.params.serial.trim() : "";

    if (!rawSerial) {
      return res.status(400).json({
        ok: false,
        error: "missing serial",
      });
    }

    const profile = getProfileBySerial(rawSerial);

    if (!profile) {
      return res.status(404).json({
        ok: false,
        error: "profile not found",
      });
    }

    return res.json({
      ok: true,
      profile,
    });
  } catch (err) {
    console.error("[GET /profiles/:serial] failed:", err);
    return res.status(500).json({
      ok: false,
      error: "get profile failed",
    });
  }
});

const room = {
  players: new Map(),          // socket.id -> player
  seats: new Map(),            // seatKey -> { seatKey, occupiedBy }
  serialBySocketId: new Map(), // socket.id -> serial
  tablePots: new Map(),        // tableId -> saved pot state (memory cache)
  nextSerialId: 1,
};

// -------------------------
// bootstrap DB cache
// -------------------------
for (const pot of listAllPots()) {
  room.tablePots.set(pot.tableId, pot);
}
room.nextSerialId = getNextSerialNumberFallback();

console.log("[server] loaded pots from DB:", room.tablePots.size);
console.log("[server] nextSerialId:", room.nextSerialId);

// -------------------------
// helpers
// -------------------------
function pad(num, len) {
  return String(num).padStart(len, "0");
}

function formatSerial(id) {
  return `P${pad(id, 6)}`;
}

function mapSerialToTable(serial, tableCount = 8) {
  const num = parseInt(String(serial).replace(/^P/i, ""), 10);
  if (!Number.isFinite(num) || num <= 0) return null;
  const tableIndex = ((num - 1) % tableCount) + 1;
  return `table${tableIndex}`;
}

function allocateSerial() {
  const id = room.nextSerialId++;
  return {
    id,
    serial: formatSerial(id),
  };
}

function getSeat(seatKey) {
  if (!room.seats.has(seatKey)) {
    room.seats.set(seatKey, { seatKey, occupiedBy: null });
  }
  return room.seats.get(seatKey);
}

function sanitizeProfileInput(input = {}) {
  return {
    serial: typeof input.serial === "string" ? input.serial.trim() : "",
    name: typeof input.name === "string" ? input.name.trim().slice(0, 40) : "",
    message: typeof input.message === "string" ? input.message.slice(0, 300) : "",
    avatarPhoto: typeof input.avatarPhoto === "string" ? input.avatarPhoto : null,
    signature: typeof input.signature === "string" ? input.signature : null,
    assignedTableId:
      typeof input.assignedTableId === "string" ? input.assignedTableId : null,
  };
}

function buildNewProfile(input = {}) {
  const clean = sanitizeProfileInput(input);
  const { serial } = allocateSerial();
  const assignedTableId = mapSerialToTable(serial);

  return {
    serial,
    assignedTableId,
    name: clean.name || "anon",
    message: clean.message || "",
    avatarPhoto: clean.avatarPhoto || null,
    signature: clean.signature || null,
  };
}

function mergeProfile(existing, input = {}) {
  const clean = sanitizeProfileInput(input);

  return {
    serial: existing.serial,
    assignedTableId:
      clean.assignedTableId || existing.assignedTableId || mapSerialToTable(existing.serial),
    name:
      clean.name !== "" ? clean.name : (existing.name || "anon"),
    message:
      clean.message !== "" ? clean.message : (existing.message || ""),
    avatarPhoto:
      clean.avatarPhoto !== null ? clean.avatarPhoto : (existing.avatarPhoto ?? null),
    signature:
      clean.signature !== null ? clean.signature : (existing.signature ?? null),
  };
}

function getSocketProfile(socketId) {
  const serial = room.serialBySocketId.get(socketId);
  if (!serial) return null;
  return getProfileBySerial(serial);
}

function sanitizePotPayload(input = {}) {
  return {
    tableId: typeof input.tableId === "string" ? input.tableId : null,
    tableState:
      input.tableState && typeof input.tableState === "object"
        ? input.tableState
        : null,
    finalPotTextureUrl:
      typeof input.finalPotTextureUrl === "string"
        ? input.finalPotTextureUrl
        : null,
    chairCount: Number.isFinite(Number(input.chairCount))
      ? Number(input.chairCount)
      : 1,
    chairColor:
      typeof input.chairColor === "string"
        ? input.chairColor
        : "#e8f25a",
  };
}

function buildSnapshot() {
  const onlineSerials = new Set(
    Array.from(room.players.values())
      .map((p) => p.profile?.serial)
      .filter(Boolean)
  );

  const offlineAvatars = listAllAvatarPresences()
    .filter((a) => !onlineSerials.has(a.serial))
    .map((a) => {
      const profile = getProfileBySerial(a.serial);
      return {
        serial: a.serial,
        assignedTableId: a.assignedTableId,
        pos: a.pos,
        rotY: a.rotY ?? 0,
        isOnline: false,
        mode: a.mode ?? "static",
        profile,
      };
    })
    .filter((a) => !!a.profile);

  return {
    roomId: "lobby",
    players: Array.from(room.players.values()),
    seats: Array.from(room.seats.values()),
    pots: Array.from(room.tablePots.values()),
    offlineAvatars,
  };
}

function updateRoomPlayerProfile(socketId, profile) {
  const p = room.players.get(socketId);
  if (!p) return;
  p.profile = profile;
  p.name = profile?.name ?? p.name ?? "anon";
}

// -------------------------
// socket
// -------------------------
io.on("connection", (socket) => {
  console.log("socket connected:", socket.id);

  socket.onAny((event, ...args) => {
    if (event === "player:move" || event === "ping") return;
    console.log("[onAny]", event, "argsLen=", args.length);
  });

  // =========================
  // 1) White room: create/update formal identity
  // =========================
  socket.on("registerProfile", (profileInput = {}, ack) => {
    try {
      const clean = sanitizeProfileInput(profileInput);
      let profile = null;

      // 有 serial -> 更新既有
      if (clean.serial) {
        const existing = getProfileBySerial(clean.serial);
        if (existing) {
          profile = saveProfile(mergeProfile(existing, clean));
        }
      }

      // 沒 serial 或查無資料 -> 建新身份
      if (!profile) {
        profile = saveProfile(buildNewProfile(clean));
      }

      room.serialBySocketId.set(socket.id, profile.serial);
      updateRoomPlayerProfile(socket.id, profile);

      console.log(
        "[registerProfile]",
        socket.id,
        profile.name,
        profile.serial,
        profile.assignedTableId
      );

      ack?.({
        ok: true,
        profile,
      });
    } catch (err) {
      console.error("[registerProfile] failed:", err);
      ack?.({
        ok: false,
        error: "registerProfile failed",
      });
    }
  });

  // =========================
  // 1.5) Fetch full profile by serial
  // =========================
  socket.on("getProfile", ({ serial } = {}, ack) => {
    try {
      const cleanSerial =
        typeof serial === "string" ? serial.trim() : "";

      if (!cleanSerial) {
        return ack?.({ ok: false, error: "missing serial" });
      }

      const profile = getProfileBySerial(cleanSerial);
      if (!profile) {
        return ack?.({ ok: false, error: "profile not found" });
      }

      room.serialBySocketId.set(socket.id, profile.serial);
      updateRoomPlayerProfile(socket.id, profile);

      ack?.({
        ok: true,
        profile,
      });
    } catch (err) {
      console.error("[getProfile] failed:", err);
      ack?.({
        ok: false,
        error: "getProfile failed",
      });
    }
  });

  // =========================
  // 2) Hall: join room with DB-first trusted profile
  // =========================
  socket.on("join", (profileInput = {}, ack) => {
    try {
      const clean = sanitizeProfileInput(profileInput);
      let finalProfile = null;

      // a. 優先從 serial 取 DB 完整資料
      if (clean.serial) {
        finalProfile = getProfileBySerial(clean.serial);
      }

      // b. 沒 serial 再看 socket 之前是否已綁定
      if (!finalProfile) {
        finalProfile = getSocketProfile(socket.id);
      }

      // c. 都沒有才建立新 profile
      if (!finalProfile) {
        finalProfile = saveProfile(buildNewProfile(clean));
        console.warn("[join] auto-registered fallback profile for", socket.id);
      }

      room.serialBySocketId.set(socket.id, finalProfile.serial);

      console.log(
        "[join]",
        socket.id,
        finalProfile.name,
        finalProfile.serial,
        finalProfile.assignedTableId
      );

      const existingPlayer = room.players.get(socket.id);

      const player = {
        id: socket.id,
        name: finalProfile.name ?? "anon",
        pos: existingPlayer?.pos ?? { x: 0, y: 1.6, z: 0 },
        rotY: existingPlayer?.rotY ?? 0,
        profile: finalProfile,
      };

      room.players.set(socket.id, player);

      saveAvatarPresence({
        serial: finalProfile.serial,
        assignedTableId: finalProfile.assignedTableId,
        pos: player.pos,
        rotY: player.rotY,
        isOnline: true,
        mode: "static",
      });

      ack?.({
        ok: true,
        self: {
          id: socket.id,
          profile: finalProfile,
        },
        other: Array.from(room.players.values()).filter((p) => p.id !== socket.id),
      });

      socket.emit("snapshot", buildSnapshot());

      socket.broadcast.emit("player:join", {
        id: player.id,
        pos: player.pos,
        rotY: player.rotY,
        profile: player.profile,
      });
    } catch (err) {
      console.error("[join] failed:", err);
      ack?.({
        ok: false,
        error: "join failed",
      });
    }
  });

  socket.on("player:move", (payload = {}) => {
    const p = room.players.get(socket.id);
    if (!p) return;
    if (!payload?.pos) return;

    p.pos = payload.pos;
    p.rotY = payload.rotY ?? 0;

    if (payload.profile && typeof payload.profile === "object") {
      p.profile = mergeProfile(p.profile || {}, payload.profile);
      p.name = p.profile?.name ?? p.name ?? "anon";
    }

    if (p.profile?.serial) {
      saveAvatarPresence({
        serial: p.profile.serial,
        assignedTableId: p.profile.assignedTableId,
        pos: p.pos,
        rotY: p.rotY,
        isOnline: true,
        mode: "static",
      });
    }

    socket.broadcast.emit("player:move", {
      id: socket.id,
      pos: p.pos,
      rotY: p.rotY,
      profile: p.profile,
    });
  });

  socket.on("requestSitSeat", ({ seatKey }) => {
    const p = room.players.get(socket.id);
    if (!p || !seatKey) return;

    const seat = getSeat(seatKey);

    if (seat.occupiedBy && seat.occupiedBy !== socket.id) {
      socket.emit("sitDenied", {
        seatKey,
        reason: "occupied",
        occupiedBy: seat.occupiedBy,
      });
      return;
    }

    seat.occupiedBy = socket.id;
    room.seats.set(seatKey, seat);

    io.emit("seatUpdated", seat);
    console.log("[seat] occupied", seatKey, "by", socket.id);
  });

  socket.on("requestUnseat", ({ seatKey }) => {
    const p = room.players.get(socket.id);
    if (!p || !seatKey) return;

    const seat = room.seats.get(seatKey);
    if (!seat) return;
    if (seat.occupiedBy !== socket.id) return;

    seat.occupiedBy = null;
    room.seats.set(seatKey, seat);

    io.emit("seatUpdated", seat);
    console.log("[seat] released", seatKey, "by", socket.id);
  });

  // =========================
  // 3) Pot state save / sync
  // =========================
  socket.on("pot:save", (payload = {}, ack) => {
    try {
      const clean = sanitizePotPayload(payload);

      if (!clean.tableId) {
        ack?.({ ok: false, error: "missing tableId" });
        return;
      }

      const saved = saveTablePot(clean);
      room.tablePots.set(saved.tableId, saved);

      console.log("[pot:save]", saved.tableId, {
        chairCount: saved.chairCount,
        hasTexture: !!saved.finalPotTextureUrl,
        initialized: !!saved.tableState?.initialized,
      });

      io.emit("pot:updated", saved);

      ack?.({ ok: true, pot: saved });
    } catch (err) {
      console.error("[pot:save] failed:", err);
      ack?.({ ok: false, error: "pot:save failed" });
    }
  });

  socket.on("disconnect", () => {
    const p = room.players.get(socket.id);
    const serial = room.serialBySocketId.get(socket.id);

    if (p?.profile?.serial || serial) {
      const finalSerial = p?.profile?.serial || serial;
      const finalAssignedTableId =
        p?.profile?.assignedTableId ||
        getProfileBySerial(finalSerial)?.assignedTableId ||
        null;

      setAvatarPresenceOnline(finalSerial, false);

      // 如果這個人從來沒存過位置，補存一次
      if (p?.pos) {
        saveAvatarPresence({
          serial: finalSerial,
          assignedTableId: finalAssignedTableId,
          pos: p.pos,
          rotY: p.rotY ?? 0,
          isOnline: false,
          mode: "static",
        });
      }
    }

    room.players.delete(socket.id);

    for (const [k, seat] of room.seats.entries()) {
      if (seat.occupiedBy === socket.id) {
        seat.occupiedBy = null;
        room.seats.set(k, seat);
        io.emit("seatUpdated", seat);
      }
    }

    room.serialBySocketId.delete(socket.id);

    socket.broadcast.emit("player:leave", { id: socket.id });
    console.log("socket disconnected:", socket.id);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Socket server listening on port ${PORT}`);
});