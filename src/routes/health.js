const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const config = require('../config/config');
const fs = require('fs').promises;
const path = require('path');

/**
 * Health check endpoint
 * @route GET /health
 * @route GET /api/health
 */
router.get('/', async (req, res) => {
    try {
        const startTime = Date.now();
        
        // Check system health
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            requestId: req.id,
            version: '2.0.0',
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development'
        };

        // Check memory usage
        const memUsage = process.memoryUsage();
        health.memory = {
            used: Math.round(memUsage.heapUsed / 1024 / 1024),
            total: Math.round(memUsage.heapTotal / 1024 / 1024),
            external: Math.round(memUsage.external / 1024 / 1024),
            rss: Math.round(memUsage.rss / 1024 / 1024)
        };

        // Check storage
        try {
            const uploadsExists = await fs.access(config.storage.uploads).then(() => true).catch(() => false);
            const rendersExists = await fs.access(config.storage.renders).then(() => true).catch(() => false);
            
            let uploadCount = 0;
            let renderCount = 0;
            
            if (uploadsExists) {
                const uploads = await fs.readdir(config.storage.uploads);
                uploadCount = uploads.length;
            }
            
            if (rendersExists) {
                const renders = await fs.readdir(config.storage.renders);
                renderCount = renders.length;
            }

            health.storage = {
                uploadsDir: uploadsExists,
                rendersDir: rendersExists,
                uploadedFiles: uploadCount,
                renderedFiles: renderCount
            };
        } catch (storageError) {
            logger.warn('Storage check failed', { error: storageError.message });
            health.storage = { status: 'error', message: storageError.message };
        }

        // Check Puppeteer/Chrome availability
        try {
            const puppeteer = require('puppeteer');
            health.renderer = {
                status: 'available',
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || 'bundled'
            };
        } catch (puppeteerError) {
            logger.warn('Puppeteer check failed', { error: puppeteerError.message });
            health.renderer = { status: 'error', message: puppeteerError.message };
        }

        // Response time
        health.responseTime = Date.now() - startTime;

        // Determine overall status
        const hasErrors = health.storage.status === 'error' || health.renderer.status === 'error';
        if (hasErrors) {
            health.status = 'degraded';
            res.status(503);
        }

        logger.info('Health check completed', {
            requestId: req.id,
            status: health.status,
            responseTime: health.responseTime
        });

        res.json(health);
    } catch (error) {
        logger.error('Health check failed', {
            requestId: req.id,
            error: error.message
        });

        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            requestId: req.id,
            error: error.message
        });
    }
});

/**
 * Readiness probe endpoint
 * @route GET /health/ready
 * @route GET /api/health/ready
 */
router.get('/ready', async (req, res) => {
    try {
        // Simple readiness check
        await fs.access(config.storage.path);
        
        res.json({
            status: 'ready',
            timestamp: new Date().toISOString(),
            requestId: req.id
        });
    } catch (error) {
        res.status(503).json({
            status: 'not ready',
            timestamp: new Date().toISOString(),
            requestId: req.id,
            error: error.message
        });
    }
});

/**
 * Liveness probe endpoint
 * @route GET /health/live
 * @route GET /api/health/live
 */
router.get('/live', (req, res) => {
    res.json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        requestId: req.id,
        uptime: process.uptime()
    });
});

module.exports = router;