const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');

const config = require('./config/config');
const logger = require('./utils/logger');
const { errorHandler, AppError } = require('./middleware/errorHandler');
const uploadRoutes = require('./routes/upload');
const renderRoutes = require('./routes/render');
const healthRoutes = require('./routes/health');

class GLBRendererServer {
    constructor() {
        this.app = express();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    setupMiddleware() {
        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
                    imgSrc: ["'self'", "data:"],
                    connectSrc: ["'self'"],
                },
            },
        }));

        // CORS configuration
        this.app.use(cors({
            origin: process.env.NODE_ENV === 'production' 
                ? ['https://3d.itsoa.io.vn', 'https://www.3d.itsoa.io.vn']
                : true,
            credentials: true,
            optionsSuccessStatus: 200
        }));

        // Rate limiting
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // limit each IP to 100 requests per windowMs
            message: {
                error: 'Too many requests from this IP, please try again later.'
            },
            standardHeaders: true,
            legacyHeaders: false,
        });
        this.app.use(limiter);

        // Body parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Request ID middleware
        this.app.use((req, res, next) => {
            req.id = uuidv4();
            res.set('X-Request-ID', req.id);
            next();
        });

        // Request logging
        this.app.use((req, res, next) => {
            logger.info('Request received', {
                requestId: req.id,
                method: req.method,
                url: req.url,
                userAgent: req.get('user-agent'),
                ip: req.ip
            });
            next();
        });

        // Static file serving
        this.app.use('/storage', express.static(config.storage.path, {
            maxAge: '1h',
            etag: true,
            lastModified: true
        }));
    }

    setupRoutes() {
        // API routes
        this.app.use('/api/health', healthRoutes);
        this.app.use('/api/upload', uploadRoutes);
        this.app.use('/api/render', renderRoutes);

        // Legacy routes (for backward compatibility)
        this.app.use('/health', healthRoutes);
        this.app.use('/upload', uploadRoutes);
        this.app.use('/render', renderRoutes);

        // Root endpoint
        this.app.get('/', (req, res) => {
            res.json({
                service: 'GLB Renderer API',
                version: '2.0.0',
                status: 'running',
                documentation: '/api/docs',
                endpoints: {
                    health: '/api/health',
                    upload: '/api/upload',
                    render: '/api/render/:filename',
                    storage: '/storage'
                },
                features: [
                    'Multi-view GLB rendering',
                    'Server-side processing',
                    'High-quality output',
                    'Scalable architecture'
                ]
            });
        });

        // Handle undefined routes
        this.app.use('*', (req, res) => {
            res.status(404).json({
                success: false,
                error: 'Route not found',
                requestId: req.id
            });
        });
    }

    setupErrorHandling() {
        this.app.use(errorHandler);
    }

    start() {
        const port = config.server.port;
        const host = config.server.host;

        this.server = this.app.listen(port, host, () => {
            logger.info(`GLB Renderer Server started`, {
                port,
                host,
                environment: process.env.NODE_ENV || 'development',
                version: '2.0.0'
            });
        });

        // Graceful shutdown handling
        const gracefulShutdown = (signal) => {
            logger.info(`Received ${signal}, starting graceful shutdown...`);
            
            this.server.close(() => {
                logger.info('Server closed successfully');
                process.exit(0);
            });

            // Force close after 10 seconds
            setTimeout(() => {
                logger.error('Force closing server after timeout');
                process.exit(1);
            }, 10000);
        };

        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    }
}

module.exports = GLBRendererServer;

// Start server if this file is run directly
if (require.main === module) {
    const server = new GLBRendererServer();
    server.start();
}