const express = require('express');
const router = express.Router();
const TelecallerLead = require('../models/TelecallerLead');
const CallLog = require('../models/CallLog');
const auth = require('../middleware/auth');
const mongoose = require('mongoose');

// POST /api/telecaller-leads/upload
// Bulk upload phone numbers from an array and assign to a specific user
router.post('/upload', auth, async (req, res) => {
    try {
        // Check if user is admin, teamleader, telecaller tl, or Hr
        const role = req.user.userGroup.toLowerCase().trim();
        const isAllowed = 
            ['admin', 'teamleader', 'team leader'].includes(role);
        
        if (!isAllowed) {
            console.warn(`Unauthorized lead upload attempt by user: ${req.user.username}, role: ${role}`);
            return res.status(403).json({ error: 'Only admins, teamleaders, or HR can assign leads' });
        }

        const { phoneNumbers, leads, assignedTo } = req.body;

        if (!assignedTo) {
            return res.status(400).json({ error: 'Assigned user ID is required' });
        }

        let leadsToInsert = [];
        
        if (Array.isArray(leads) && leads.length > 0) {
            // New detailed format
            leadsToInsert = leads.map(lead => ({
                phoneNumber: String(lead.MobileNo || lead.phoneNumber).trim(),
                companyName: lead.companyName || lead['Company Name'] || '',
                clientName: lead.clientName || lead['Name'] || '',
                designation: lead.designation || lead['Designation'] || '',
                state: lead.state || lead['State'] || '',
                industryType: lead.industryType || lead['IndustryType'] || lead['Industry Type'] || '',
                assignedTo: assignedTo,
                status: 'uncalled'
            })).filter(lead => lead.phoneNumber !== '');
        } else if (Array.isArray(phoneNumbers) && phoneNumbers.length > 0) {
            // Legacy format
            leadsToInsert = phoneNumbers.map(number => ({
                phoneNumber: String(number).trim(),
                assignedTo: assignedTo,
                status: 'uncalled'
            })).filter(lead => lead.phoneNumber !== '');
        }

        if (leadsToInsert.length === 0) {
            return res.status(400).json({ error: 'No valid phone numbers or leads found' });
        }

        await TelecallerLead.insertMany(leadsToInsert);

        res.status(201).json({
            success: true,
            message: `${leadsToInsert.length} leads successfully assigned`,
            count: leadsToInsert.length
        });

    } catch (error) {
        console.error('Error uploading telecaller leads:', error);
        res.status(500).json({ error: 'Failed to assign leads', details: error.message });
    }
});

// GET /api/telecaller-leads/shuffle
// Fetch ONE random 'uncalled' lead for the requesting user, and mark it 'called'
router.get('/shuffle', auth, async (req, res) => {
    try {
        const userId = req.user.id || req.user._id;

        // Use aggregate to get a random uncalled lead
        // IMPORTANT: Must cast userId string to ObjectId for aggregate $match
        const randomLeadCursor = await TelecallerLead.aggregate([
            { $match: { assignedTo: new mongoose.Types.ObjectId(userId), status: 'uncalled' } },
            { $sample: { size: 1 } }
        ]);

        if (!randomLeadCursor || randomLeadCursor.length === 0) {
            return res.status(404).json({ message: 'No more uncalled leads available' });
        }

        const leadToCall = randomLeadCursor[0];

        // Mark it as 'picked' (NOT 'called') so they don't get it again, 
        // but it doesn't count as called yet in stats.
        await TelecallerLead.findByIdAndUpdate(leadToCall._id, { status: 'picked' });

        res.json({
            success: true,
            id: leadToCall._id,
            phoneNumber: leadToCall.phoneNumber,
            companyName: leadToCall.companyName || '',
            clientName: leadToCall.clientName || '',
            designation: leadToCall.designation || '',
            state: leadToCall.state || '',
            industryType: leadToCall.industryType || ''
        });

    } catch (error) {
        console.error('Error shuffling lead:', error);
        res.status(500).json({ error: 'Failed to shuffle leads', details: error.message });
    }
});

// GET /api/telecaller-leads/stats
// Return counts of total assigned vs uncalled for a specific user, or all users if admin
router.get('/stats', auth, async (req, res) => {
    try {
        const role = req.user.userGroup.toLowerCase().trim();
        const isAdminOrTL = ['admin', 'teamleader', 'team leader', 'telecaller tl', 'telecaller-tl', 'hr'].includes(role);
        const { userId: queryUserId } = req.query;

        let matchCriteria = {};
        if (!isAdminOrTL) {
            // Regular telecallers only see their own stats
            matchCriteria.assignedTo = new mongoose.Types.ObjectId(req.user.id || req.user._id);
        } else if (queryUserId) {
            // Admins/TLs can filter by specific user
            matchCriteria.assignedTo = new mongoose.Types.ObjectId(queryUserId);
        }

        const stats = await TelecallerLead.aggregate([
            { $match: matchCriteria },
            {
                $group: {
                    _id: "$assignedTo",
                    totalAssigned: { $sum: 1 },
                    uncalledRemaining: {
                        $sum: { $cond: [{ $in: ["$status", ["uncalled", "picked"]] }, 1, 0] }
                    },
                    calledTotal: {
                        $sum: { $cond: [{ $eq: ["$status", "called"] }, 1, 0] }
                    }
                }
            }
        ]);

        res.json(stats);

    } catch (error) {
        console.error('Error fetching telecaller stats:', error);
        res.status(500).json({ error: 'Failed to fetch lead stats', details: error.message });
    }
});

// PATCH /api/telecaller-leads/mark-called/:id
// Explicitly mark a lead as called
router.patch('/mark-called/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id || req.user._id;

        // 1. Fetch the lead to get its phone number
        const lead = await TelecallerLead.findById(id);
        if (!lead) return res.status(404).json({ error: 'Lead not found' });

        // 2. Security Check: Verify that an OUTBOUND call was made to this number 
        // by THIS user within the last 20 minutes.
        const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000);
        
        // Clean the lead number for robust matching (last 10 digits)
        const cleanLeadNumber = lead.phoneNumber.replace(/\D/g, '').slice(-10);
        
        // Use a regex to match the last 10 digits in the CallLog
        const recentCall = await CallLog.findOne({
            userId: new mongoose.Types.ObjectId(userId),
            direction: 'outbound',
            callTime: { $gte: twentyMinutesAgo },
            phoneNumber: { $regex: new RegExp(cleanLeadNumber + '$') }
        });

        if (!recentCall) {
            console.warn(`[SECURITY] User ${req.user.username} tried to mark lead ${id} (${lead.phoneNumber}) as called without a matching recent call log.`);
            return res.status(403).json({ 
                error: 'Validation failed: You must call this number using the integrated dialer before marking it as called.',
                requiresCall: true
            });
        }

        // 3. Update the lead status
        lead.status = 'called';
        await lead.save();

        res.json({ success: true, message: 'Lead marked as called successfully' });
    } catch (error) {
        console.error('Error marking lead called:', error);
        res.status(500).json({ error: 'Failed to update lead status', details: error.message });
    }
});

// DELETE /api/telecaller-leads/assigned/:userId
// Clear ALL leads assigned to a specific user
router.delete('/assigned/:userId', auth, async (req, res) => {
    try {
        const { userId } = req.params;
        const role = req.user.userGroup.toLowerCase().trim();
        const isAdminOrTL = ['admin', 'teamleader', 'team leader'].includes(role);

        if (!isAdminOrTL) {
            return res.status(403).json({ error: 'Only admins, teamleaders, or HR can clear leads' });
        }

        const result = await TelecallerLead.deleteMany({ assignedTo: new mongoose.Types.ObjectId(userId) });
        res.json({ success: true, message: `Deleted ${result.deletedCount} leads for user` });
    } catch (error) {
        console.error('Error clearing leads:', error);
        res.status(500).json({ error: 'Failed to clear leads', details: error.message });
    }
});

// GET /api/telecaller-leads/assigned/:userId
// Fetch all raw leads assigned to a specific user (Admin/TL view)
router.get('/assigned/:userId', auth, async (req, res) => {
    try {
        const { userId } = req.params;
        const role = req.user.userGroup.toLowerCase().trim();
        const isAdminOrTL = ['admin', 'teamleader', 'team leader', 'telecaller-tl', 'telecaller tl', 'hr'].includes(role);

        if (!isAdminOrTL && String(req.user.id || req.user._id) !== userId) {
            return res.status(403).json({ error: 'Not authorized to view these leads' });
        }

        const leads = await TelecallerLead.find({ assignedTo: new mongoose.Types.ObjectId(userId) })
            .sort({ status: -1, _id: -1 }); // Groups uncalled together, then sorts by newest

        res.json(leads);
    } catch (error) {
        console.error('Error fetching user leads:', error);
        res.status(500).json({ error: 'Failed to fetch assigned leads', details: error.message });
    }
});

module.exports = router;
