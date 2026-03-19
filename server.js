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
  players: new Map(),
  seats: new Map(),
};

function getSeat(seatKey) {
  if (!room.seats.has(seatKey)) {
    room.seats.set(seatKey, { seatKey, occupiedBy: null });
  }
  return room.seats.get(seatKey);
}

io.on("connection", (socket) => {
  console.log("socket connected:", socket.id);

  socket.onAny((event, ...args) => {
    console.log("[onAny]", event, "argsLen=", args.length);
  });

  socket.on("join", (profile = {}, ack) => {
    console.log("[join]", socket.id, profile?.name, profile?.serial);
    const player = {
      id: socket.id,
      name: profile?.name ?? "anon",
      pos: { x: 0, y: 1.6, z: 0 },
      rotY: 0,
      profile,
    };

    room.players.set(socket.id, player);

    if (typeof ack === "function") {
      ack({
        self: { id: socket.id },
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

    socket.broadcast.emit("player:leave", { id: socket.id });
    console.log("socket disconnected:", socket.id);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Socket server listening on port ${PORT}`);
});