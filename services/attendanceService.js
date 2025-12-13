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
     * @returns {Promise<Object>} - The updated user document.
     */
    async recordLogin(user, loginTime = new Date()) {
        const loginDate = getDateWithoutTime(loginTime);

        // Find existing attendance record for today
        let attendanceRecord = user.attendanceRecords.find(record =>
            getDateWithoutTime(record.date).getTime() === loginDate.getTime()
        );

        if (!attendanceRecord) {
            // Create new attendance record for today
            attendanceRecord = {
                date: loginDate,
                loginTime: loginTime,
                logoutTime: null,
                totalHours: 0,
                status: 'logged-in' // Explicitly set status
            };
            user.attendanceRecords.push(attendanceRecord);
        } else {
            // Preserve the original login time if it exists
            if (!attendanceRecord.loginTime) {
                attendanceRecord.loginTime = loginTime;
            }
            // Reset logout time and total hours for a new session
            attendanceRecord.logoutTime = null;
            attendanceRecord.totalHours = 0;
            attendanceRecord.status = 'logged-in'; // Explicitly update status
        }

        user.loginStatus = "active";
        // Update top-level fields for backward compatibility/fast access
        user.loginTime = loginTime;
        user.logoutTime = null;

        await user.save();
        return user;
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

        const logoutDate = getDateWithoutTime(logoutTime);
        const attendanceRecord = user.attendanceRecords.find(record =>
            getDateWithoutTime(record.date).getTime() === logoutDate.getTime()
        );

        if (attendanceRecord) {
            attendanceRecord.logoutTime = logoutTime;

            // Calculate total hours worked today
            // Simple calculation: logout - login. 
            // NOTE: This simple difference doesn't account for multiple sessions/breaks if simple overwrite is used on login.
            // But we are refactoring, not rewriting business logic completely yet.
            if (attendanceRecord.loginTime) {
                const diffMs = logoutTime - attendanceRecord.loginTime;
                const diffHours = diffMs / (1000 * 60 * 60);
                attendanceRecord.totalHours = parseFloat(diffHours.toFixed(2));
            }
        }

        await user.save();
        return user;
    }
}

module.exports = new AttendanceService();
