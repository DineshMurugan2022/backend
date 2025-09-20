require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const http = require("http");
const { Server } = require("socket.io");
const authRouter = require("./login/Auth"); // Corrected path
const appointmentsRouter = require("./routes/appointments");
const userRoutesRouter = require("./routes/userRoutes");
const User = require("./models/User");
const bcrypt = require("bcrypt");
const callsRouter = require('./routes/calls');
const leadsRouter = require('./routes/leads');
const { Parser } = require('json2csv'); // For CSV export
const proxyRouter = require('./routes/proxy');
const connectDB = require("./db");
const task = require("./routes/tasks");
const modem = require("./services/modem");
const { setIOInstance } = require("./sockets/io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:5173',
      'http://localhost:3000', // 👈 Add this line
      'https://nothing-nine-neon.vercel.app'
    ],
    credentials: true
  }
  // transports: ['websocket'], // FIX: Avoid xhr poll error
});




// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ✅ Connect to MongoDB
connectDB();

// Initialize Socket.IO instance for services
setIOInstance(io);

// Socket.IO Events
const activeCalls = {};
const activeSessions = new Map(); // Track active user sessions

io.on("connection", (socket) => {
  console.log("🟢 Socket connected:", socket.id);

  // Handle user login
  socket.on("userLogin", async (data) => {
    console.log('🔔 Received userLogin event:', data);
    try {
      const { userId, username } = data;
      activeSessions.set(userId, {
        socketId: socket.id,
        username,
        loginTime: new Date(),
        lastActivity: new Date()
      });
      
      // Update user status in database
      await User.findByIdAndUpdate(userId, { loginStatus: "active", loginTime: new Date(), logoutTime: null });
      
      // Broadcast to all clients that user is now active
      io.emit("userStatusChanged", { userId, status: "active", username });
      
      console.log(`✅ User ${username} logged in`);
      console.log('📊 Active sessions:', activeSessions.size);
    } catch (error) {
      console.error("Login tracking error:", error);
    }
  });



  socket.on("userLogout", async (data) => {
    console.log('🔔 Received userLogout event:', data);
    try {
      const { userId, username } = data;
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        console.error('⚠️ Invalid or missing userId received for socket logout:', userId);
        return;
      }

      activeSessions.delete(userId);
      
      // Update user status in database
      await User.findByIdAndUpdate(userId, { loginStatus: "inactive", logoutTime: new Date() });
      
      // Broadcast to all clients that user is now inactive
      io.emit("userStatusChanged", { userId, status: "inactive", username });
      
      console.log(`❌ User ${username} logged out`);
      console.log('📊 Active sessions:', activeSessions.size);
    } catch (error) {
      console.error("Logout tracking error:", error);
    }
  });
  
  


  // Handle user activity (heartbeat)
  socket.on("userActivity", (data) => {
    const { userId } = data;
    const session = activeSessions.get(userId);
    if (session) {
      session.lastActivity = new Date();
    }
  });

  socket.on("startCall", ({ to, callSid }) => {
    activeCalls[to] = callSid;
    io.emit("callStatus", { to, status: "Initiated by user" });
  });

  socket.on("hangup", ({ to }) => {
    io.emit("callEnded", { to });
    delete activeCalls[to];
  });

  // Real-time BDM location tracking
  socket.on("bdmLocationUpdate", async ({ userId, lat, lng }) => {
    try {
      await User.findByIdAndUpdate(userId, { lat, lng });
      io.emit("bdmLocationChanged", { userId, lat, lng });
    } catch (err) {
      console.error("Failed to update BDM location:", err);
    }
  });

  // Handle joining user room for notifications
  socket.on("joinUserRoom", (userId) => {
    socket.join(`user_${userId}`);
    console.log(`🔔 User ${userId} joined notification room`);
  });

  socket.on("disconnect", () => {
    console.log("🔴 Socket disconnected:", socket.id);
    // Find and mark user as inactive if their socket disconnected
    for (const [userId, session] of activeSessions.entries()) {
      if (session.socketId === socket.id) {
        activeSessions.delete(userId);
        User.findByIdAndUpdate(userId, { loginStatus: "inactive", logoutTime: new Date() }).then(() => {
          io.emit("userStatusChanged", { userId, status: "inactive", username: session.username });
        }).catch(console.error);
        break;
      }
    }
  });
});

// Session timeout checker (run every 5 minutes)
setInterval(async () => {
  const now = new Date();
  const timeoutMinutes = 30; // Mark as inactive after 30 minutes of no activity
  
  for (const [userId, session] of activeSessions.entries()) {
    const timeSinceActivity = (now - session.lastActivity) / (1000 * 60); // minutes
    if (timeSinceActivity > timeoutMinutes) {
      activeSessions.delete(userId);
      await User.findByIdAndUpdate(userId, { loginStatus: "inactive", logoutTime: new Date() });
      io.emit("userStatusChanged", { userId, status: "inactive", username: session.username });
      console.log(`⏰ User ${session.username} timed out`);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// Reset all users to inactive on server startup
const resetAllUsersToInactive = async () => {
  try {
    await User.updateMany({}, { loginStatus: "inactive", logoutTime: null, loginTime: null });
    console.log('🔄 Reset all users to inactive status');
  } catch (error) {
    console.error('Failed to reset user statuses:', error);
  }
};

// Call this on server startup
resetAllUsersToInactive();

// Auth Routes
app.use("/api/auth", authRouter);

// Appointment Routes
app.use("/api/appointments", appointmentsRouter);
app.use("/api/leads", leadsRouter);
  
//task routes
app.use("/api/tasks", (req, res, next) => {
  req.io = io;
  next();
}, task);

// User Routes
app.use("/api/users", userRoutesRouter);

// Add after /api/users endpoint
app.get("/api/admin-status", async (req, res) => {
  try {
    const admin = await User.findOne({ userGroup: "admin" }, "username loginStatus").lean();
    if (!admin) return res.status(404).json({ error: "Admin not found" });
    res.json({ username: admin.username, status: admin.loginStatus });
  } catch {
    res.status(500).json({ error: "Failed to fetch admin status" });
  }
});

// Register User
app.post("/api/users/register", async (req, res) => {
  try {
    const { username, password, userGroup, phone, loginStatus } = req.body;

    if (!username || !password || !phone) {
      return res.status(400).json({ error: "Username, password, and phone are required" });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ error: "Username already taken" });

    const passwordHash = await bcrypt.hash(password, 10);

    const user = new User({
      username,
      passwordHash,
      userGroup,
      phone,
      loginStatus,
      loginTime: null,
      logoutTime: null,
    });

    await user.save();

    res.status(201).json({
      message: "User registered successfully",
      user: { id: user._id, username: user.username, userGroup: user.userGroup, phone: user.phone },
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get Users
app.get("/api/users", async (req, res) => {
  try {
    // Exclude admins and passwordHash, include loginTime and logoutTime
    let users = await User.find({ userGroup: { $ne: "admin" } }, "-passwordHash").lean();
    // Ensure loginTime and logoutTime are always present
    users = users.map(u => ({
      ...u,
      loginTime: typeof u.loginTime === 'undefined' ? null : u.loginTime,
      logoutTime: typeof u.logoutTime === 'undefined' ? null : u.logoutTime
    }));
    res.json(users);
  } catch (err) {
    console.error("Fetch users error:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Update User
app.put("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, userGroup, phone, loginStatus } = req.body;

    const updateData = {};
    if (username) updateData.username = username;
    if (userGroup) updateData.userGroup = userGroup;
    if (phone) updateData.phone = phone;
    if (loginStatus) updateData.loginStatus = loginStatus;
    if (password) updateData.passwordHash = await bcrypt.hash(password, 10);

    const updatedUser = await User.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updatedUser) return res.status(404).json({ error: "User not found" });

    res.json({ message: "User updated", user: updatedUser });
  } catch (err) {
    console.error("Update user error:", err);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// Delete User
app.delete("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deletedUser = await User.findByIdAndDelete(id);
    if (!deletedUser) return res.status(404).json({ error: "User not found" });

    res.json({ message: "User deleted" });
  } catch {
    console.error("Delete user error");
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// WhatsApp Message via Meta API
app.post('/send-whatsapp', async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ error: 'Phone and message are required.' });
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone.replace('+', ''),
        type: 'text',
        text: { body: message }
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('WhatsApp API error:', data);
      return res.status(500).json({ error: 'Failed to send message.', details: data });
    }

    res.status(200).json({ success: true, message: 'WhatsApp message sent successfully!', data });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});



// Calls Routes
app.use('/api/calls', callsRouter);
app.use('/api', proxyRouter);
// Initialize SIM800 Modem
modem.connectSIM800(io);



// Import auth middleware
const auth = require('./middleware/auth');

// Attendance data endpoint (for viewing)
app.get('/api/users/attendance', auth, async (req, res) => {
  try {
    const { month, year } = req.query;
    let users = await User.find({ userGroup: { $ne: "admin" } }, "username loginTime logoutTime").lean();
    
    if (month && year) {
      const m = parseInt(month, 10) - 1; // JS months are 0-based
      const y = parseInt(year, 10);
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 1);
      users = users.filter(u => {
        const login = u.loginTime ? new Date(u.loginTime) : null;
        const logout = u.logoutTime ? new Date(u.logoutTime) : null;
        return (login && login >= start && login < end) || (logout && logout >= start && logout < end);
      });
    }
    
    // Format dates for display
    const formatDateTime = dt => {
      if (!dt) return '';
      const d = new Date(dt);
      const pad = n => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
    
    const formattedUsers = users.map(u => ({
      username: u.username,
      loginTime: formatDateTime(u.loginTime),
      logoutTime: formatDateTime(u.logoutTime)
    }));
    
    res.json(formattedUsers);
  } catch (error) {
    console.error('Error fetching attendance:', error);
    res.status(500).json({ error: "Failed to fetch attendance" });
  }
});

// Attendance download endpoint (for CSV export)
app.get('/api/users/attendance/download', auth, async (req, res) => {
  try {
    const { month, year } = req.query;
    let users = await User.find({ userGroup: { $ne: "admin" } }, "username loginTime logoutTime").lean();
    
    if (month && year) {
      const m = parseInt(month, 10) - 1; // JS months are 0-based
      const y = parseInt(year, 10);
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 1);
      users = users.filter(u => {
        const login = u.loginTime ? new Date(u.loginTime) : null;
        const logout = u.logoutTime ? new Date(u.logoutTime) : null;
        return (login && login >= start && login < end) || (logout && logout >= start && logout < end);
      });
    }
    
    // Format dates for CSV export
    const formatDateTime = dt => {
      if (!dt) return '';
      const d = new Date(dt);
      const pad = n => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
    
    const csvData = users.map(u => ({
      Username: u.username,
      'Login Time': formatDateTime(u.loginTime),
      'Logout Time': formatDateTime(u.logoutTime),
      'Working Hours': (() => {
        const login = u.loginTime ? new Date(u.loginTime) : null;
        const logout = u.logoutTime ? new Date(u.logoutTime) : null;
        if (login && logout) {
          const hours = Math.abs(logout - login) / 36e5; // Convert milliseconds to hours
          return hours.toFixed(2);
        }
        return 'N/A';
      })()
    }));
    
    const fields = ['Username', 'Login Time', 'Logout Time', 'Working Hours'];
    const parser = new Parser({ fields });
    const csv = parser.parse(csvData);
    
    // Set proper headers for file download
    const monthName = month ? new Date(0, parseInt(month) - 1).toLocaleString('default', { month: 'long' }) : 'All';
    const fileName = `attendance_${monthName}_${year || 'All'}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');
    
    return res.send(csv);
  } catch (error) {
    console.error('Error downloading attendance:', error);
    res.status(500).json({ error: "Failed to export attendance" });
  }
});

// Global Error Handler
app.use((err, req, res, _next) => {
  console.error("Unhandled error:", err);
  if (res && typeof res.status === 'function') {
    res.status(500).json({ error: "Something went wrong" });
  } else {
    // fallback for non-standard res
    res.end && res.end('Internal server error');
  }
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  });
}

module.exports = app;

