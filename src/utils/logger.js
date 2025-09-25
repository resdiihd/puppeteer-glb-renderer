const winston = require('winston');
const path = require('path');
const config = require('../config/config');

// Define log format
const logFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

const prettyFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let log = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(meta).length > 0) {
            log += ` ${JSON.stringify(meta, null, 2)}`;
        }
        return log;
    })
);

// Create transports
const transports = [
    new winston.transports.Console({
        format: config.logging.format === 'json' ? logFormat : prettyFormat
    })
];

// Add file transport if specified
if (config.logging.file) {
    transports.push(
        new winston.transports.File({
            filename: path.resolve(config.logging.file),
            format: logFormat,
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5
        })
    );
}

// Create logger
const logger = winston.createLogger({
    level: config.logging.level,
    format: logFormat,
    transports,
    exceptionHandlers: transports,
    rejectionHandlers: transports,
    exitOnError: false
});

module.exports = logger;