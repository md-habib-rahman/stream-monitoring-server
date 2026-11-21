require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const pool = require("./config/db");
const streamRoutes = require("./routes/streamRoutes");
const eventRoutes = require("./routes/eventRoutes");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const alertRecipientRoutes = require("./routes/alertRecipientRoutes");
const infrastructureRoutes = require("./routes/infrastructureRoutes");
const { createTbsRouter } = require("./routes/tbsRoutes");
const tbsDeviceRepository = require("./repositories/tbsDeviceRepository");
const TbsClient = require("./services/tbs/TbsClient");
const TbsManager = require("./services/tbs/tbsManager");

const { getAllChannels } = require("./repositories/channelRepository");
const uploadRoutes = require("./routes/uploadRoutes");
const authenticatedToken = require("./middleware/authMiddleware");

const { monitorStreams, getStatus } = require("./monitor/streamMonitor");

const tbsManager = new TbsManager({
  deviceRepository: tbsDeviceRepository,
  clientFactory: (device) => new TbsClient(device),
});

const app = express();
app.use(express.json());

app.use(cors());

const server = http.createServer(app);

const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error("Unauthorized"));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query(
      `
      SELECT id, username, role, enabled, token_version
      FROM users
      WHERE id = $1
      `,
      [decoded.id],
    );
    const user = result.rows[0];

    if (
      !user ||
      user.enabled === false ||
      (decoded.tokenVersion || 0) !== (user.token_version || 0)
    ) {
      return next(new Error("Unauthorized"));
    }

    socket.data.user = {
      id: user.id,
      username: user.username,
      role: String(user.role || "USER").toUpperCase(),
    };
    next();
  } catch (error) {
    console.error("Socket authentication failed:", error);
    next(new Error("Unauthorized"));
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/alert-recipients", alertRecipientRoutes);
app.use("/api/infrastructure", infrastructureRoutes);
app.use("/api/tbs", createTbsRouter({ manager: tbsManager }));
app.use("/api/channels", streamRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/events", eventRoutes);

async function startMonitoring() {
  while (true) {
    try {
      await monitorStreams();
      io.emit("stream-update", getStatus());
    } catch (err) {
      console.error("[Monitor Error]", err);
    }

    await new Promise((resolve) => setTimeout(resolve, 60000));
  }
}

app.get("/api/streams", authenticatedToken, (req, res) => {
  res.json(getStatus());
});

startMonitoring().catch((error) => {
  console.error("HLS stream monitoring failed:", error);
});
tbsManager.loadFromDatabase().catch((error) => {
  console.error("TBS device registry failed to load:", error);
});

server.listen(3001, "127.0.0.1", () => {
  console.log("Server running on port 3001");
});
