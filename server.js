require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const pool = require("./config/db");
const streamRoutes = require("./routes/streamRoutes");
const eventRoutes = require("./routes/eventRoutes");
const authRoutes = require("./routes/authRoutes");

const { getAllChannels } = require("./repositories/channelRepository");
const uploadRoutes = require("./routes/uploadRoutes");

const { monitorStreams, getStatus } = require("./monitor/streamMonitor");

const app = express();
app.use(express.json());

app.use(cors());

const server = http.createServer(app);

const { Server } = require("socket.io");

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

app.use("/api/auth", authRoutes);
app.use("/api/channels", streamRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/events", eventRoutes);

async function startMonitoring() {
  while (true) {
    await monitorStreams();

    io.emit("stream-update", getStatus());

    await new Promise((resolve) => setTimeout(resolve, 30000));
  }
}

startMonitoring();

app.get("/api/streams", (req, res) => {
  res.json(getStatus());
});

server.listen(3001, () => {
  console.log("Server running on port 3001");
});
