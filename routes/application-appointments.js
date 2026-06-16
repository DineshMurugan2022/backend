const express = require('express');
const router = express.Router();
const ApplicationAppointment = require('../models/ApplicationAppointment');
const auth = require('../middleware/auth');

// POST new application appointment
router.post('/', auth, async (req, res) => {
    try {
        const userGroup = req.user.userGroup.toLowerCase().trim();
        // Allow bdm sale, team leaders, admin to create
        if (!['admin', 'bdm', 'bdm (sale)', 'bdm sale', 'teamleader', 'team leader'].includes(userGroup)) {
            return res.status(403).json({ message: 'Access denied. Only authorized roles can create.' });
        }

        const { companyName, customerName, number, location, dateTime, met, signed, follow, feedback } = req.body;

        const newAppointment = new ApplicationAppointment({
            companyName,
            customerName,
            number,
            location,
            dateTime,
            met,
            signed,
            follow,
            feedback,
            user: req.user._id,
        });

        const savedAppointment = await newAppointment.save();
        res.status(201).json(savedAppointment);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
});

// GET all application appointments
router.get('/', auth, async (req, res) => {
    try {
        const userGroup = req.user.userGroup.toLowerCase().trim();
        let query = {};
        
        // If it's BDM sale, they can only see what they created. Admins/TL see all.
        if (['bdm', 'bdm (sale)', 'bdm sale'].includes(userGroup)) {
            query.user = req.user._id;
        } else if (!['admin', 'teamleader', 'team leader'].includes(userGroup)) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const appointments = await ApplicationAppointment.find(query)
            .populate('user', 'username name')
            .sort({ dateTime: -1 });

        res.json(appointments);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
});

// PUT update application appointment
router.put('/:id', auth, async (req, res) => {
    try {
        const userGroup = req.user.userGroup.toLowerCase().trim();
        if (!['admin', 'bdm', 'bdm (sale)', 'bdm sale', 'teamleader', 'team leader'].includes(userGroup)) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const appointment = await ApplicationAppointment.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true }
        );

        if (!appointment) return res.status(404).json({ message: 'Not found' });
        res.json(appointment);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
});

// DELETE application appointment
router.delete('/:id', auth, async (req, res) => {
    try {
        const userGroup = req.user.userGroup.toLowerCase().trim();
        if (!['admin', 'bdm', 'bdm (sale)', 'bdm sale', 'teamleader', 'team leader'].includes(userGroup)) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const appointment = await ApplicationAppointment.findByIdAndDelete(req.params.id);
        if (!appointment) return res.status(404).json({ message: 'Not found' });
        res.json({ message: 'Deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
});

module.exports = router;
