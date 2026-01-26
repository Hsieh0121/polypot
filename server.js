import { profile } from "console";
import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {origin: true},
});

app.get("/health", (_, res) => res.send("ok"));

const room = {
    players: new Map(),
    seats: Array.from({ length: 16 }, (_, i) => `seat_${i + 1}`),
    takenSeats: new Set(),
};

function pickSeat() {
    const candidates = room.seats.filter((s) => !room.takenSeats.has(s));
    if (candidates.length === 0) return null;
    const seat = candidates[Math.floor(Math.random() * candidates.length)];
    room.takenSeats.add(seat);
    return seat;
};

function releaseSeat (seatId) {
    if (!seatId) return;
    room.takenSeats.delete(seatId);
};

io.on("connection", (socket) => {
    socket.on("join", (profile, ack) => {
        const seatId = pickSeat();
        const player = {
            id: socket.id,
            name: profile?.name ?? "anon",
            seatId,
            pos: { x:0, y:1.6, z:0 },
            rotY: 0,
            profile: profile ?? {},
        };
        room.players.set(socket.id, player);
        ack?.({
            self: player,
            other: Array.from(room.players.values()).filter((p) => p.id !== socket.id),
        });
        socket.broadcast.emit("player: join", player);
    });
    socket.on("player:move", (payload) => {
        const p = room.players.get(socket.id);
        if (!p) return;
        p.pos = payload.pos;
        p.rotY = payload.rotY;
        socket.broadcast.emit("player:move", {
            id: socket.id,
            pos: p.pos,
            rot: p.rotY,
        });
    });
    socket.on("disconnect", () => {
        const p = room.players.get(socket.id);
        if (p) {
            releaseSeat(p.seatId);
            room.players.delete(socket.id);
            socket.broadcast.emit("player:leave", { id: socket.id });
        }
    });
});
server.listen(3001, () => {
    console.log("Socket server on http://localhost:3001");
});
