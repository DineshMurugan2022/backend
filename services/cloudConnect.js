const axios = require('axios');
const crypto = require('crypto');

/**
 * CloudConnect PBX API Service
 * Handles Click-to-Call, Call Logs, and CID Routing
 */
class CloudConnectService {
    constructor() {
        this.baseUrl = 'https://crm2.cloud-connect.in/ccpl_api/v1.4/api';
        this.tokenId = process.env.CLOUDCONNECT_TOKEN_ID;
    }

    /**
     * MD5 Encrypt helper (required for extension_password)
     */
    md5(text) {
        return crypto.createHash('md5').update(text).digest('hex');
    }

    /**
     * 1. Click To Call API - Outbound Dialing
     * @param {string} phoneNumber - Customer number
     * @param {string} extensionNumber - Agent extension
     * @param {string} extensionPassword - Plain text password (will be MD5ed)
     */
    async clickToCall(phoneNumber, extensionNumber, extensionPassword) {
        const url = `${this.baseUrl}/info/click2call`;
        const payload = {
            token_id: this.tokenId,
            phone_number: phoneNumber,
            extension_number: extensionNumber,
            extension_password: this.md5(extensionPassword),
            immediate_response: "ON"
        };

        try {
            const response = await axios.post(url, payload);
            return response.data;
        } catch (error) {
            console.error('CloudConnect ClickToCall Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * 2. Call Log or Call Details API
     * @param {string} startDate - YYYY-MM-DD
     * @param {string} endDate - YYYY-MM-DD
     * @param {string} tenantId - CloudConnect Tenant ID
     * @param {string} number - Optional extension/phone
     */
    async getCallLogs(startDate, endDate, tenantId, number = null) {
        // URL format: .../startDate/endDate/Tenant/callLog
        const url = `${this.baseUrl}/info/${startDate}-00:00/${endDate}-23:59/${tenantId}/callLog`;
        const payload = {
            token_id: this.tokenId
        };
        if (number) payload.number = number;

        try {
            const response = await axios.post(url, payload);
            return response.data;
        } catch (error) {
            console.error('CloudConnect GetLogs Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * 4. Add/Update Caller ID Routing
     */
    async manageCidRouting(action, data) {
        let urlTail = '';
        switch (action) {
            case 'add': urlTail = 'add/createCidRouting'; break;
            case 'update': urlTail = 'update/updateCidRouting'; break;
            case 'delete': urlTail = 'delete/deleteCidRouting'; break;
            default: throw new Error('Invalid CID routing action');
        }

        const url = `${this.baseUrl}/${urlTail}`;
        const payload = {
            token_id: this.tokenId,
            ...data
        };

        try {
            const response = await axios.post(url, payload);
            return response.data;
        } catch (error) {
            console.error(`CloudConnect CID ${action} Error:`, error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = new CloudConnectService();
