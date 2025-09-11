require("dotenv").config();
const mongoose = require("mongoose");


const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, );
    console.log("✅ MongoDB Atlas connected successfully!");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error.message);
    process.exit(1);
  }
};

// Connection events (useful for debugging)
mongoose.connection.on("connected", () => {
  console.log("📡 Mongoose connected to Atlas cluster");
});

mongoose.connection.on("error", (err) => {
  console.error("⚠️ Mongoose connection error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.warn("🔌 Mongoose disconnected");
});

// Graceful shutdown (for Atlas too)
process.on("SIGINT", async () => {
  await mongoose.connection.close();
  console.log("🔒 MongoDB connection closed due to app termination");
  process.exit(0);
});

module.exports = connectDB;
