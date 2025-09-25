const path = require('path');

module.exports = {
    server: {
        port: process.env.PORT || 3000,
        host: process.env.HOST || '0.0.0.0',
        timeout: 300000 // 5 minutes
    },
    
    storage: {
        path: path.join(__dirname, '../../storage'),
        uploads: path.join(__dirname, '../../storage/uploads'),
        renders: path.join(__dirname, '../../storage/renders'),
        maxFileSize: 100 * 1024 * 1024, // 100MB
        allowedExtensions: ['.glb', '.gltf']
    },
    
    renderer: {
        timeout: 120000, // 2 minutes
        width: 1200,
        height: 800,
        views: ['front', 'back', 'left', 'right', 'top', 'bottom'],
        outputFormat: 'png',
        quality: 90,
        maxConcurrentRenders: 3
    },
    
    puppeteer: {
        headless: 'new',
        timeout: 60000,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--allow-running-insecure-content',
            '--disable-extensions'
        ]
    },
    
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: process.env.NODE_ENV === 'production' ? 'json' : 'pretty',
        file: process.env.LOG_FILE || null
    },
    
    ssl: {
        enabled: process.env.SSL_ENABLED === 'true',
        domain: process.env.DOMAIN || '3d.itsoa.io.vn',
        email: process.env.SSL_EMAIL || 'admin@itsoa.io.vn',
        cloudflareToken: process.env.CLOUDFLARE_TOKEN || '3YeqmF46MSojOcJ6zi7rjlQpyKZGC-cXRLgO_AWj'
    },
    
    security: {
        rateLimitWindow: 15 * 60 * 1000, // 15 minutes
        rateLimitMax: 100, // requests per window
        corsOrigins: process.env.NODE_ENV === 'production' 
            ? ['https://3d.itsoa.io.vn', 'https://www.3d.itsoa.io.vn']
            : ['http://localhost:3000', 'http://localhost:8080']
    }
};