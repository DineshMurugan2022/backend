const express = require('express');
const router = express.Router();
const Report = require('../models/Report');
const User = require('../models/User');
const auth = require('../middleware/auth');

// Get reports
// Admin/TeamLeader -> Get ALL reports
// Others -> Get OWN reports
router.get('/', auth, async (req, res) => {
    try {
        const userGroup = req.user.userGroup.toLowerCase().trim();
        let reports;

        if (userGroup === 'admin' || userGroup === 'teamleader' || userGroup === 'team leader') {
            // Fetch all reports, sorted by newest first
            reports = await Report.find().sort({ date: -1, createdAt: -1 });
        } else {
            // Fetch only user's reports
            reports = await Report.find({ user: req.user._id }).sort({ date: -1, createdAt: -1 });
        }

        res.json(reports);
    } catch (err) {
        console.error('Error fetching reports:', err);
        res.status(500).json({ error: err.message });
    }
});

// Create a new report
router.post('/', auth, async (req, res) => {
    try {
        const { date, items, targetUserId } = req.body;
        const userGroup = req.user.userGroup.toLowerCase().trim();
        const isAdminOrLeader = userGroup === 'admin' || userGroup === 'teamleader' || userGroup === 'team leader';

        let targetUser = req.user;
        let createdBy = req.user._id;
        let createdByName = req.user.name || req.user.username;

        // If admin/leader and targetUserId is provided, fetch that user
        if (isAdminOrLeader && targetUserId) {
            const User = require('../models/User'); // Weak dependency load if not at top
            const foundUser = await User.findById(targetUserId);
            if (foundUser) {
                targetUser = foundUser;
            }
        }

        const report = new Report({
            user: targetUser._id,
            userName: targetUser.name || targetUser.username,
            userUsername: targetUser.username,
            createdBy: createdBy,
            createdByName: createdByName,
            date: date || new Date(),
            items: items || []
        });

        await report.save();
        res.status(201).json(report);
    } catch (err) {
        console.error('Error creating report:', err);
        res.status(400).json({ error: err.message });
    }
});

// Update a report
router.put('/:id', auth, async (req, res) => {
    try {
        const { date, items } = req.body;

        let report = await Report.findById(req.params.id);
        if (!report) return res.status(404).json({ error: 'Report not found' });

        // Ensure user owns the report (or is admin/teamleader if we wanted to allow that, but typically users edit their own)
        // Check if user is owner OR admin/teamleader
        const userGroup = req.user.userGroup.toLowerCase().trim();
        const isOwner = report.user.toString() === req.user._id.toString();
        const isAdminOrLeader = userGroup === 'admin' || userGroup === 'teamleader' || userGroup === 'team leader';

        if (!isOwner && !isAdminOrLeader) {
            return res.status(401).json({ error: 'Not authorized to edit this report' });
        }

        report = await Report.findByIdAndUpdate(
            req.params.id,
            { date, items },
            { new: true }
        );

        res.json(report);
    } catch (err) {
        console.error('Error updating report:', err);
        res.status(400).json({ error: err.message });
    }
});

// Delete a report
router.delete('/:id', auth, async (req, res) => {
    try {
        let report = await Report.findById(req.params.id);
        if (!report) return res.status(404).json({ error: 'Report not found' });

        const userGroup = req.user.userGroup.toLowerCase().trim();
        const isOwner = report.user.toString() === req.user._id.toString();
        const isAdminOrLeader = userGroup === 'admin' || userGroup === 'teamleader' || userGroup === 'team leader';

        if (!isOwner && !isAdminOrLeader) {
            return res.status(401).json({ error: 'Not authorized to delete this report' });
        }

        await Report.findByIdAndDelete(req.params.id);
        res.json({ message: 'Report deleted' });
    } catch (err) {
        console.error('Error deleting report:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
