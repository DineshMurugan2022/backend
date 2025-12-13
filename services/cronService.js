const User = require('../models/User');
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

                // Find users who are still logged in (loginStatus: 'active')
                // OR have a loginTime but no logoutTime
                const activeUsers = await User.find({
                    $or: [
                        { loginStatus: 'active' },
                        { loginStatus: 'inactive', 'attendanceRecords.loginTime': { $exists: true }, 'attendanceRecords.logoutTime': null }
                    ]
                });

                if (activeUsers.length > 0) {
                    console.log(`[Cron] Found ${activeUsers.length} users to auto-logout.`);

                    for (const user of activeUsers) {
                        try {
                            // Determine the auto-logout time (e.g., 10 PM of the day they logged in)
                            // For simplicity, we'll use the current time if it's clearly a "forgot" scenario,
                            // OR we could retroactively set it to 10 PM of the previous day if we are running at 1 AM.

                            // Let's set it to 10 PM (22:00) of the SAME day as the login if possible,
                            // or 10 PM of yesterday if running in the early morning.

                            let logoutTime = new Date(); // default now

                            // If user logged in today and it's 11 PM, logout time = 22:00 Today
                            // If user logged in yesterday and it's 1 AM, logout time = 22:00 Yesterday

                            if (user.loginTime) {
                                const loginDate = new Date(user.loginTime);
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
                            console.error(`[Cron] Error logging out ${user.username}:`, err);
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
