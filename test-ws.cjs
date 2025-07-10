const WebSocket = require("ws");

const userId = "911260968980447293"; // Your Discord ID
const ws = new WebSocket(
    `wss://websocket.joshlei.com/growagarden?user_id=${userId}`
);

ws.on("open", () => {
    console.log("✅ WebSocket connection established.");
});

ws.on("message", (data) => {
    console.log("📦 New Stock Update:", data.toString());
});

ws.on("error", (err) => {
    console.error("❌ WebSocket error:", err);
});

ws.on("close", () => {
    console.log("🔌 WebSocket connection closed.");
});
