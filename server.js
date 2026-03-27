require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");
const morgan = require("morgan");
const logger = require("./utils/logger");

const connectDB = require("./db");
const { pubClient, subClient, connectRedis } = require("./services/redis");
const { createAdapter } = require("@socket.io/redis-adapter");
const cronService = require("./services/cronService");

const { handleTimeout } = require("./services/session");
const auth = require("./middleware/auth");
const User = require("./models/User");

const authRouter = require("./login/Auth");
const errorHandler = require("./middleware/errorHandler");

const { authLimiter, apiLimiter, uploadLimiter } = require("./middleware/rateLimiter");

// Routers
const callsRouter = require("./routes/calls");
const userRoutes = require("./routes/userRoutes");
const attendanceRouter = require("./routes/attendance");
const appointmentsRouter = require("./routes/appointments");
const leadsRouter = require("./routes/leads");
const proxyRouter = require("./routes/proxy");
const tasksRouter = require("./routes/tasks");
const messagesRouter = require("./routes/messages");
const telecallerLeadsRouter = require("./routes/telecaller-leads");

const app = express();

const server = http.createServer(app);

// ----------------- GLOBAL MIDDLEWARE -----------------
// 1. Trust proxy for Render
app.set('trust proxy', 1);

// 2. Logging
app.use(morgan(':method :url :status :res[content-length] - :response-time ms', { stream: logger.stream }));

// 3. SECURE CORS (Must be at the very top)
const hardcodedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://nothing-nine-neon.vercel.app",
  "https://bnycrm1.vercel.app",
  "https://frontend-eosin-zeta-66.vercel.app",
  "https://bnycrm.netlify.app"
];

const envOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : [];

const allowedOrigins = [...new Set([...hardcodedOrigins, ...envOrigins])];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(ao => ao === origin || (typeof origin === 'string' && origin.startsWith(ao)))) {
      callback(null, true);
    } else {
      console.log(`⚠️ CORS Blocked: Origin ${origin} not allowed`);
      callback(null, false); // Reject without throwing Error
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Authorization', 'Set-Cookie']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Handle global preflight

// 4. Security Headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", "http://localhost:*", "ws://localhost:*", "wss://localhost:*", "https://backend-4jwl.onrender.com", "wss://backend-4jwl.onrender.com", "https://*.onrender.com", "wss://*.cloud-connect.in:*", "https://*.cloud-connect.in:*", "https://www.googletagmanager.com", "https://www.google-analytics.com"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://www.googletagmanager.com", "https://*.googletagmanager.com", "https://www.google-analytics.com"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com", "https://user-images.githubusercontent.com", "https://www.googletagmanager.com", "https://www.google-analytics.com"],
      },
    },
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);

// 5. Body Parsing
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());
app.use(compression());

// ----------------- SOCKET.IO SETUP -----------------
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"]
  },
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000
});

// ----------------- SERVICES & DATABASE -----------------
// Initialize async services
const initializeServices = async () => {
  try {
    // 1. Connect MongoDB
    await connectDB();

    // 2. Connect Redis
    const redisReady = await connectRedis();

    // 3. Attach Redis Adapter only if ready
    if (redisReady) {
      try {
        io.adapter(createAdapter(pubClient, subClient));
        console.log('🔌 Socket.IO Redis adapter initialized');
      } catch (err) {
        console.error('❌ Failed to initialize Redis adapter:', err.message);
      }
    }

    // 4. Setup Socket.IO handlers
    const setupSocketIO = require("./sockets");
    setupSocketIO(io);

    console.log('✅ All services initialized successfully');
  } catch (error) {
    console.error('🔥 CRITICAL: Service initialization failed:', error.message);
  }
};

const startServer = async () => {
  try {
    // 1. Initialize DB and critical services FIRST
    await initializeServices();
    
    // 2. Clear port 5000 if occupied by another node process
    const PORT = process.env.PORT || 5000;
    
    // 3. Start listening with error handling
    const startListen = () => {
      const serverInstance = server.listen(PORT, () => {
        logger.info(`🚀 Server running on http://localhost:${PORT}`);
        logger.info(`📡 Socket.IO server ready for connections`);
      });

      serverInstance.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.error(`🔥 Port ${PORT} is already in use by another process.`);
          console.error(`💡 Suggestion: Try running 'npm run kill-port' manually to free it up.`);
          process.exit(1);
        } else {
          console.error('🔥 Server Error:', err);
        }
      });
    };

    startListen();

  } catch (error) {
    console.error('🔥 FATAL: App failed to start:', error);
    process.exit(1);
  }
};

// Start the sequence
startServer();

// Health check
app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

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
app.use("/api/telecaller-leads", telecallerLeadsRouter);

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
// Cache uploads for 1 day as they rarely change
const staticOptions = {
  maxAge: '1d',
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
    }
  }
};

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), staticOptions));
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads'), staticOptions));

// Serve static files from frontend/dist (if available)
const frontendPath = path.join(__dirname, "../frontend/dist");
if (fs.existsSync(frontendPath)) {
  // Frontend assets (JS/CSS) are content-hashed by Vite, so we can cache them heavily
  app.use(express.static(frontendPath, {
    maxAge: '30d',
    setHeaders: (res, path) => {
      if (path.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=2592000, immutable'); // 30 days
      }
    }
  }));

  // Catch-all route for SPA (must be last)
  app.get("*", (req, res) => {
    const indexPath = path.join(frontendPath, "index.html");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath, { lastModified: false, etag: false }); // Let browser revalidate HTML
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

// ----------------- CRON & CLEANUP -----------------

// ----------------- CRON JOBS -----------------
// Initialize Auto-Logout Job (Runs check immediately and then hourly)
try {
  cronService.startAutoLogoutJob();
} catch (cronError) {
  console.error("FAILED to start Auto-Logout Job:", cronError);
}

// ----------------- SESSION TIMEOUT -----------------
setInterval(() => handleTimeout(), 5 * 60 * 1000);

// ----------------- GRACEFUL SHUTDOWN -----------------
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

// Server start logic moved to startServer() for synchronization
// ---------------------------------------------------
