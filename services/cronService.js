const User = require('../models/User');
const Attendance = require('../models/Attendance');
const attendanceService = require('./attendanceService');

class CronService {
    constructor() {
        this.checkInterval = 60 * 60 * 1000; // Check every hour
    }

    startAutoLogoutJob() {
        console.log('Starting Auto-Logout Job...');

        // Run immediately on startup to catch any leftover sessions from crash/restart if it's night
        this.checkAndLogout();

        // Set interval
        setInterval(() => {
            this.checkAndLogout();
        }, this.checkInterval);
    }

    async checkAndLogout() {
        try {
            const now = new Date();
            const hour = now.getHours();

            // Only run the heavy logout logic between 11 PM and 4 AM to close previous day's sessions
            // effectively acting as a "Nightly" job.
            if (hour >= 23 || hour < 4) {
                console.log(`[Cron] Running Nightly Auto-Logout check at ${now.toLocaleTimeString()}`);

                // Find users who are logged in (loginStatus: 'active')
                const activeUsers = await User.find({ loginStatus: 'active' });

                // Also find open attendance records (safety net) where logoutTime is null
                // We limit to records from the last 48 hours to avoid touching ancient history
                const twoDaysAgo = new Date();
                twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

                const openAttendances = await Attendance.find({
                    logoutTime: null,
                    date: { $gte: twoDaysAgo }
                }).populate('user');

                // Merge the lists (unique users)
                const usersMap = new Map();

                activeUsers.forEach(u => usersMap.set(u._id.toString(), u));
                openAttendances.forEach(a => {
                    if (a.user) {
                        usersMap.set(a.user._id.toString(), a.user);
                    }
                });

                if (usersMap.size > 0) {
                    console.log(`[Cron] Found ${usersMap.size} users/sessions to auto-logout.`);

                    for (const user of usersMap.values()) {
                        try {
                            // Determine the auto-logout time
                            let logoutTime = new Date(); // default now

                            // Use loginTime from user or try to find it from attendance
                            // We will just use the logic of "10 PM of the login day"

                            // If user has a loginTime property set
                            let loginRefTime = user.loginTime;

                            // If not valid on user, try to finding the open attendance record for this user
                            if (!loginRefTime) {
                                const userAtt = openAttendances.find(a => a.user._id.toString() === user._id.toString());
                                if (userAtt) loginRefTime = userAtt.loginTime;
                            }

                            if (loginRefTime) {
                                const loginDate = new Date(loginRefTime);
                                const targetLogout = new Date(loginDate);
                                targetLogout.setHours(22, 0, 0, 0); // Set to 10 PM

                                // Ensure logout is after login
                                if (targetLogout > loginDate) {
                                    logoutTime = targetLogout;
                                } else {
                                    // If they logged in AFTER 10 PM, just use 11:59 PM
                                    const lateNight = new Date(loginDate);
                                    lateNight.setHours(23, 59, 59, 999);
                                    logoutTime = lateNight;
                                }
                            }

                            console.log(`[Cron] Auto-logging out ${user.username} at ${logoutTime.toLocaleString()}`);
                            await attendanceService.recordLogout(user, logoutTime);

                        } catch (err) {
                            console.error(`[Cron] Error logging out ${user.username || 'unknown'}:`, err);
                        }
                    }
                } else {
                    // console.log('[Cron] No active users to logout.');
                }
            }
        } catch (error) {
            console.error('[Cron] Error in auto-logout job:', error);
        }
    }
}

module.exports = new CronService();
