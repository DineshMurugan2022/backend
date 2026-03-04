const express = require('express');
const router = express.Router();
const TelecallerLead = require('../models/TelecallerLead');
const auth = require('../middleware/auth');

// POST /api/telecaller-leads/upload
// Bulk upload phone numbers from an array and assign to a specific user
router.post('/upload', auth, async (req, res) => {
    try {
        // Check if user is admin or teamleader
        if (req.user.userGroup !== 'admin' && req.user.userGroup !== 'teamleader') {
            return res.status(403).json({ error: 'Only admins or teamleaders can assign leads' });
        }

        const { phoneNumbers, assignedTo } = req.body;

        if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
            return res.status(400).json({ error: 'An array of phone numbers is required' });
        }
        if (!assignedTo) {
            return res.status(400).json({ error: 'Assigned user ID is required' });
        }

        // Prepare bulk insert
        const leadsToInsert = phoneNumbers.map(number => ({
            phoneNumber: String(number).trim(),
            assignedTo: assignedTo,
            status: 'uncalled'
        })).filter(lead => lead.phoneNumber !== '');

        if (leadsToInsert.length === 0) {
            return res.status(400).json({ error: 'No valid phone numbers found' });
        }

        // Depending on requirements, we could check for duplicates here, but for simple assignment:
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
        const randomLeadCursor = await TelecallerLead.aggregate([
            { $match: { assignedTo: userId, status: 'uncalled' } },
            { $sample: { size: 1 } }
        ]);

        if (!randomLeadCursor || randomLeadCursor.length === 0) {
            return res.status(404).json({ message: 'No more uncalled leads available' });
        }

        const leadToCall = randomLeadCursor[0];

        // Mark it as called so they don't get it again on the next shuffle
        await TelecallerLead.findByIdAndUpdate(leadToCall._id, { status: 'called' });

        res.json({
            success: true,
            phoneNumber: leadToCall.phoneNumber
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
        const isAdminOrTL = req.user.userGroup === 'admin' || req.user.userGroup === 'teamleader';
        const { userId } = req.query;

        let matchCriteria = {};
        if (!isAdminOrTL) {
            // Regular telecallers only see their own stats
            matchCriteria.assignedTo = req.user.id || req.user._id;
        } else if (userId) {
            // Admins/TLs can filter by specific user
            matchCriteria.assignedTo = userId;
        }

        const stats = await TelecallerLead.aggregate([
            { $match: matchCriteria },
            {
                $group: {
                    _id: "$assignedTo",
                    totalAssigned: { $sum: 1 },
                    uncalledRemaining: {
                        $sum: { $cond: [{ $eq: ["$status", "uncalled"] }, 1, 0] }
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

module.exports = router;
