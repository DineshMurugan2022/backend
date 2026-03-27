const mongoose = require("mongoose");
require("dotenv").config();
const User = require("./models/User");
const connectDB = require("./db");

const cleanupExtensions = async () => {
    try {
        await connectDB();
        
        console.log("🔍 Scanning for users with extension '701'...");
        
        // Find all users with sipExtension '701' except 'Dinesh@bny'
        const result = await User.updateMany(
            { 
                sipExtension: "701", 
                username: { $ne: "Dinesh@bny" } 
            },
            { 
                $set: { 
                    sipExtension: "",
                    sipUsername: "",
                    sipPassword: "" 
                } 
            }
        );
        
        console.log(`✅ Cleanup complete. Updated ${result.modifiedCount} users.`);
        
        process.exit(0);
    } catch (error) {
        console.error("❌ Cleanup failed:", error);
        process.exit(1);
    }
};

cleanupExtensions();
