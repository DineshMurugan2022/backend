const Attendance = require('../models/Attendance');

const getDateWithoutTime = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
};

class AttendanceService {
    /**
     * Record a user login (check-in).
     * @param {Object} user - The mongoose user document.
     * @param {Date} loginTime - The time of login.
     * @returns {Promise<Object>} - The updated user document (or attendance record).
     */
    async recordLogin(user, loginTime = new Date()) {
        const loginDate = getDateWithoutTime(loginTime);

        // Find existing attendance record for today using the new model
        let attendanceRecord = await Attendance.findOne({
            user: user._id,
            date: {
                $gte: loginDate,
                $lt: new Date(loginDate.getTime() + 24 * 60 * 60 * 1000)
            }
        });

        if (!attendanceRecord) {
            // Create new attendance record for today
            attendanceRecord = new Attendance({
                user: user._id,
                date: loginDate,
                loginTime: loginTime,
                logoutTime: null,
                totalHours: 0,
                status: 'present'
            });
        } else {
            // Preserve the original login time if it exists
            if (!attendanceRecord.loginTime) {
                attendanceRecord.loginTime = loginTime;
            }
            // Reset logout time and total hours for a new session
            attendanceRecord.logoutTime = null;
            attendanceRecord.totalHours = 0;
            attendanceRecord.status = 'present';
        }

        await attendanceRecord.save();

        // Update user status
        user.loginStatus = "active";
        user.loginTime = loginTime;
        user.logoutTime = null;
        await user.save();

        // Attach attendance record to user object for return if needed by caller
        const userObj = user.toObject();
        userObj.currentAttendance = attendanceRecord;
        return userObj;
    }

    /**
     * Record a user logout (check-out).
     * @param {Object} user - The mongoose user document.
     * @param {Date} logoutTime - The time of logout.
     * @returns {Promise<Object>} - The updated user document.
     */
    async recordLogout(user, logoutTime = new Date()) {
        user.loginStatus = "inactive";
        user.logoutTime = logoutTime;
        await user.save();

        const logoutDate = getDateWithoutTime(logoutTime);

        const attendanceRecord = await Attendance.findOne({
            user: user._id,
            date: {
                $gte: logoutDate,
                $lt: new Date(logoutDate.getTime() + 24 * 60 * 60 * 1000)
            }
        });

        if (attendanceRecord) {
            attendanceRecord.logoutTime = logoutTime;

            // Calculate total hours worked today
            if (attendanceRecord.loginTime) {
                const diffMs = logoutTime - attendanceRecord.loginTime;
                const diffHours = diffMs / (1000 * 60 * 60);
                attendanceRecord.totalHours = parseFloat(diffHours.toFixed(2));
            }
            await attendanceRecord.save();
        }

        return user;
    }
}

module.exports = new AttendanceService();
