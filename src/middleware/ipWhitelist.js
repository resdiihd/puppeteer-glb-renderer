const config = require('../config/config');
const logger = require('../utils/logger');
const { AppError } = require('./errorHandler');

/**
 * IP Whitelist Middleware
 * Restricts access to specified IP addresses
 */
const ipWhitelist = (req, res, next) => {
    // Skip IP checking for health endpoint and in development
    if (req.path === '/health' || process.env.NODE_ENV !== 'production') {
        return next();
    }

    // Get client IP (handle various proxy headers)
    const getClientIP = (req) => {
        return req.headers['cf-connecting-ip'] ||     // Cloudflare
               req.headers['x-forwarded-for']?.split(',')[0]?.trim() || // Standard proxy
               req.headers['x-real-ip'] ||            // Nginx proxy
               req.connection?.remoteAddress ||       // Direct connection
               req.socket?.remoteAddress ||
               req.ip;
    };

    const clientIP = getClientIP(req);
    const allowedIPs = process.env.ALLOWED_IPS ? process.env.ALLOWED_IPS.split(',').map(ip => ip.trim()) : [];

    // If no IPs are configured, allow all
    if (allowedIPs.length === 0) {
        logger.info('No IP whitelist configured, allowing all access', {
            requestId: req.id,
            clientIP,
            url: req.originalUrl
        });
        return next();
    }

    // Check if client IP is in whitelist
    const isAllowed = allowedIPs.some(allowedIP => {
        // Handle CIDR notation (basic implementation)
        if (allowedIP.includes('/')) {
            // For now, exact match - can be extended for subnet matching
            return clientIP === allowedIP.split('/')[0];
        }
        return clientIP === allowedIP;
    });

    if (isAllowed) {
        logger.info('IP access granted', {
            requestId: req.id,
            clientIP,
            url: req.originalUrl,
            allowedIPs
        });
        return next();
    } else {
        logger.warn('IP access denied', {
            requestId: req.id,
            clientIP,
            url: req.originalUrl,
            allowedIPs,
            userAgent: req.get('User-Agent')
        });
        
        return res.status(403).json({
            success: false,
            error: 'Access denied',
            message: 'Your IP address is not authorized to access this service',
            requestId: req.id,
            timestamp: new Date().toISOString()
        });
    }
};

module.exports = ipWhitelist;