const config = require('../config/config');
const logger = require('../utils/logger');
const { AppError } = require('./errorHandler');

/**
 * IP Whitelist Middleware with Cloudflare Support
 * - Allows Cloudflare IPs to connect to server
 * - Restricts end-user access based on CF-Connecting-IP header
 */
const ipWhitelist = (req, res, next) => {
    // Skip IP checking for health endpoint and in development
    if (req.path === '/health' || process.env.NODE_ENV !== 'production') {
        return next();
    }

    // Get real client IP from Cloudflare headers
    const getClientIP = (req) => {
        // Priority order: Cloudflare -> Standard proxy headers -> Direct connection
        return req.headers['cf-connecting-ip'] ||           // Real user IP from Cloudflare
               req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
               req.headers['x-real-ip'] ||                  
               req.connection?.remoteAddress ||
               req.socket?.remoteAddress ||
               req.ip;
    };

    // Get server IP (the IP that connected to nginx/server)
    const getServerIP = (req) => {
        return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.headers['x-real-ip'] ||
               req.connection?.remoteAddress ||
               req.socket?.remoteAddress ||
               req.ip;
    };

    const clientIP = getClientIP(req);
    const serverIP = getServerIP(req);
    const isFromCloudflare = req.headers['cf-connecting-ip'] ? true : false;

    const allowedIPs = process.env.ALLOWED_IPS ? process.env.ALLOWED_IPS.split(',').map(ip => ip.trim()) : [];

    // Log request details
    logger.info('IP whitelist check', {
        requestId: req.id,
        clientIP,
        serverIP,
        isFromCloudflare,
        path: req.path,
        userAgent: req.get('User-Agent')?.substring(0, 100)
    });

    // If no IPs are configured, allow all
    if (allowedIPs.length === 0) {
        logger.info('No IP whitelist configured, allowing all access', {
            requestId: req.id,
            clientIP,
            url: req.originalUrl
        });
        return next();
    }

    // Check if client IP (real user IP) is in whitelist
    const isAllowed = allowedIPs.some(allowedIP => {
        if (allowedIP.includes('/')) {
            // Basic CIDR support - can be enhanced
            return clientIP === allowedIP.split('/')[0];
        }
        return clientIP === allowedIP;
    });

    if (isAllowed) {
        logger.info('IP access granted', {
            requestId: req.id,
            clientIP,
            serverIP,
            isFromCloudflare,
            url: req.originalUrl,
            allowedIPs
        });
        return next();
    } else {
        logger.warn('IP access denied', {
            requestId: req.id,
            clientIP,
            serverIP,
            isFromCloudflare,
            url: req.originalUrl,
            allowedIPs,
            userAgent: req.get('User-Agent')
        });
        
        return res.status(403).json({
            success: false,
            error: 'Access denied',
            message: 'Your IP address is not authorized to access this service',
            clientIP: clientIP,
            requestId: req.id,
            timestamp: new Date().toISOString(),
            info: 'This service is restricted to authorized company IP addresses. Please contact your administrator if you need access.'
        });
    }
};

module.exports = ipWhitelist;