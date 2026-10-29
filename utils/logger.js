const winston = require('winston');
const path = require('path');
const fs = require('fs');
const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);

// Vercel functions have a read-only deployment filesystem; use platform logs there.
const logDir = 'logs';
if (!isVercel && !fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

// Console format (more readable)
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, stack }) => {
        return `${timestamp} ${level}: ${stack || message}`;
    })
);

// Configure transports
const transports = [
    // Console output
    new winston.transports.Console({
        format: consoleFormat
    })
];

if (!isVercel) {
    require('winston-daily-rotate-file');
    transports.push(
        // Error logs with rotation
        new winston.transports.DailyRotateFile({
            filename: path.join(logDir, 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            level: 'error',
            maxFiles: '14d', // Keep 14 days of logs
            handleExceptions: true,
            handleRejections: true
        }),
        // All logs with rotation
        new winston.transports.DailyRotateFile({
            filename: path.join(logDir, 'combined-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxFiles: '14d'
        })
    );
}

const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
    format: logFormat,
    transports
});

// Create a stream for Morgan integration
logger.stream = {
    write: (message) => logger.info(message.trim())
};

module.exports = logger;
