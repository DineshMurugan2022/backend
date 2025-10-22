// whatsapp.js - Simple WhatsApp message service

/**
 * Send a WhatsApp message
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} message - Message content
 * @returns {Promise<Object>} - Result of the message sending
 */
async function sendWhatsAppMessage(phoneNumber, message) {
  try {
    // Validate input parameters
    if (!phoneNumber || !message) {
      throw new Error('Phone number and message are required');
    }

    // Validate phone number format (basic validation)
    if (!/^\+\d{10,15}$/.test(phoneNumber)) {
      throw new Error('Invalid phone number format. Use international format (e.g., +12345678901)');
    }

    console.log(`📱 Sending WhatsApp to ${phoneNumber}: ${message}`);
    
    // Check if WhatsApp token is configured
    if (process.env.WHATSAPP_TOKEN) {
      // Real WhatsApp Business API implementation
      const response = await fetch(`https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phoneNumber.replace('+', ''),
          type: 'text',
          text: { body: message }
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('WhatsApp API error:', data);
        throw new Error(`WhatsApp API error: ${data.error?.message || 'Unknown error'}`);
      }

      return { success: true, messageId: data.messages[0].id, message: 'WhatsApp message sent successfully!' };
    } else {
      // Fallback: simulate successful send for development
      console.log('⚠️ WhatsApp token not configured, simulating message send');
      return { success: true, message: 'Message sent successfully (simulated - configure WHATSAPP_TOKEN for real sending)' };
    }
    
  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendWhatsAppMessage
};