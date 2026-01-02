const { exec } = require('child_process');

class MobilePartnerManager {
    constructor() {
        this.mobilePartnerPath = 'C:\\Program Files (x86)\\Mobile Partner\\Mobile Partner.exe';
        this.isRunning = false;
    }

    /**
     * Start Mobile Partner in the background
     */
    async start() {
        return new Promise((resolve, reject) => {
            console.log('Starting Mobile Partner...');

            // Start Mobile Partner minimized
            exec(`start "" /MIN "${this.mobilePartnerPath}"`, (error) => {
                if (error) {
                    console.error('Failed to start Mobile Partner:', error);
                    reject(error);
                } else {
                    this.isRunning = true;
                    console.log('Mobile Partner started successfully');

                    // Wait for Mobile Partner to initialize
                    setTimeout(() => resolve(), 3000);
                }
            });
        });
    }

    /**
     * Check if Mobile Partner is currently running
     */
    async checkRunning() {
        return new Promise((resolve) => {
            exec('tasklist /FI "IMAGENAME eq Mobile Partner.exe"', (error, stdout) => {
                this.isRunning = stdout.includes('Mobile Partner.exe');
                resolve(this.isRunning);
            });
        });
    }

    /**
     * Ensure Mobile Partner is running, start it if not
     */
    async ensureRunning() {
        const running = await this.checkRunning();

        if (!running) {
            console.log('Mobile Partner not running, starting...');
            await this.start();
        } else {
            console.log('Mobile Partner already running');
        }

        return true;
    }

    /**
     * Stop Mobile Partner
     */
    async stop() {
        return new Promise((resolve, reject) => {
            exec('taskkill /F /IM "Mobile Partner.exe"', (error) => {
                if (error) {
                    reject(error);
                } else {
                    this.isRunning = false;
                    resolve();
                }
            });
        });
    }
}

module.exports = new MobilePartnerManager();
