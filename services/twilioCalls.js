const twilio = require('twilio');

// Initialize Twilio Client
// These should be set in .env
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

let client;

try {
    if (accountSid && authToken) {
        client = twilio(accountSid, authToken);
        console.log("✅ Twilio Client Initialized");
    } else {
        console.warn("⚠️ Twilio credentials missing in .env. Calls will fail.");
    }
} catch (error) {
    console.error("❌ Failed to initialize Twilio client:", error.message);
}

/**
 * Make an outbound call via Twilio
 * @param {string} to - The phone number to call
 * @param {string} url - TwiML URL or TwiML Bin URL for call logic (optional, defaults to a simple message)
 */
const makeCall = async ({ to, url }) => {
    if (!client) {
        throw new Error("Twilio client not initialized. Check server logs.");
    }

    // Use a default TwiML if none provided (e.g. "Connecting you...")
    // In a real app, you'd want a TwiML Bin that dials the agent or connects to a browser client.
    // For now, we'll use a simple placeholder TwiML or assume the frontend provides one.
    const twimlUrl = url || 'http://demo.twilio.com/docs/voice.xml';

    try {
        const call = await client.calls.create({
            url: twimlUrl,
            to: to,
            from: fromNumber,
        });

        console.log(`📞 Call initiated: ${call.sid}`);
        return { success: true, callSid: call.sid, status: call.status };
    } catch (error) {
        console.error("❌ Twilio Call Error:", error);
        throw error;
    }
};

module.exports = { makeCall };
