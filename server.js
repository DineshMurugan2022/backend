require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const http = require("http");
const { Server } = require("socket.io");
const twilio = require("twilio");
const fetch = require("node-fetch"); // Ensure this is installed
const authRouter = require("./login/Auth"); // Corrected path
const appointmentsRouter = require("./routes/appointments");
const userRoutesRouter = require("./routes/userRoutes");
const User = require("./models/User");
const bcrypt = require("bcrypt");
const callsRouter = require('./routes/calls');
const leadsRouter = require('./routes/leads');
const { Parser } = require('json2csv'); // For CSV export

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
});


// Twilio Config
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/teamdb")
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });

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

  // Handle user logout
  socket.on("userLogout", async (data) => {
    console.log('🔔 Received userLogout event:', data);
    try {
      const { userId, username } = data;
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

// User Routes
app.use("/api/users", userRoutesRouter);

// Add after /api/users endpoint
app.get("/api/admin-status", async (req, res) => {
  try {
    const admin = await User.findOne({ userGroup: "admin" }, "username loginStatus").lean();
    if (!admin) return res.status(404).json({ error: "Admin not found" });
    res.json({ username: admin.username, status: admin.loginStatus });
  } catch (err) {
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
    const users = await User.find({ userGroup: { $ne: "admin" } }, "-passwordHash").lean();
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
  } catch (err) {
    console.error("Delete user error:", err);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// Make a call
app.post('/api/call', async (req, res) => {
  try {
    const { to, from } = req.body;
    
    const call = await client.calls.create({
      to,
      from,
      url: 'http://your-webhook-url/voice', // You'll need to set up a webhook URL
      statusCallback: 'http://your-webhook-url/status', // Optional: for call status updates
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST'
    });

    res.json({ success: true, callSid: call.sid });
  } catch (error) {
    console.error('Call failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Hang up a call
app.post('/api/hangup', async (req, res) => {
  try {
    const { callSid } = req.body;
    await client.calls(callSid).update({ status: 'completed' });
    res.json({ success: true });
  } catch (error) {
    console.error('Hangup failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// WhatsApp Message via Meta API
app.post('/send-whatsapp', async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ error: 'Phone and message are required.' });
  }

  try {
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

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

// Twilio Callback
app.post("/twilio/status-callback", (req, res) => {
  const { CallSid, CallStatus, To, From } = req.body;
  console.log("🔁 Call status:", CallSid, CallStatus);

  io.emit("callStatus", { sid: CallSid, status: CallStatus, to: To, from: From });

  if (["completed", "failed", "busy", "no-answer"].includes(CallStatus)) {
    delete activeCalls[To];
    io.emit("callEnded", { to: To });
  }

  res.sendStatus(200);
});

// Calls Routes
app.use('/api/calls', callsRouter);

// Attendance export endpoint
app.get('/api/users/attendance', async (req, res) => {
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
    // Format dates as YYYY-MM-DD HH:mm:ss
    const formatDateTime = dt => {
      if (!dt) return '';
      const d = new Date(dt);
      const pad = n => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
    users = users.map(u => ({
      username: u.username,
      loginTime: formatDateTime(u.loginTime),
      logoutTime: formatDateTime(u.logoutTime)
    }));
    const fields = ['username', 'loginTime', 'logoutTime'];
    const parser = new Parser({ fields });
    const csv = parser.parse(users);
    res.header('Content-Type', 'text/csv');
    res.attachment('attendance.csv');
    return res.send(csv);
  } catch (err) {
    res.status(500).json({ error: "Failed to export attendance" });
  }
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Something went wrong" });
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  });
}

module.exports = app;

app.use('/uploads', express.static(require('path').join(__dirname, 'uploads')));

app.get('/', (req, res) => {
  res.send('API is running');
});
