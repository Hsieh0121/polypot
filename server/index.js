import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());
app.get("/health", (req, res) => {
    res.send({ "ok": true });
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "http://localhost:5175",
        methods: ["GET", "POST"],
    },
});

io.on("connection", (socket) => {
    console.log("socket connected:", socket.id);
    socket.emit("server:hello", { id: socket.id, t: Date.now() });
    socket.on ("player:move", (payload) => {
        socket.broadcast.emit("player:move", { id: socket.id, ...payload });
    });
    socket.on("ping", () => {
        socket.emit("server:pong", { t: Date.now() });
    });
    socket.on("disconnect", () => {
        console.log("socket disconnected:", socket.id);
    });
});

httpServer.listen(3001, () => {
    console.log("Socket server listening on http://localhost:3001");
});

