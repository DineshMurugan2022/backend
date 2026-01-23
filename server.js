require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");

const connectDB = require("./db");

const { handleTimeout } = require("./services/session");
const auth = require("./middleware/auth");
const User = require("./models/User");

const authRouter = require("./login/Auth");
const errorHandler = require("./middleware/errorHandler");

// Redis and Rate Limiting
const { initRedis, closeRedis } = require("./config/redis");
const { authLimiter, apiLimiter, uploadLimiter } = require("./middleware/rateLimiter");
const { clearCacheHandler } = require("./middleware/cache");

// Routers
const callsRouter = require("./routes/calls");
const userRoutes = require("./routes/userRoutes");
const attendanceRouter = require("./routes/attendance");
const appointmentsRouter = require("./routes/appointments");
const leadsRouter = require("./routes/leads");
const proxyRouter = require("./routes/proxy");
const tasksRouter = require("./routes/tasks");
const messagesRouter = require("./routes/messages");

const app = express();
const server = http.createServer(app);

// Socket.IO setup with enhanced configuration
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ["http://localhost:5173", "http://localhost:3000"],
    credentials: true,
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"],
  upgrade: true,
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  maxHttpBufferSize: 1e8,
  compression: true
});

// Initialize Socket.IO handlers
const setupSocketIO = require("./sockets");
setupSocketIO(io);

// Connect to MongoDB
connectDB();

// Enhanced CORS configuration for production and development
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // List of allowed origins from environment variable
    // List of allowed origins from environment variable
    const allowedOrigins = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
      : ["http://localhost:5173", "http://localhost:3000", "https://nothing-nine-neon.vercel.app", "https://frontend-eosin-zeta-66.vercel.app", "https://bnycrm1.vercel.app", "https://bnycrm.netlify.app/", "https://bnycrm1.vercel.app"];

    // Check if the origin is in our allowed list
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`⚠️ CORS Blocked: Origin ${origin} not allowed`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  exposedHeaders: ['Authorization']
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Also handle preflight requests explicitly
app.options('*', cors(corsOptions));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", "http://localhost:*", "ws://localhost:*", "wss://localhost:*", "https://backend-4jwl.onrender.com", "wss://backend-4jwl.onrender.com"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Needed for Vite/React
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "https://user-images.githubusercontent.com"],
      },
    },
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));

// Health check
app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Cache management endpoint (admin only)
app.post("/api/cache/clear", auth, clearCacheHandler);

// Admin status (authenticated)
app.get("/api/admin-status", auth, async (req, res) => {
  try {
    const isAdmin = req.user?.userGroup === "admin" || req.user?.userGroup === "team leader";
    const [totalUsers, activeUsers] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ loginStatus: "active" }),
    ]);
    res.json({ isAdmin, totalUsers, activeUsers });
  } catch (err) {
    console.error("/api/admin-status error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Create session endpoint
app.post("/api/create-session", (req, res) => {
  try {
    // Generate a random session ID
    const sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    console.log(`📋 Created new tracking session: ${sessionId}`);
    res.json({ sessionId });
  } catch (error) {
    console.error('Error creating session:', error.message);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// ----------------- ROUTES -----------------
// Apply general API rate limiting to all /api routes
app.use("/api", apiLimiter);

// Mount appointments router
app.use("/api/appointments", appointmentsRouter);

app.use("/api/leads", leadsRouter);

app.use(
  "/api/attendance",
  (req, _res, next) => {
    req.io = io; // attach io for attendance notifications
    next();
  },
  attendanceRouter
);

app.use(
  "/api/tasks",
  (req, _res, next) => {
    req.io = io; // attach io for task notifications
    next();
  },
  tasksRouter
);

// Add queries route
const queriesRouter = require("./routes/queries");
app.use("/api/queries", queriesRouter);

app.use("/api/users", userRoutes);

// Apply strict rate limiting to auth routes
app.use("/api/auth", authLimiter, authRouter);

app.use("/api/calls", callsRouter);
app.use("/api/messages", messagesRouter);
const reportsRouter = require("./routes/reports");
app.use("/api/reports", reportsRouter);
app.use("/api", proxyRouter);

// Error Handling Middleware
app.use(errorHandler);

// Serve uploads directory (both at root and under /api for compatibility)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve static files from frontend/dist (if available)
const frontendPath = path.join(__dirname, "../frontend/dist");
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));

  // Catch-all route for SPA (must be last)
  app.get("*", (req, res) => {
    const indexPath = path.join(frontendPath, "index.html");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send("Frontend build not found");
    }
  });
} else {
  // If no frontend build, catch-all returns 404 or API info
  app.get("/", (req, res) => {
    res.send("API Server Running (Frontend not served from here)");
  });
}

const cronService = require("./services/cronService");

// Initialize Huawei E173 Modem
const { connectHuaweiE173 } = require("./services/modem");
connectHuaweiE173(io);

// ----------------- CRON JOBS -----------------
// Initialize Auto-Logout Job (Runs check immediately and then hourly)
try {
  cronService.startAutoLogoutJob();
} catch (cronError) {
  console.error("FAILED to start Auto-Logout Job:", cronError);
}

// ----------------- SESSION TIMEOUT -----------------
setInterval(() => handleTimeout(), 5 * 60 * 1000);

// ----------------- REDIS INITIALIZATION -----------------
initRedis().catch(err => {
  console.error("Redis initialization error:", err.message);
  console.log("⚠️ Continuing without Redis...");
});

// ----------------- GRACEFUL SHUTDOWN -----------------
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await closeRedis();
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server');
  await closeRedis();
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 Socket.IO server ready for connections`);
});
