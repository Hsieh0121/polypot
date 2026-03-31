import express from "express";
import http from "http";
import { Server } from "socket.io";

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

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});

app.get("/health", (_, res) => res.send("ok"));

const room = {
  players: new Map(),            // socket.id -> player
  seats: new Map(),              // seatKey -> { seatKey, occupiedBy }
  profilesBySerial: new Map(),   // serial -> profile
  serialBySocketId: new Map(),   // socket.id -> serial
  nextSerialId: 1,
};

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
    name: typeof input.name === "string" ? input.name.trim().slice(0, 40) : "",
    message: typeof input.message === "string" ? input.message.slice(0, 300) : "",
    avatarPhoto: typeof input.avatarPhoto === "string" ? input.avatarPhoto : null,
    signature: typeof input.signature === "string" ? input.signature : null,
  };
}

function buildRegisteredProfile(input = {}) {
  const clean = sanitizeProfileInput(input);
  const { id, serial } = allocateSerial();
  const assignedTableId = mapSerialToTable(serial);

  return {
    id,
    serial,
    assignedTableId,
    name: clean.name || "anon",
    message: clean.message || "",
    avatarPhoto: clean.avatarPhoto || null,
    signature: clean.signature || null,
    createdAt: Date.now(),
  };
}

function getRegisteredProfileForSocket(socketId, fallbackProfile = {}) {
  const serial = room.serialBySocketId.get(socketId);
  if (!serial) return null;

  const registered = room.profilesBySerial.get(serial);
  if (!registered) return null;

  // 允許前端傳一些非關鍵欄位，但關鍵身份欄位一律以 server 為準
  return {
    ...registered,
    message:
      typeof fallbackProfile.message === "string"
        ? fallbackProfile.message
        : registered.message,
    avatarPhoto:
      typeof fallbackProfile.avatarPhoto === "string"
        ? fallbackProfile.avatarPhoto
        : registered.avatarPhoto,
    signature:
      typeof fallbackProfile.signature === "string"
        ? fallbackProfile.signature
        : registered.signature,
  };
}

io.on("connection", (socket) => {
  console.log("socket connected:", socket.id);

  socket.onAny((event, ...args) => {
    console.log("[onAny]", event, "argsLen=", args.length);
  });

  // =========================
  // 1) White room: register formal identity
  // =========================
  socket.on("registerProfile", (profileInput = {}, ack) => {
    const registeredProfile = buildRegisteredProfile(profileInput);

    room.profilesBySerial.set(registeredProfile.serial, registeredProfile);
    room.serialBySocketId.set(socket.id, registeredProfile.serial);

    console.log(
      "[registerProfile]",
      socket.id,
      registeredProfile.name,
      registeredProfile.serial,
      registeredProfile.assignedTableId
    );

    if (typeof ack === "function") {
      ack({
        ok: true,
        profile: registeredProfile,
      });
    }
  });

  // =========================
  // 2) Hall: join room with server-trusted profile
  // =========================
  socket.on("join", (profile = {}, ack) => {
    const trustedProfile = getRegisteredProfileForSocket(socket.id, profile);

    // 若還沒 registerProfile，就退回最低限度暫時身份
    const finalProfile =
      trustedProfile ||
      (() => {
        const guest = buildRegisteredProfile(profile);
        room.profilesBySerial.set(guest.serial, guest);
        room.serialBySocketId.set(socket.id, guest.serial);
        console.warn("[join] auto-registered fallback profile for", socket.id);
        return guest;
      })();

    console.log(
      "[join]",
      socket.id,
      finalProfile.name,
      finalProfile.serial,
      finalProfile.assignedTableId
    );

    const player = {
      id: socket.id,
      name: finalProfile.name ?? "anon",
      pos: { x: 0, y: 1.6, z: 0 },
      rotY: 0,
      profile: finalProfile,
    };

    room.players.set(socket.id, player);

    if (typeof ack === "function") {
      ack({
        self: {
          id: socket.id,
          profile: finalProfile,
        },
        other: Array.from(room.players.values()).filter((p) => p.id !== socket.id),
      });
    }

    socket.emit("snapshot", {
      roomId: "lobby",
      players: Array.from(room.players.values()),
      seats: Array.from(room.seats.values()),
      pots: {},
    });

    socket.broadcast.emit("player:join", {
      id: player.id,
      pos: player.pos,
      rotY: player.rotY,
      profile: player.profile,
    });
  });

  socket.on("player:move", (payload) => {
    const p = room.players.get(socket.id);
    if (!p) return;
    if (!payload?.pos) return;

    p.pos = payload.pos;
    p.rotY = payload.rotY ?? 0;

    socket.broadcast.emit("player:move", {
      id: socket.id,
      pos: p.pos,
      rotY: p.rotY,
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

  socket.on("disconnect", () => {
    room.players.delete(socket.id);

    for (const [k, seat] of room.seats.entries()) {
      if (seat.occupiedBy === socket.id) {
        seat.occupiedBy = null;
        room.seats.set(k, seat);
        io.emit("seatUpdated", seat);
      }
    }

    // 只解除 socket 與 serial 的當前綁定，不刪 profile
    room.serialBySocketId.delete(socket.id);

    socket.broadcast.emit("player:leave", { id: socket.id });
    console.log("socket disconnected:", socket.id);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Socket server listening on port ${PORT}`);
});