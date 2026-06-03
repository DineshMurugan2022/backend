const express = require('express');
const router = express.Router();
const TelecallerReport = require('../models/TelecallerReport');
const User = require('../models/User');
const auth = require('../middleware/auth');

// GET telecaller reports
// Admin/TeamLeader/TelecallerTL -> Get ALL reports
// Telecallers -> Get their OWN reports
router.get('/', auth, async (req, res) => {
    try {
        const userGroup = req.user.userGroup.toLowerCase().trim();
        let reports;

        if (
            userGroup === 'admin' ||
            userGroup === 'teamleader' ||
            userGroup === 'team leader' ||
            userGroup === 'telecaller-tl' ||
            userGroup === 'telecaller tl'
        ) {
            reports = await TelecallerReport.find().sort({ date: -1, createdAt: -1 });
        } else {
            reports = await TelecallerReport.find({ user: req.user._id }).sort({ date: -1, createdAt: -1 });
        }

        res.json(reports);
    } catch (err) {
        console.error('Error fetching telecaller reports:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST - Create a new telecaller report
router.post('/', auth, async (req, res) => {
    try {
        const { date, totalCallsSpoke, totalCallsAttempted, appointments, remarks, targetUserId } = req.body;
        const userGroup = req.user.userGroup.toLowerCase().trim();
        const isAdminOrLeader = userGroup === 'admin' || userGroup === 'teamleader' || userGroup === 'team leader' ||
            userGroup === 'telecaller-tl' || userGroup === 'telecaller tl';

        let targetUser = req.user;
        let createdBy = req.user._id;
        let createdByName = req.user.name || req.user.username;

        if (isAdminOrLeader && targetUserId) {
            const foundUser = await User.findById(targetUserId);
            if (foundUser) {
                targetUser = foundUser;
            }
        }

        const report = new TelecallerReport({
            user: targetUser._id,
            userName: targetUser.name || targetUser.username,
            userUsername: targetUser.username,
            createdBy,
            createdByName,
            date: date || new Date(),
            totalCallsSpoke: totalCallsSpoke || 0,
            totalCallsAttempted: totalCallsAttempted || 0,
            appointments: appointments || [],
            remarks: remarks || '',
        });

        await report.save();
        res.status(201).json(report);
    } catch (err) {
        console.error('Error creating telecaller report:', err);
        res.status(400).json({ error: err.message });
    }
});

// PUT - Update a telecaller report
router.put('/:id', auth, async (req, res) => {
    try {
        const { date, totalCallsSpoke, totalCallsAttempted, appointments, remarks } = req.body;

        let report = await TelecallerReport.findById(req.params.id);
        if (!report) return res.status(404).json({ error: 'Report not found' });

        const userGroup = req.user.userGroup.toLowerCase().trim();
        const isOwner = report.user.toString() === req.user._id.toString();
        const isAdminOrLeader = userGroup === 'admin' || userGroup === 'teamleader' || userGroup === 'team leader' ||
            userGroup === 'telecaller-tl' || userGroup === 'telecaller tl';

        if (!isOwner && !isAdminOrLeader) {
            return res.status(401).json({ error: 'Not authorized to edit this report' });
        }

        report = await TelecallerReport.findByIdAndUpdate(
            req.params.id,
            { date, totalCallsSpoke, totalCallsAttempted, appointments, remarks },
            { new: true }
        );

        res.json(report);
    } catch (err) {
        console.error('Error updating telecaller report:', err);
        res.status(400).json({ error: err.message });
    }
});

// DELETE - Delete a telecaller report
router.delete('/:id', auth, async (req, res) => {
    try {
        let report = await TelecallerReport.findById(req.params.id);
        if (!report) return res.status(404).json({ error: 'Report not found' });

        const userGroup = req.user.userGroup.toLowerCase().trim();
        const isOwner = report.user.toString() === req.user._id.toString();
        const isAdminOrLeader = userGroup === 'admin' || userGroup === 'teamleader' || userGroup === 'team leader' ||
            userGroup === 'telecaller-tl' || userGroup === 'telecaller tl';

        if (!isOwner && !isAdminOrLeader) {
            return res.status(401).json({ error: 'Not authorized to delete this report' });
        }

        await TelecallerReport.findByIdAndDelete(req.params.id);
        res.json({ message: 'Telecaller report deleted' });
    } catch (err) {
        console.error('Error deleting telecaller report:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET - Summary/stats for marketing report
router.get('/marketing-summary', auth, async (req, res) => {
    try {
        const userGroup = req.user.userGroup.toLowerCase().trim();
        const isAdminOrLeader = userGroup === 'admin' || userGroup === 'teamleader' || userGroup === 'team leader' || 
            userGroup === 'telecaller-tl' || userGroup === 'telecaller tl';
        if (!isAdminOrLeader) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Parse date filters from query
        const { startDate, endDate } = req.query;
        const matchStage = {};
        if (startDate || endDate) {
            matchStage.date = {};
            if (startDate) matchStage.date.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                matchStage.date.$lte = end;
            }
        }

        const summary = await TelecallerReport.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: '$user',
                    userName: { $first: '$userName' },
                    userUsername: { $first: '$userUsername' },
                    totalCallsSpoke: { $sum: '$totalCallsSpoke' },
                    totalCallsAttempted: { $sum: '$totalCallsAttempted' },
                    totalAppointments: { $sum: { $size: '$appointments' } },
                    totalMet: {
                        $sum: {
                            $size: {
                                $filter: {
                                    input: '$appointments',
                                    as: 'appt',
                                    cond: { $eq: ['$$appt.met', true] }
                                }
                            }
                        }
                    },
                    totalNotMet: {
                        $sum: {
                            $size: {
                                $filter: {
                                    input: '$appointments',
                                    as: 'appt',
                                    cond: { $eq: ['$$appt.met', false] }
                                }
                            }
                        }
                    },
                    reportCount: { $sum: 1 }
                }
            },
            { $sort: { totalCallsSpoke: -1 } }
        ]);

        res.json(summary);
    } catch (err) {
        console.error('Error fetching marketing summary:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
