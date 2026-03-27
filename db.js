require("dotenv").config();
const mongoose = require("mongoose");


const connectDB = async () => {
    try {
        console.log('📡 Attempting to connect to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ MongoDB Atlas connected successfully!");
    } catch (error) {
        console.error("🔥 CRITICAL MongoDB Connection Error:", error.message);
        console.error("Please check your MONGO_URI in the .env file and ensure your IP is whitelisted on Atlas.");
        process.exit(1); // Still exit as the app can't function without DB
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
