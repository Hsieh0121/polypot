import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import {
  getProfileBySerial,
  getPotByRoomAndTableId,
  saveProfile,
  saveTablePot,
  getNextSerialNumberFallback,
  listAllPotsByRoom,
  listAllAvatarPresencesByRoom,
  saveAvatarPresence,
  setAvatarPresenceOnline,
  createPrintJob,
  listPendingPrintJobs,
  markPrintJobPrinted,
  createPotComment,
  listPotCommentsByRoomAndTable,
  listRecentPotCommentsByRoomAndTable,
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

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  })
);
app.use(express.json({ limit: "15mb" }));

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
app.get("/print-data/:serial", (req, res) => {
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

    const roomId = profile.roomId;
    const tableId = profile.assignedTableId;

    const pot =
      roomId && tableId
        ? getPotByRoomAndTableId(roomId, tableId)
        : null;

    return res.json({
      ok: true,
      profile,
      pot,
    });
  } catch (err) {
    console.error("[GET /print-data/:serial] failed:", err);
    return res.status(500).json({
      ok: false,
      error: "get print-data failed",
    });
  }
});
app.post("/print-jobs", (req, res) => {
  try {
    const serial =
      typeof req.body?.serial === "string" ? req.body.serial.trim() : "";
    const type =
      typeof req.body?.type === "string" ? req.body.type.trim() : "";
    const imageData =
      typeof req.body?.imageData === "string" ? req.body.imageData : "";

    if (!serial || !type || !imageData) {
      return res.status(400).json({
        ok: false,
        error: "missing fields",
      });
    }

    if (type !== "id" && type !== "pot") {
      return res.status(400).json({
        ok: false,
        error: "invalid print type",
      });
    }

    const profile = getProfileBySerial(serial);
    if (!profile) {
      return res.status(404).json({
        ok: false,
        error: "profile not found",
      });
    }

    const job = createPrintJob({
      serial,
      roomId: profile.roomId ?? null,
      type,
      imageData,
    });

    return res.json({
      ok: true,
      job,
    });
  } catch (err) {
    console.error("[POST /print-jobs] failed:", err);
    return res.status(500).json({
      ok: false,
      error: "create print job failed",
    });
  }
});
app.get("/print-jobs", (_, res) => {
  try {
    const jobs = listPendingPrintJobs();
    return res.json({
      ok: true,
      jobs,
    });
  } catch (err) {
    console.error("[GET /print-jobs] failed:", err);
    return res.status(500).json({
      ok: false,
      error: "list print jobs failed",
    });
  }
});
app.post("/print-jobs/:id/printed", (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({
        ok: false,
        error: "invalid id",
      });
    }

    const job = markPrintJobPrinted(id);

    return res.json({
      ok: true,
      job,
    });
  } catch (err) {
    console.error("[POST /print-jobs/:id/printed] failed:", err);
    return res.status(500).json({
      ok: false,
      error: "mark print job printed failed",
    });
  }
});

app.get("/tables/:roomId/:tableId/comments", (req, res) => {
  try {
    const roomId =
      typeof req.params.roomId === "string" ? req.params.roomId.trim() : "";
    const tableId =
      typeof req.params.tableId === "string" ? req.params.tableId.trim() : "";
    const recent =
      typeof req.query.recent === "string" ? req.query.recent.trim() : "";

    if (!roomId || !tableId) {
      return res.status(400).json({
        ok: false,
        error: "missing roomId or tableId",
      });
    }

    const comments =
      recent === "1"
        ? listRecentPotCommentsByRoomAndTable(roomId, tableId, 5)
        : listPotCommentsByRoomAndTable(roomId, tableId);

    return res.json({
      ok: true,
      comments,
    });
  } catch (err) {
    console.error("[GET /tables/:roomId/:tableId/comments] failed:", err);
    return res.status(500).json({
      ok: false,
      error: "get comments failed",
    });
  }
});
app.post("/tables/:roomId/:tableId/comments", (req, res) => {
  try {
    const roomId =
      typeof req.params.roomId === "string" ? req.params.roomId.trim() : "";
    const tableId =
      typeof req.params.tableId === "string" ? req.params.tableId.trim() : "";
    const authorSerial =
      typeof req.body?.authorSerial === "string" ? req.body.authorSerial.trim() : "";
    const content =
      typeof req.body?.content === "string" ? req.body.content.trim() : "";

    if (!roomId || !tableId || !authorSerial || !content) {
      return res.status(400).json({
        ok: false,
        error: "missing fields",
      });
    }

    const authorProfile = getProfileBySerial(authorSerial);
    if (!authorProfile) {
      return res.status(404).json({
        ok: false,
        error: "author profile not found",
      });
    }

    const ownerProfile = dbPrepareOwnerProfile(roomId, tableId);

    const comment = createPotComment({
      roomId,
      tableId,
      authorSerial,
      authorName: authorProfile.name ?? "",
      authorAvatarPhoto: authorProfile.avatarPhoto ?? "",
      content,
      isOwner: ownerProfile?.serial === authorSerial,
    });

    return res.json({
      ok: true,
      comment,
    });
  } catch (err) {
    console.error("[POST /tables/:roomId/:tableId/comments] failed:", err);
    return res.status(500).json({
      ok: false,
      error: "create comment failed",
    });
  }
});
// -------------------------
// state
// -------------------------
const state = {
  serialBySocketId: new Map(), // socket.id -> serial
  socketRoomId: new Map(),     // socket.id -> roomId
  rooms: new Map(),            // roomId -> { players, seats, tablePots, hydrated }
  nextSerialId: 1,
};

state.nextSerialId = getNextSerialNumberFallback();

console.log("[server] nextSerialId:", state.nextSerialId);

// -------------------------
// helpers
// -------------------------
function pad(num, len) {
  return String(num).padStart(len, "0");
}

function formatSerial(id) {
  return `P${pad(id, 6)}`;
}

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

function allocateSerial() {
  const id = state.nextSerialId++;
  return {
    id,
    serial: formatSerial(id),
  };
}

function ensureRoom(roomId) {
  if (!roomId) throw new Error("ensureRoom: roomId is required");

  if (!state.rooms.has(roomId)) {
    state.rooms.set(roomId, {
      players: new Map(),   // socket.id -> player
      seats: new Map(),     // seatKey -> { seatKey, occupiedBy }
      tablePots: new Map(), // tableId -> pot
      hydrated: false,
    });
  }

  return state.rooms.get(roomId);
}

function hydrateRoomFromDb(roomId) {
  const room = ensureRoom(roomId);
  if (room.hydrated) return room;

  try {
    const pots = listAllPotsByRoom(roomId);
    for (const pot of pots) {
      room.tablePots.set(pot.tableId, pot);
    }
    console.log(`[room hydrate] ${roomId} loaded pots:`, pots.length);
  } catch (err) {
    console.error(`[room hydrate] failed for ${roomId}:`, err);
  }

  room.hydrated = true;
  return room;
}

function getSeat(roomId, seatKey) {
  const room = ensureRoom(roomId);
  if (!room.seats.has(seatKey)) {
    room.seats.set(seatKey, { seatKey, occupiedBy: null });
  }
  return room.seats.get(seatKey);
}

function sanitizeProfileInput(input = {}) {
  return {
    serial: typeof input.serial === "string" ? input.serial.trim() : "",
    roomId: typeof input.roomId === "string" ? input.roomId.trim() : "",
    name: typeof input.name === "string" ? input.name.trim().slice(0, 40) : "",
    message: typeof input.message === "string" ? input.message.slice(0, 300) : "",
    avatarPhoto: typeof input.avatarPhoto === "string" ? input.avatarPhoto : null,
    signature: typeof input.signature === "string" ? input.signature : null,
    idCardSnapshot:
      typeof input.idCardSnapshot === "string" ? input.idCardSnapshot : null,
    assignedTableId:
      typeof input.assignedTableId === "string" ? input.assignedTableId : null,
  };
}

function buildNewProfile(input = {}) {
  const clean = sanitizeProfileInput(input);
  const { serial } = allocateSerial();

  const roomId = mapSerialToRoom(serial);
  const assignedTableId = mapSerialToTable(serial);

  return {
    serial,
    roomId,
    assignedTableId,
    name: clean.name || "anon",
    message: clean.message || "",
    avatarPhoto: clean.avatarPhoto || null,
    signature: clean.signature || null,
    idCardSnapshot: clean.idCardSnapshot || null,
  };
}

function mergeProfile(existing, input = {}) {
  const clean = sanitizeProfileInput(input);

  return {
    serial: existing.serial,
    roomId: clean.roomId || existing.roomId || mapSerialToRoom(existing.serial),
    assignedTableId:
      clean.assignedTableId ||
      existing.assignedTableId ||
      mapSerialToTable(existing.serial),
    name: clean.name !== "" ? clean.name : existing.name || "anon",
    message: clean.message !== "" ? clean.message : existing.message || "",
    avatarPhoto:
      clean.avatarPhoto !== null
        ? clean.avatarPhoto
        : (existing.avatarPhoto ?? null),
    signature:
      clean.signature !== null
        ? clean.signature
        : (existing.signature ?? null),
    idCardSnapshot:
      clean.idCardSnapshot !== null
        ? clean.idCardSnapshot
        : (existing.idCardSnapshot ?? null),
  };
}

function sanitizePotPayload(input = {}) {
  const tableState =
    input.tableState && typeof input.tableState === "object"
      ? input.tableState
      : null;

  return {
    roomId: typeof input.roomId === "string" ? input.roomId : null,
    tableId: typeof input.tableId === "string" ? input.tableId : null,
    tableState,
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
        : (typeof tableState?.chairColor === "string"
            ? tableState.chairColor
            : "#e8f25a"),
    potBodyColor:
      typeof input.potBodyColor === "string"
        ? input.potBodyColor
        : (typeof tableState?.potBodyColor === "string"
            ? tableState.potBodyColor
            : "#FD6FFF"),
    potHandleColor:
      typeof input.potHandleColor === "string"
        ? input.potHandleColor
        : (typeof tableState?.potHandleColor === "string"
            ? tableState.potHandleColor
            : "#E8F25A"),
  };
}
function dbPrepareOwnerProfile(roomId, tableId) {
  if (!roomId || !tableId) return null;

  const roomNum = Number(String(roomId).replace(/^room/i, ""));
  const tableNum = Number(String(tableId).replace(/^table/i, ""));

  if (!Number.isFinite(roomNum) || !Number.isFinite(tableNum)) {
    return null;
  }

  const serialNumber = (roomNum - 1) * 8 + tableNum;
  const serial = `P${String(serialNumber).padStart(6, "0")}`;

  return getProfileBySerial(serial);
}
function getSocketProfile(socketId) {
  const serial = state.serialBySocketId.get(socketId);
  if (!serial) return null;
  return getProfileBySerial(serial);
}

function getSocketRoomId(socketId) {
  return state.socketRoomId.get(socketId) || null;
}

function updateRoomPlayerProfile(socketId, profile) {
  const roomId = getSocketRoomId(socketId);
  if (!roomId) return;

  const room = ensureRoom(roomId);
  const p = room.players.get(socketId);
  if (!p) return;

  p.profile = profile;
  p.name = profile?.name ?? p.name ?? "anon";
}

function buildSnapshot(roomId) {
  const room = ensureRoom(roomId);

  const onlineSerials = new Set(
    Array.from(room.players.values())
      .map((p) => p.profile?.serial)
      .filter(Boolean)
  );

  const offlineAvatars = listAllAvatarPresencesByRoom(roomId)
    .filter((a) => !onlineSerials.has(a.serial))
    .map((a) => {
      const profile = getProfileBySerial(a.serial);
      return {
        serial: a.serial,
        roomId: a.roomId,
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
    roomId,
    players: Array.from(room.players.values()),
    seats: Array.from(room.seats.values()),
    pots: Array.from(room.tablePots.values()),
    offlineAvatars,
  };
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

      if (clean.serial) {
        const existing = getProfileBySerial(clean.serial);
        if (existing) {
          profile = saveProfile(mergeProfile(existing, clean));
        }
      }

      if (!profile) {
        profile = saveProfile(buildNewProfile(clean));
      }

      state.serialBySocketId.set(socket.id, profile.serial);
      updateRoomPlayerProfile(socket.id, profile);

      console.log(
        "[registerProfile]",
        socket.id,
        profile.name,
        profile.serial,
        profile.roomId,
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

      if (clean.serial) {
        finalProfile = getProfileBySerial(clean.serial);
      }

      if (!finalProfile) {
        finalProfile = getSocketProfile(socket.id);
      }

      if (!finalProfile) {
        finalProfile = saveProfile(buildNewProfile(clean));
        console.warn("[join] auto-registered fallback profile for", socket.id);
      }

      const resolvedRoomId =
        finalProfile.roomId || mapSerialToRoom(finalProfile.serial);
      const resolvedTableId =
        finalProfile.assignedTableId || mapSerialToTable(finalProfile.serial);

      if (
        finalProfile.roomId !== resolvedRoomId ||
        finalProfile.assignedTableId !== resolvedTableId
      ) {
        finalProfile = saveProfile({
          ...finalProfile,
          roomId: resolvedRoomId,
          assignedTableId: resolvedTableId,
        });
      }

      const previousRoomId = getSocketRoomId(socket.id);
      if (previousRoomId && previousRoomId !== resolvedRoomId) {
        socket.leave(previousRoomId);
      }

      state.serialBySocketId.set(socket.id, finalProfile.serial);
      state.socketRoomId.set(socket.id, resolvedRoomId);

      socket.join(resolvedRoomId);

      const room = hydrateRoomFromDb(resolvedRoomId);
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
        roomId: resolvedRoomId,
        assignedTableId: finalProfile.assignedTableId,
        pos: player.pos,
        rotY: player.rotY,
        isOnline: true,
        mode: "static",
      });

      console.log(
        "[join]",
        socket.id,
        finalProfile.name,
        finalProfile.serial,
        finalProfile.roomId,
        finalProfile.assignedTableId
      );

      ack?.({
        ok: true,
        self: {
          id: socket.id,
          profile: finalProfile,
        },
        other: Array.from(room.players.values()).filter((p) => p.id !== socket.id),
      });

      socket.emit("snapshot", buildSnapshot(resolvedRoomId));

      socket.to(resolvedRoomId).emit("player:join", {
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
    const roomId = getSocketRoomId(socket.id);
    if (!roomId) return;

    const room = ensureRoom(roomId);
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
        roomId,
        assignedTableId: p.profile.assignedTableId,
        pos: p.pos,
        rotY: p.rotY,
        isOnline: true,
        mode: "static",
      });
    }

    socket.to(roomId).emit("player:move", {
      id: socket.id,
      pos: p.pos,
      rotY: p.rotY,
      profile: p.profile,
    });
  });

  socket.on("requestSitSeat", ({ seatKey }) => {
    const roomId = getSocketRoomId(socket.id);
    if (!roomId || !seatKey) return;

    const room = ensureRoom(roomId);
    const p = room.players.get(socket.id);
    if (!p) return;

    const seat = getSeat(roomId, seatKey);

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

    io.to(roomId).emit("seatUpdated", seat);
    console.log("[seat] occupied", roomId, seatKey, "by", socket.id);
  });

  socket.on("requestUnseat", ({ seatKey }) => {
    const roomId = getSocketRoomId(socket.id);
    if (!roomId || !seatKey) return;

    const room = ensureRoom(roomId);
    const p = room.players.get(socket.id);
    if (!p) return;

    const seat = room.seats.get(seatKey);
    if (!seat) return;
    if (seat.occupiedBy !== socket.id) return;

    seat.occupiedBy = null;
    room.seats.set(seatKey, seat);

    io.to(roomId).emit("seatUpdated", seat);
    console.log("[seat] released", roomId, seatKey, "by", socket.id);
  });

  // =========================
  // 3) Pot state save / sync
  // =========================
  socket.on("pot:save", (payload = {}, ack) => {
    try {
      const roomId = getSocketRoomId(socket.id);
      if (!roomId) {
        ack?.({ ok: false, error: "missing roomId" });
        return;
      }

      const clean = sanitizePotPayload(payload);

      if (!clean.tableId) {
        ack?.({ ok: false, error: "missing tableId" });
        return;
      }

      const saved = saveTablePot({
        ...clean,
        roomId,
      });

      const room = ensureRoom(roomId);
      room.tablePots.set(saved.tableId, saved);

      console.log("[pot:save]", roomId, saved.tableId, {
        chairCount: saved.chairCount,
        chairColor: saved.chairColor,
        potBodyColor: saved.potBodyColor,
        potHandleColor: saved.potHandleColor,
        hasTexture: !!saved.finalPotTextureUrl,
        initialized: !!saved.tableState?.initialized,
      });

      io.to(roomId).emit("pot:updated", saved);

      ack?.({ ok: true, pot: saved });
    } catch (err) {
      console.error("[pot:save] failed:", err);
      ack?.({ ok: false, error: "pot:save failed" });
    }
  });

  socket.on("disconnect", () => {
    const roomId = getSocketRoomId(socket.id);
    const room = roomId ? ensureRoom(roomId) : null;

    const p = room?.players.get(socket.id);
    const serial = state.serialBySocketId.get(socket.id);

    let offlinePayload = null;

    if ((p?.profile?.serial || serial) && roomId) {
      const finalSerial = p?.profile?.serial || serial;
      const dbProfile = getProfileBySerial(finalSerial);

      const finalRoomId =
        p?.profile?.roomId ||
        dbProfile?.roomId ||
        roomId;

      const finalAssignedTableId =
        p?.profile?.assignedTableId ||
        dbProfile?.assignedTableId ||
        null;

      const finalPos = p?.pos ?? { x: 0, y: 0, z: 0 };
      const finalRotY = p?.rotY ?? 0;

      setAvatarPresenceOnline(finalSerial, false);

      saveAvatarPresence({
        serial: finalSerial,
        roomId: finalRoomId,
        assignedTableId: finalAssignedTableId,
        pos: finalPos,
        rotY: finalRotY,
        isOnline: false,
        mode: "static",
      });

      const freshProfile = getProfileBySerial(finalSerial);

      offlinePayload = {
        serial: finalSerial,
        roomId: finalRoomId,
        assignedTableId: finalAssignedTableId,
        pos: finalPos,
        rotY: finalRotY,
        isOnline: false,
        mode: "static",
        profile: freshProfile,
      };
    }

    if (room) {
      room.players.delete(socket.id);

      for (const [k, seat] of room.seats.entries()) {
        if (seat.occupiedBy === socket.id) {
          seat.occupiedBy = null;
          room.seats.set(k, seat);
          io.to(roomId).emit("seatUpdated", seat);
        }
      }
    }

    if (roomId) {
      socket.to(roomId).emit("player:leave", { id: socket.id });

      if (offlinePayload) {
        socket.to(roomId).emit("avatar:offline", offlinePayload);
        console.log(
          "[disconnect -> avatar:offline]",
          offlinePayload.serial,
          offlinePayload.roomId,
          offlinePayload.assignedTableId
        );
      }

      socket.leave(roomId);
    }

    state.serialBySocketId.delete(socket.id);
    state.socketRoomId.delete(socket.id);

    console.log("socket disconnected:", socket.id);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Socket server listening on port ${PORT}`);
});