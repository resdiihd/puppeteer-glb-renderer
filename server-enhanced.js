const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const config = {
    maxFileSize: 50 * 1024 * 1024, // 50MB
    allowedExtensions: ['.glb', '.gltf'],
    renderTimeout: 30000,
    renderWidth: 1200,
    renderHeight: 800,
    views: ['front', 'back', 'left', 'right', 'top', 'bottom']
};

// Storage setup
const storageDir = path.join(__dirname, '..', 'storage');
const uploadsDir = path.join(storageDir, 'uploads');
const rendersDir = path.join(storageDir, 'renders');

// Create directories if they don't exist
[storageDir, uploadsDir, rendersDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/storage', express.static(storageDir));

// Multer configuration
const storage = multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
        const uniqueId = uuidv4();
        const ext = path.extname(file.originalname);
        cb(null, `${uniqueId}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: config.maxFileSize },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (config.allowedExtensions.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`Only ${config.allowedExtensions.join(', ')} files are allowed`));
        }
    }
});

// Enhanced Puppeteer Renderer Class
class PuppeteerGLBRenderer {
    constructor() {
        this.browser = null;
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            console.log('🚀 Initializing Puppeteer GLB Renderer...');
            
            this.browser = await puppeteer.launch({
                headless: 'new',
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
                ],
                timeout: 60000
            });

            this.isInitialized = true;
            console.log('✅ Puppeteer initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize Puppeteer:', error.message);
            throw new Error(`Puppeteer initialization failed: ${error.message}`);
        }
    }

    async renderGLB(glbPath, options = {}) {
        const startTime = Date.now();
        let page = null;
        
        try {
            await this.initialize();
            
            const {
                width = config.renderWidth,
                height = config.renderHeight,
                views = config.views,
                outputDir = rendersDir
            } = options;

            console.log(`🎨 Starting GLB render for: ${path.basename(glbPath)}`);
            console.log(`📏 Dimensions: ${width}x${height}`);
            console.log(`👁️  Views: ${views.join(', ')}`);

            // Create page
            page = await this.browser.newPage();
            await page.setViewport({ width, height });
            
            // Enable console logging from page
            page.on('console', msg => {
                const type = msg.type();
                const text = msg.text();
                if (type === 'error') {
                    console.error('🔴 Page Error:', text);
                } else if (type === 'warn') {
                    console.warn('🟡 Page Warning:', text);
                } else {
                    console.log('🔵 Page Log:', text);
                }
            });

            // Handle page errors
            page.on('pageerror', error => {
                console.error('💥 Page crash:', error.message);
            });

            // Read GLB file and convert to base64
            const glbBuffer = fs.readFileSync(glbPath);
            const glbBase64 = glbBuffer.toString('base64');
            const glbDataUrl = `data:model/gltf-binary;base64,${glbBase64}`;

            console.log(`📊 GLB file size: ${(glbBuffer.length / 1024 / 1024).toFixed(2)} MB`);

            // Generate enhanced HTML content
            const htmlContent = this.generateRenderHTML(glbDataUrl, { width, height });

            // Set content and wait for page load
            await page.setContent(htmlContent, { 
                waitUntil: 'networkidle0',
                timeout: 30000 
            });

            console.log('📝 HTML content loaded, waiting for Three.js...');

            // Wait for Three.js to be ready
            await page.waitForFunction(() => {
                return typeof window.THREE !== 'undefined' && 
                       typeof window.THREE.GLTFLoader !== 'undefined';
            }, { timeout: 20000 });

            console.log('✅ Three.js loaded successfully');

            // Initialize the 3D scene
            await page.evaluate(() => {
                return new Promise((resolve, reject) => {
                    try {
                        console.log('🎭 Initializing 3D scene...');
                        window.initScene();
                        
                        // Wait a bit for scene setup
                        setTimeout(() => {
                            console.log('✅ Scene initialized');
                            resolve();
                        }, 1000);
                    } catch (error) {
                        console.error('❌ Scene initialization failed:', error);
                        reject(error);
                    }
                });
            });

            // Load the GLB model
            await page.evaluate((dataUrl) => {
                return new Promise((resolve, reject) => {
                    try {
                        console.log('📦 Loading GLB model...');
                        window.loadGLBModel(dataUrl, (error, success) => {
                            if (error) {
                                console.error('❌ GLB loading failed:', error);
                                reject(new Error(error));
                            } else {
                                console.log('✅ GLB loaded successfully');
                                resolve(success);
                            }
                        });
                    } catch (error) {
                        console.error('💥 GLB loading exception:', error);
                        reject(error);
                    }
                });
            }, glbDataUrl);

            console.log('🎯 Model loaded, starting multi-view rendering...');

            // Render each view
            const results = [];
            const renderPromises = views.map(async (view, index) => {
                try {
                    console.log(`📸 Rendering ${view} view (${index + 1}/${views.length})...`);
                    
                    // Set camera position for this view
                    await page.evaluate((viewName) => {
                        window.setCameraView(viewName);
                    }, view);

                    // Wait for render to complete
                    await page.waitForTimeout(1000);

                    // Take screenshot
                    const filename = `${path.basename(glbPath, path.extname(glbPath))}_${view}_${Date.now()}.png`;
                    const outputPath = path.join(outputDir, filename);
                    
                    await page.screenshot({
                        path: outputPath,
                        type: 'png',
                        clip: {
                            x: 0,
                            y: 0,
                            width,
                            height
                        }
                    });

                    console.log(`✅ ${view} view rendered: ${filename}`);
                    
                    return {
                        view,
                        filename,
                        path: outputPath,
                        url: `/storage/renders/${filename}`,
                        size: fs.statSync(outputPath).size
                    };
                } catch (error) {
                    console.error(`❌ Failed to render ${view} view:`, error.message);
                    return {
                        view,
                        error: error.message
                    };
                }
            });

            const renderResults = await Promise.all(renderPromises);
            
            const successful = renderResults.filter(r => !r.error);
            const failed = renderResults.filter(r => r.error);

            const totalTime = Date.now() - startTime;
            
            console.log(`🎉 Rendering completed in ${totalTime}ms`);
            console.log(`✅ Successful: ${successful.length}/${views.length} views`);
            if (failed.length > 0) {
                console.log(`❌ Failed: ${failed.length} views`);
                failed.forEach(f => console.log(`   - ${f.view}: ${f.error}`));
            }

            return {
                success: true,
                renders: renderResults,
                stats: {
                    totalViews: views.length,
                    successfulViews: successful.length,
                    failedViews: failed.length,
                    renderTime: totalTime,
                    fileSize: glbBuffer.length
                }
            };

        } catch (error) {
            const totalTime = Date.now() - startTime;
            console.error(`💥 GLB rendering failed after ${totalTime}ms:`, error.message);
            
            return {
                success: false,
                error: error.message,
                stats: {
                    renderTime: totalTime
                }
            };
        } finally {
            if (page) {
                try {
                    await page.close();
                } catch (closeError) {
                    console.error('⚠️  Failed to close page:', closeError.message);
                }
            }
        }
    }

    generateRenderHTML(glbDataUrl, options) {
        const { width, height } = options;
        
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GLB Renderer</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            background: linear-gradient(45deg, #1a1a1a, #2d2d2d);
            overflow: hidden;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        #container { 
            width: ${width}px; 
            height: ${height}px; 
            position: relative;
            border: 2px solid #444;
        }
        #loading {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #fff;
            font-size: 18px;
            z-index: 1000;
        }
        .spinner {
            border: 4px solid #333;
            border-top: 4px solid #007acc;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 10px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div id="container">
        <div id="loading">
            <div class="spinner"></div>
            <div>Loading GLB Model...</div>
        </div>
    </div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r158/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.158.0/examples/js/loaders/GLTFLoader.js"></script>
    <script>
        console.log('🚀 Initializing GLB renderer...');
        
        let scene, camera, renderer, model, controls;
        let isSceneReady = false;
        let isModelLoaded = false;

        // Camera view configurations
        const cameraViews = {
            front: { x: 0, y: 0, z: 5 },
            back: { x: 0, y: 0, z: -5 },
            left: { x: -5, y: 0, z: 0 },
            right: { x: 5, y: 0, z: 0 },
            top: { x: 0, y: 5, z: 0 },
            bottom: { x: 0, y: -5, z: 0 }
        };

        function initScene() {
            try {
                console.log('🎭 Setting up Three.js scene...');
                
                // Scene
                scene = new THREE.Scene();
                scene.background = new THREE.Color(0x1a1a1a);
                
                // Camera
                camera = new THREE.PerspectiveCamera(
                    75, 
                    ${width} / ${height}, 
                    0.1, 
                    1000
                );
                camera.position.set(0, 0, 5);
                
                // Renderer
                renderer = new THREE.WebGLRenderer({ 
                    antialias: true,
                    alpha: true,
                    preserveDrawingBuffer: true
                });
                renderer.setSize(${width}, ${height});
                renderer.setClearColor(0x1a1a1a, 1);
                renderer.shadowMap.enabled = true;
                renderer.shadowMap.type = THREE.PCFSoftShadowMap;
                
                document.getElementById('container').appendChild(renderer.domElement);
                
                // Lighting setup
                const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
                scene.add(ambientLight);
                
                const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
                directionalLight.position.set(10, 10, 5);
                directionalLight.castShadow = true;
                directionalLight.shadow.mapSize.width = 2048;
                directionalLight.shadow.mapSize.height = 2048;
                scene.add(directionalLight);
                
                const hemisphereLight = new THREE.HemisphereLight(0x87CEEB, 0x98FB98, 0.4);
                scene.add(hemisphereLight);
                
                // Grid helper
                const gridHelper = new THREE.GridHelper(10, 10, 0x444444, 0x222222);
                scene.add(gridHelper);
                
                isSceneReady = true;
                console.log('✅ Scene initialized successfully');
                
                // Start render loop
                animate();
                
            } catch (error) {
                console.error('❌ Scene initialization failed:', error);
                throw error;
            }
        }

        function loadGLBModel(dataUrl, callback) {
            try {
                console.log('📦 Loading GLB model from data URL...');
                
                if (!window.THREE || !window.THREE.GLTFLoader) {
                    throw new Error('GLTFLoader not available');
                }
                
                const loader = new THREE.GLTFLoader();
                
                loader.load(
                    dataUrl,
                    function(gltf) {
                        try {
                            console.log('✅ GLB loaded successfully:', gltf);
                            
                            model = gltf.scene;
                            
                            // Calculate bounding box and center model
                            const box = new THREE.Box3().setFromObject(model);
                            const center = box.getCenter(new THREE.Vector3());
                            const size = box.getSize(new THREE.Vector3());
                            
                            console.log('📐 Model dimensions:', {
                                center: center.toArray(),
                                size: size.toArray()
                            });
                            
                            // Center the model
                            model.position.sub(center);
                            
                            // Scale if too large
                            const maxDimension = Math.max(size.x, size.y, size.z);
                            if (maxDimension > 4) {
                                const scale = 4 / maxDimension;
                                model.scale.multiplyScalar(scale);
                                console.log(\`🔧 Model scaled by factor: \${scale}\`);
                            }
                            
                            // Enable shadows
                            model.traverse(function(child) {
                                if (child.isMesh) {
                                    child.castShadow = true;
                                    child.receiveShadow = true;
                                }
                            });
                            
                            scene.add(model);
                            isModelLoaded = true;
                            
                            // Hide loading indicator
                            const loading = document.getElementById('loading');
                            if (loading) loading.style.display = 'none';
                            
                            console.log('🎉 Model added to scene successfully');
                            callback(null, true);
                            
                        } catch (error) {
                            console.error('❌ Error processing loaded model:', error);
                            callback(error.message, false);
                        }
                    },
                    function(progress) {
                        const percent = (progress.loaded / progress.total * 100).toFixed(2);
                        console.log(\`📊 Loading progress: \${percent}%\`);
                    },
                    function(error) {
                        console.error('❌ GLB loading failed:', error);
                        callback(error.message || 'Failed to load GLB model', false);
                    }
                );
                
            } catch (error) {
                console.error('💥 GLB loader setup failed:', error);
                callback(error.message, false);
            }
        }

        function setCameraView(viewName) {
            if (!cameraViews[viewName]) {
                console.warn(\`⚠️  Unknown view: \${viewName}\`);
                return;
            }
            
            const view = cameraViews[viewName];
            camera.position.set(view.x, view.y, view.z);
            camera.lookAt(0, 0, 0);
            
            console.log(\`👁️  Camera set to \${viewName} view:`, view);
        }

        function animate() {
            requestAnimationFrame(animate);
            
            if (isSceneReady && renderer && scene && camera) {
                // Gentle rotation for better visualization
                if (isModelLoaded && model) {
                    model.rotation.y += 0.005;
                }
                
                renderer.render(scene, camera);
            }
        }

        // Global functions for Puppeteer
        window.initScene = initScene;
        window.loadGLBModel = loadGLBModel;
        window.setCameraView = setCameraView;
        
        console.log('🎪 GLB renderer ready!');
    </script>
</body>
</html>`;
    }

    async close() {
        if (this.browser) {
            try {
                await this.browser.close();
                this.isInitialized = false;
                console.log('👋 Puppeteer browser closed');
            } catch (error) {
                console.error('⚠️  Error closing browser:', error.message);
            }
        }
    }
}

// Create renderer instance
const glbRenderer = new PuppeteerGLBRenderer();

// Routes
app.get('/', (req, res) => {
    res.json({
        service: 'Puppeteer GLB Renderer',
        version: '2.0.0',
        status: 'running',
        features: [
            'GLB/GLTF file upload',
            'Multi-view rendering',
            'High-quality screenshots',
            'Base64 model processing',
            'Enhanced Three.js integration'
        ],
        endpoints: {
            'GET /': 'Service information',
            'GET /health': 'Health check',
            'POST /upload': 'Upload GLB/GLTF files',
            'POST /render/:filename': 'Render GLB to images',
            'GET /files': 'List uploaded files',
            'GET /renders': 'List rendered images'
        }
    });
});

app.get('/health', async (req, res) => {
    try {
        const puppeteerStatus = glbRenderer.isInitialized ? 'ready' : 'initializing';
        
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            puppeteer: puppeteerStatus,
            storage: {
                uploads: fs.readdirSync(uploadsDir).length,
                renders: fs.readdirSync(rendersDir).length
            },
            system: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                node: process.version
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'unhealthy',
            error: error.message
        });
    }
});

app.post('/upload', upload.single('glb'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }

        const fileInfo = {
            filename: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size,
            uploadedAt: new Date().toISOString(),
            url: `/storage/uploads/${req.file.filename}`
        };

        console.log('📁 File uploaded:', fileInfo);

        res.json({
            success: true,
            message: 'File uploaded successfully',
            file: fileInfo
        });
    } catch (error) {
        console.error('❌ Upload error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/render/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(uploadsDir, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                error: 'File not found'
            });
        }

        console.log(`🎨 Starting render for: ${filename}`);

        const options = {
            width: parseInt(req.body.width) || config.renderWidth,
            height: parseInt(req.body.height) || config.renderHeight,
            views: req.body.views || config.views
        };

        const result = await glbRenderer.renderGLB(filePath, options);

        if (result.success) {
            res.json({
                success: true,
                message: 'Rendering completed successfully',
                data: result
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error,
                stats: result.stats
            });
        }
    } catch (error) {
        console.error('❌ Render error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/files', (req, res) => {
    try {
        const files = fs.readdirSync(uploadsDir).map(filename => {
            const filePath = path.join(uploadsDir, filename);
            const stats = fs.statSync(filePath);
            
            return {
                filename,
                size: stats.size,
                uploadedAt: stats.birthtime.toISOString(),
                url: `/storage/uploads/${filename}`
            };
        });

        res.json({
            success: true,
            files,
            count: files.length
        });
    } catch (error) {
        console.error('❌ Files listing error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/renders', (req, res) => {
    try {
        const renders = fs.readdirSync(rendersDir).map(filename => {
            const filePath = path.join(rendersDir, filename);
            const stats = fs.statSync(filePath);
            
            return {
                filename,
                size: stats.size,
                createdAt: stats.birthtime.toISOString(),
                url: `/storage/renders/${filename}`
            };
        });

        res.json({
            success: true,
            renders,
            count: renders.length
        });
    } catch (error) {
        console.error('❌ Renders listing error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Error handling
app.use((error, req, res, next) => {
    console.error('💥 Server error:', error);
    
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: `File too large. Maximum size is ${config.maxFileSize / 1024 / 1024}MB`
            });
        }
    }

    res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
    });
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('🛑 Shutting down server...');
    await glbRenderer.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('🛑 Shutting down server...');
    await glbRenderer.close();
    process.exit(0);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 Enhanced Puppeteer GLB Renderer Server');
    console.log(`📍 Server running on: http://0.0.0.0:${PORT}`);
    console.log(`📁 Storage directory: ${storageDir}`);
    console.log(`⚙️  Configuration:`, config);
    console.log('🎯 Ready to render GLB models!');
});

module.exports = app;