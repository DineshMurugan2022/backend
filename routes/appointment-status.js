const express = require('express');
const router = express.Router();
const AppointmentStatus = require('../models/AppointmentStatus');
const User = require('../models/User');
const auth = require('../middleware/auth');

// GET all appointment statuses (Admins see all, TLs see theirs or all depending on rules)
router.get('/', auth, async (req, res) => {
    try {
        const userGroup = req.user.userGroup.toLowerCase().trim();
        let query = {};
        
        // If it's a telecaller TL or BDM sale, they can only see what they created. Admins see all.
        if (['telecaller-tl', 'telecaller tl', 'bdm (sale)', 'bdm sale'].includes(userGroup)) {
            query.user = req.user._id;
        } else if (!['admin', 'teamleader', 'team leader'].includes(userGroup)) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const statuses = await AppointmentStatus.find(query).sort({ dateTime: -1 });
        res.json(statuses);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// POST new appointment status
router.post('/', auth, async (req, res) => {
    try {
        const userGroup = req.user.userGroup.toLowerCase().trim();
        if (!['admin', 'telecaller-tl', 'telecaller tl', 'bdm (sale)', 'bdm sale', 'teamleader', 'team leader'].includes(userGroup)) {
            return res.status(403).json({ message: 'Access denied. Only authorized roles can create.' });
        }

        const { companyName, clientName, dateTime, type, met, signed, follow, value, pending, pendingValue, remark, phoneNumber, address, assignedBdm, tmeId, tmeName } = req.body;

        const newStatus = new AppointmentStatus({
            user: req.user._id,
            userName: req.user.username,
            createdBy: req.user._id,
            createdByName: req.user.username,
            companyName,
            clientName,
            dateTime,
            type,
            met,
            signed,
            follow,
            value,
            pending,
            pendingValue,
            remark,
            phoneNumber,
            address,
            assignedBdm,
            tmeId,
            tmeName
        });

        await newStatus.save();
        res.status(201).json(newStatus);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// PUT update appointment status
router.put('/:id', auth, async (req, res) => {
    try {
        const userGroup = req.user.userGroup.toLowerCase().trim();
        if (!['admin', 'telecaller-tl', 'telecaller tl', 'bdm', 'bdm (sale)', 'bdm sale', 'teamleader', 'team leader'].includes(userGroup)) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const status = await AppointmentStatus.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true }
        );

        if (!status) return res.status(404).json({ message: 'Not found' });
        res.json(status);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// DELETE appointment status
router.delete('/:id', auth, async (req, res) => {
    try {
        const userGroup = req.user.userGroup.toLowerCase().trim();
        // Maybe only admin can delete? Or TL can delete their own.
        if (!['admin', 'telecaller-tl', 'telecaller tl', 'bdm', 'bdm (sale)', 'bdm sale', 'teamleader', 'team leader'].includes(userGroup)) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const status = await AppointmentStatus.findByIdAndDelete(req.params.id);
        if (!status) return res.status(404).json({ message: 'Not found' });
        res.json({ message: 'Deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
