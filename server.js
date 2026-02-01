import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });

app.get("/health", (_, res) => res.send("ok"));

// --- 單房 lobby：之後要多房再擴 ---
const room = {
  players: new Map(),     // socket.id -> player
  seats: new Map(),       // seatKey -> { seatKey, occupiedBy }
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

  // ---- join：前端 emit("join", profile, ackCb) ----
  socket.on("join", (profile = {}, ack) => {
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

    // 給自己 snapshot（你前端有 socket.on("snapshot")）
    socket.emit("snapshot", {
    roomId: "lobby",                 
    players: Array.from(room.players.values()),
    seats: Array.from(room.seats.values()),
    pots: {},                        
    });


    // 通知其他人（你前端有 socket.on("player:join")）
    socket.broadcast.emit("player:join", {
      id: player.id,
      pos: player.pos,
      rotY: player.rotY,
    });
  });

  // ---- 玩家移動：事件名要對齊前端 "player:move" ----
  socket.on("player:move", (payload) => {
    const p = room.players.get(socket.id);
    if (!p) return;
    p.pos = payload.pos;
    p.rotY = payload.rotY;

    // 注意：你的前端在 listen "player:move"（沒有空白）
    socket.broadcast.emit("player:move", {
      id: socket.id,
      pos: p.pos,
      rotY: p.rotY,
    });
  });

  // ---- 坐下：前端 emit("requestSitSeat", { seatKey }) ----
  socket.on("requestSitSeat", ({ seatKey }) => {
    const p = room.players.get(socket.id);
    if (!p) return;
    if (!seatKey) return;

    const seat = getSeat(seatKey);

    // 被別人占了 → 拒絕（前端可選擇處理 sitDenied）
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

  // ---- 起身：前端 emit("requestUnseat", { seatKey }) ----
  socket.on("requestUnseat", ({ seatKey }) => {
    const p = room.players.get(socket.id);
    if (!p) return;
    if (!seatKey) return;

    const seat = room.seats.get(seatKey);
    if (!seat) return;
    if (seat.occupiedBy !== socket.id) return;

    seat.occupiedBy = null;
    room.seats.set(seatKey, seat);

    io.emit("seatUpdated", seat);
    console.log("[seat] released", seatKey, "by", socket.id);
  });

  socket.on("disconnect", () => {
    const p = room.players.get(socket.id);
    room.players.delete(socket.id);

    // 釋放這個玩家占用的所有 seat
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

server.listen(3001, () => {
  console.log("Socket server on http://localhost:3001");
});

