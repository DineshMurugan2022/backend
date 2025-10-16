require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const http = require("http");
const { Server } = require("socket.io");

const connectDB = require("./db");
const { setIOInstance } = require("./sockets/io");
const { handleTimeout, recordLocationUpdate, recordUserConnection, recordUserDisconnection } = require("./services/session");
const auth = require("./middleware/auth");
const User = require("./models/User");
const authRouter = require("./login/Auth");

// Routers
const callsRouter = require("./routes/calls");
const userRoutes = require("./routes/userRoutes");
const attendanceRouter = require("./routes/attendance");
const appointmentsRouter = require("./routes/appointments");
const leadsRouter = require("./routes/leads");
const proxyRouter = require("./routes/proxy");
const tasksRouter = require("./routes/tasks");

const app = express();
const server = http.createServer(app);

// Socket.IO setup with enhanced configuration
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ["http://localhost:5173", "http://localhost:3000", "http://localhost:3001", "https://nothing-nine-neon.vercel.app"],
    credentials: true,
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"],
  upgrade: true,
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000
});
setIOInstance(io);

// Store active tracking sessions
const trackingSessions = new Map();

// Store for appointment update listeners
const appointmentListeners = new Set();

// Store connected users
const connectedUsers = new Map();

io.on("connection", (socket) => {
  console.log(`🔌 New socket connection: ${socket.id}`);
  
  // Add socket to appointment listeners
  appointmentListeners.add(socket);
  
  const userId = socket.handshake.auth?.userId || socket.handshake.query?.userId;
  if (userId) {
    socket.join(`user_${userId}`);
    console.log(`🔗 Socket ${socket.id} joined room user_${userId}`);
    
    // Track connected user
    connectedUsers.set(userId, {
      socketId: socket.id,
      connectedAt: new Date()
    });
    recordUserConnection(userId, socket.id);
    
    // Notify others that user is online
    socket.broadcast.emit('userStatusChanged', { userId, status: 'active' });
  }
  
  // Handle user activity updates
  socket.on('userActivity', (data) => {
    const { userId } = data;
    if (userId) {
      // Update last activity time
      recordUserConnection(userId, socket.id);
    }
  });
  
  // Handle BDM joining a tracking session
  socket.on('joinAsTrackee', (data) => {
    const { sessionId, userId, userData } = data;
    if (sessionId && userId) {
      socket.join(`session_${sessionId}`);
      console.log(`📍 BDM ${userId} joined tracking session ${sessionId}`);
      
      // Store session info
      if (!trackingSessions.has(sessionId)) {
        trackingSessions.set(sessionId, {
          trackees: new Map(),
          watchers: new Set()
        });
      }
      
      const session = trackingSessions.get(sessionId);
      session.trackees.set(userId, {
        ...userData,
        userId,
        socketId: socket.id,
        joinedAt: new Date()
      });
      
      // Notify watchers that a new BDM joined
      socket.to(`session_${sessionId}`).emit('bdmJoined', {
        sessionId,
        userId,
        userData
      });
    }
  });
  
  // Handle location updates from BDMs with enhanced error handling and logging
  socket.on('bdmLocationUpdate', async (data) => {
    try {
      const { sessionId, userId, lat, lng, accuracy, speed, heading, timestamp } = data;
      
      // Validate required data
      if (!userId) {
        console.warn('⚠️ Location update missing userId');
        return;
      }
      
      // Log the incoming location update
      console.log(`📍 Received location update from BDM ${userId}: ${lat}, ${lng} (±${accuracy}m)`);
      
      // Record location update for attendance tracking
      recordLocationUpdate(userId);
      
      // Update user's location in database with error handling
      try {
        const updateData = { 
          lat, 
          lng,
          loginStatus: 'active', // Mark as active when location is updated
          lastUpdate: new Date() // Update lastUpdate timestamp
        };
        
        // Only update accuracy if it's provided and reasonable
        if (accuracy !== undefined && accuracy <= 200) {
          updateData.accuracy = accuracy;
        }
        
        await User.findByIdAndUpdate(userId, updateData);
        console.log(`✅ Updated location for user ${userId} in database`);
      } catch (dbError) {
        console.error('❌ Error updating user location in database:', dbError);
      }
      
      // Broadcast location update to session watchers if session exists
      if (sessionId) {
        socket.to(`session_${sessionId}`).emit('bdmLocationChanged', {
          sessionId,
          userId,
          lat,
          lng,
          accuracy,
          speed,
          heading,
          timestamp
        });
        console.log(`📡 Broadcast location update to session ${sessionId}`);
      } else {
        // If no session, broadcast to all connected users
        socket.broadcast.emit('bdmLocationChanged', {
          userId,
          lat,
          lng,
          accuracy,
          speed,
          heading,
          timestamp
        });
        console.log(`📡 Broadcast location update to all users (no session)`);
      }
      
    } catch (error) {
      console.error('❌ Error processing location update:', error);
      // Send error response back to client
      socket.emit('locationUpdateError', { 
        error: 'Failed to process location update',
        message: error.message 
      });
    }
  });
  
  // Handle appointment updates
  socket.on('appointmentUpdated', (data) => {
    // Broadcast to all connected clients that an appointment was updated
    for (const listener of appointmentListeners) {
      if (listener !== socket) { // Don't send to the sender
        listener.emit('appointmentUpdated', data);
      }
    }
  });
  
  // Handle BDM disconnection with better error handling
  socket.on('disconnect', (reason) => {
    console.log(`🔌 Socket ${socket.id} disconnected. Reason: ${reason}`);
    
    // Remove socket from appointment listeners
    appointmentListeners.delete(socket);
    
    // Find and remove disconnected user
    let disconnectedUserId = null;
    for (const [userId, userInfo] of connectedUsers.entries()) {
      if (userInfo.socketId === socket.id) {
        disconnectedUserId = userId;
        break;
      }
    }
    
    if (disconnectedUserId) {
      connectedUsers.delete(disconnectedUserId);
      recordUserDisconnection(disconnectedUserId);
      console.log(`👤 User ${disconnectedUserId} disconnected`);
      
      // Notify others that user is offline
      socket.broadcast.emit('userStatusChanged', { userId: disconnectedUserId, status: 'inactive' });
    }
    
    // Clean up tracking sessions
    for (const [sessionId, session] of trackingSessions.entries()) {
      // Remove disconnected trackee
      for (const [trackeeId, trackeeInfo] of session.trackees.entries()) {
        if (trackeeInfo.socketId === socket.id) {
          session.trackees.delete(trackeeId);
          console.log(`📍 BDM ${trackeeId} left tracking session ${sessionId}`);
          
          // Notify watchers that BDM disconnected
          socket.to(`session_${sessionId}`).emit('bdmDisconnected', {
            sessionId,
            userId: trackeeId
          });
        }
      }
    }
  });
  
  // Handle connection errors
  socket.on('error', (error) => {
    console.error(`🔌 Socket error for ${socket.id}:`, error);
  });
});

// Connect to MongoDB
connectDB();

// Middlewares
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ["http://localhost:5173", "http://localhost:3000", "http://localhost:3001", "https://nothing-nine-neon.vercel.app"], credentials: true }));
app.use(helmet());
app.use(express.json({ limit: "2mb" }));

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
    res.json({ sessionId });
  } catch (error) {
    console.error('Error creating session:', error.message);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// ----------------- ROUTES -----------------
app.use("/api/appointments", appointmentsRouter);
app.use("/api/leads", leadsRouter);
app.use("/api/attendance", attendanceRouter);
app.use(
  "/api/tasks",
  (req, _res, next) => {
    req.io = io; // attach io for task notifications
    next();
  },
  tasksRouter
);
app.use("/api/users", userRoutes);
app.use("/api/auth", authRouter);
app.use("/api/calls", callsRouter);
app.use("/api", proxyRouter);

// ----------------- SESSION TIMEOUT -----------------
setInterval(() => handleTimeout(), 5 * 60 * 1000);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 Socket.IO server ready for connections`);
});