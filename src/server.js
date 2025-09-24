const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

const PuppeteerRenderer = require('./renderer/puppeteer-renderer');
const JobQueue = require('./queue/job-queue');

const app = express();
const PORT = process.env.PORT || 3000;

// Security & CORS
app.use(helmet({
    contentSecurityPolicy: false // Allow inline scripts for viewer
}));
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Static files
app.use('/viewer', express.static(path.join(__dirname, 'viewer')));
app.use('/storage', express.static(path.join(__dirname, '../storage')));

// File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../storage/uploads'));
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'model/gltf-binary' || 
            file.originalname.toLowerCase().endsWith('.glb')) {
            cb(null, true);
        } else {
            cb(new Error('Only GLB files allowed!'), false);
        }
    },
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Initialize services
const renderer = new PuppeteerRenderer();
const jobQueue = new JobQueue();

// API Routes
app.get('/', (req, res) => {
    res.json({
        service: 'Puppeteer GLB Renderer',
        version: '1.0.0',
        features: [
            'Multiple Views (Front, Side, Top, Perspective)',
            'Animation Support (GLB + Turntable)',
            'Video Export (MP4, GIF)',
            'Quality Presets (Ultra/High/Medium/Low)',
            'Batch Processing',
            'HDR Backgrounds',
            'Advanced Lighting'
        ],
        endpoints: {
            upload: 'POST /api/upload',
            render: 'POST /api/render',
            job: 'GET /api/job/:id',
            files: 'GET /api/files',
            download: 'GET /api/download/:id'
        }
    });
});

// Health check
app.get('/health', async (req, res) => {
    try {
        const puppeteerStatus = await renderer.checkHealth();
        res.json({
            status: 'healthy',
            puppeteer: puppeteerStatus,
            jobs: jobQueue.getStats(),
            storage: {
                uploads: fs.readdirSync(path.join(__dirname, '../storage/uploads')).length,
                renders: fs.readdirSync(path.join(__dirname, '../storage/renders')).length
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'unhealthy',
            error: error.message
        });
    }
});

// Upload GLB file
app.post('/api/upload', upload.single('glb'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No GLB file uploaded' });
        }

        res.json({
            success: true,
            file: {
                id: req.file.filename,
                originalName: req.file.originalname,
                size: req.file.size,
                path: req.file.path
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List available GLB files
app.get('/api/files', async (req, res) => {
    try {
        const uploadsDir = path.join(__dirname, '../storage/uploads');
        const files = await fs.readdir(uploadsDir);
        
        const glbFiles = await Promise.all(
            files
                .filter(file => file.toLowerCase().endsWith('.glb'))
                .map(async file => {
                    const filePath = path.join(uploadsDir, file);
                    const stats = await fs.stat(filePath);
                    return {
                        name: file,
                        size: stats.size,
                        modified: stats.mtime,
                        path: `/storage/uploads/${file}`
                    };
                })
        );

        res.json({
            success: true,
            files: glbFiles,
            count: glbFiles.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start rendering job
app.post('/api/render', async (req, res) => {
    try {
        const {
            fileName,
            options = {}
        } = req.body;

        if (!fileName) {
            return res.status(400).json({ error: 'fileName is required' });
        }

        // Default render options
        const renderOptions = {
            // Basic settings
            width: options.width || 1920,
            height: options.height || 1080,
            format: options.format || 'png', // png, jpg, webp, mp4, gif
            quality: options.quality || 90,
            
            // Views and cameras
            views: options.views || ['perspective'], // front, side, top, perspective, all
            cameraDistance: options.cameraDistance || 'auto',
            
            // Lighting
            lighting: options.lighting || 'studio', // studio, outdoor, dramatic, custom
            shadows: options.shadows !== false,
            
            // Background
            background: options.background || '#ffffff',
            transparent: options.transparent || false,
            
            // Animation
            turntable: options.turntable || false,
            duration: options.duration || 5, // seconds
            fps: options.fps || 30,
            
            // Quality preset
            preset: options.preset || 'high', // ultra, high, medium, low
            
            // Advanced
            antialiasing: options.antialiasing !== false,
            postProcessing: options.postProcessing || false,
            hdrEnvironment: options.hdrEnvironment || null
        };

        const jobId = await jobQueue.addJob({
            type: 'render',
            fileName,
            options: renderOptions
        });

        res.json({
            success: true,
            jobId,
            message: 'Render job started',
            options: renderOptions
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get job status
app.get('/api/job/:id', (req, res) => {
    try {
        const job = jobQueue.getJob(req.params.id);
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        res.json({
            success: true,
            job
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Download result
app.get('/api/download/:id', async (req, res) => {
    try {
        const job = jobQueue.getJob(req.params.id);
        if (!job || !job.result) {
            return res.status(404).json({ error: 'Result not found' });
        }

        const filePath = path.join(__dirname, '../storage/renders', job.result.fileName);
        
        if (!(await fs.pathExists(filePath))) {
            return res.status(404).json({ error: 'File not found' });
        }

        res.download(filePath);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
async function startServer() {
    try {
        // Ensure directories exist
        await fs.ensureDir(path.join(__dirname, '../storage/uploads'));
        await fs.ensureDir(path.join(__dirname, '../storage/renders'));
        await fs.ensureDir(path.join(__dirname, '../storage/temp'));
        
        // Copy backup GLB files if they exist
        const backupDir = path.join(__dirname, '../backup');
        if (await fs.pathExists(backupDir)) {
            const backupFiles = await fs.readdir(backupDir);
            for (const file of backupFiles) {
                if (file.toLowerCase().endsWith('.glb')) {
                    await fs.copy(
                        path.join(backupDir, file),
                        path.join(__dirname, '../storage/uploads', file)
                    );
                    console.log(`📁 Restored: ${file}`);
                }
            }
        }
        
        // Initialize renderer
        await renderer.initialize();
        
        // Start job processing
        jobQueue.start(renderer);
        
        app.listen(PORT, () => {
            console.log(`🚀 Puppeteer GLB Renderer running on port ${PORT}`);
            console.log(`📖 API Documentation: http://localhost:${PORT}`);
            console.log(`🎨 GLB Viewer: http://localhost:${PORT}/viewer`);
            console.log(`💾 Storage: http://localhost:${PORT}/storage`);
            console.log('✨ All features ready: Multi-view, Animations, Video export, Batch processing!');
        });
        
    } catch (error) {
        console.error('❌ Server startup failed:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 Shutting down server...');
    await renderer.cleanup();
    jobQueue.stop();
    process.exit(0);
});

startServer();

module.exports = app;