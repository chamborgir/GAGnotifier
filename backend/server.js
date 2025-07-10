import express from "express";
import { WebSocketServer } from "ws";
import WebSocket from "ws";
import http from "http";
import cors from "cors";

const PORT = 3001;
const DISCORD_ID = "911260968980447293";
let latestStock = [];

const app = express();
app.use(cors());

// REST API to get latest stock
app.get("/latest-stock", (req, res) => {
    res.json(latestStock);
});

// Create HTTP server and WebSocket server
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const clients = new Set();

// Connect to upstream Joshlei WebSocket
const upstream = new WebSocket(
    `wss://websocket.joshlei.com/growagarden?user_id=${DISCORD_ID}`
);

upstream.on("open", () => {
    console.log("✅ Connected to Joshlei WebSocket");
});

upstream.on("error", (err) => {
    console.error("⛔ Upstream error:", err.message);
});

upstream.on("close", () => {
    console.log("❌ Upstream WebSocket closed");
});

upstream.on("message", (data) => {
    try {
        const parsed = JSON.parse(data);
        if (parsed?.stock) {
            latestStock = parsed.stock;
            console.log(`📦 Stock updated (${latestStock.length} items)`);

            // Send update to all connected frontend clients
            for (const client of clients) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ stock: latestStock }));
                }
            }
        }
    } catch (e) {
        console.error("⚠️ Error parsing message from upstream:", e);
    }
});

// Handle WebSocket connections from frontend
wss.on("connection", (ws) => {
    console.log("📡 Frontend WebSocket connected");
    clients.add(ws);

    // Send current stock right away
    try {
        ws.send(JSON.stringify({ stock: latestStock }));
    } catch (e) {
        console.warn("⚠️ Failed to send initial stock:", e.message);
    }

    ws.on("close", () => {
        clients.delete(ws);
        console.log("❌ Frontend WebSocket disconnected");
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Backend server listening on http://localhost:${PORT}`);
});
