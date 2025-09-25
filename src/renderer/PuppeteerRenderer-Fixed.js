const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class PuppeteerRenderer {
    constructor() {
        this.browser = null;
        this.isReady = false;
    }

    async init() {
        try {
            console.log('🚀 Initializing Puppeteer browser...');
            
            this.browser = await puppeteer.launch({
                headless: 'new',
                executablePath: '/usr/bin/google-chrome',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-extensions',
                    '--no-first-run',
                    '--disable-default-apps',
                    '--allow-file-access-from-files'
                ]
            });
            
            this.isReady = true;
            console.log('✅ Puppeteer browser initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize Puppeteer:', error);
            throw error;
        }
    }

    async renderGLB(glbPath, options = {}) {
        if (!this.isReady) {
            throw new Error('Puppeteer not initialized');
        }

        const {
            width = 1024,
            height = 768,
            views = ['front']
        } = options;

        try {
            console.log(`🎨 Rendering GLB: ${path.basename(glbPath)}`);
            
            const page = await this.browser.newPage();
            await page.setViewport({ width, height });
            
            // Read GLB file as base64
            const glbBuffer = fs.readFileSync(glbPath);
            const glbBase64 = glbBuffer.toString('base64');
            
            console.log(`📁 GLB file size: ${glbBuffer.length} bytes`);
            
            // Generate viewer HTML with embedded GLB
            const viewerHTML = this.generateViewerHTML(glbBase64);
            
            console.log('📄 Setting HTML content...');
            await page.setContent(viewerHTML, { waitUntil: 'networkidle0' });
            
            console.log('⏳ Waiting for GLB to load...');
            
            // Custom polling for GLB loading
            let attempts = 0;
            const maxAttempts = 30;
            let glbLoaded = false;
            
            while (!glbLoaded && attempts < maxAttempts) {
                try {
                    const pageState = await page.evaluate(() => {
                        return {
                            glbLoaded: window.glbLoaded || false,
                            hasScene: !!window.scene,
                            hasModel: !!window.model,
                            errors: window.loadErrors || [],
                            threeLoaded: typeof THREE !== 'undefined',
                            gltfLoaderLoaded: typeof THREE !== 'undefined' && !!THREE.GLTFLoader
                        };
                    });
                    
                    if (attempts % 5 === 0) { // Log every 5th attempt
                        console.log(`🔍 Attempt ${attempts}: GLB loaded: ${pageState.glbLoaded}, Has model: ${pageState.hasModel}`);
                    }
                    
                    if (pageState.glbLoaded || pageState.hasModel) {
                        glbLoaded = true;
                        console.log('✅ GLB loaded successfully');
                        break;
                    }
                    
                    if (pageState.errors.length > 0) {
                        console.log('❌ Load errors:', pageState.errors);
                        // Try to continue anyway
                        if (pageState.hasScene) {
                            console.log('📦 Scene exists, continuing...');
                            glbLoaded = true;
                            break;
                        }
                    }
                    
                    attempts++;
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                } catch (evalError) {
                    console.log(`⚠️ Evaluation error attempt ${attempts}:`, evalError.message);
                    attempts++;
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            
            if (!glbLoaded) {
                console.log('⚠️ GLB loading timeout, taking screenshot anyway...');
            }
            
            const results = [];
            
            // Capture multiple views
            for (const view of views) {
                console.log(`📸 Capturing ${view} view...`);
                
                // Set camera view
                try {
                    await page.evaluate((viewName) => {
                        if (window.setView) {
                            window.setView(viewName);
                        }
                    }, view);
                } catch (viewError) {
                    console.log(`⚠️ View change failed for ${view}:`, viewError.message);
                }
                
                // Wait for camera to settle
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                const screenshot = await page.screenshot({
                    type: 'png',
                    clip: { x: 0, y: 0, width, height }
                });
                
                const filename = `render_${Date.now()}_${view}.png`;
                const renderPath = path.join(__dirname, '../../storage/renders', filename);
                
                // Ensure renders directory exists
                const renderDir = path.dirname(renderPath);
                if (!fs.existsSync(renderDir)) {
                    fs.mkdirSync(renderDir, { recursive: true });
                }
                
                fs.writeFileSync(renderPath, screenshot);
                results.push({
                    view,
                    filename,
                    path: renderPath
                });
                
                console.log(`✅ Captured ${view} view: ${filename} (${screenshot.length} bytes)`);
            }
            
            await page.close();
            return results;
            
        } catch (error) {
            console.error('❌ GLB rendering failed:', error);
            throw error;
        }
    }

    generateViewerHTML(glbBase64) {
        // Use working CDN links and fix GLTFLoader issue
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>GLB Viewer</title>
    <style>
        body { margin: 0; padding: 0; overflow: hidden; background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); }
        #container { width: 100vw; height: 100vh; }
        #loading { 
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); 
            font-family: Arial, sans-serif; color: #333; text-align: center; z-index: 1000;
            background: rgba(255,255,255,0.9); padding: 20px; border-radius: 10px;
        }
    </style>
</head>
<body>
    <div id="loading">Loading GLB model...</div>
    <div id="container"></div>
    
    <script src="https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.158.0/examples/js/loaders/GLTFLoader.js"></script>
    
    <script>
        let scene, camera, renderer, model;
        window.glbLoaded = false;
        window.loadErrors = [];
        
        console.log('🚀 Starting GLB viewer initialization...');

        function init() {
            try {
                console.log('📦 Setting up Three.js scene...');
                
                // Check Three.js availability
                if (typeof THREE === 'undefined') {
                    throw new Error('THREE.js not loaded');
                }
                
                console.log('📦 THREE.js version:', THREE.REVISION || 'unknown');
                console.log('📦 GLTFLoader check:', typeof THREE.GLTFLoader);
                
                // Scene setup
                scene = new THREE.Scene();
                scene.background = new THREE.Color(0xf0f0f0);
                window.scene = scene;
                
                // Camera
                camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
                camera.position.set(5, 5, 5);
                camera.lookAt(0, 0, 0);
                
                // Renderer
                renderer = new THREE.WebGLRenderer({ antialias: true });
                renderer.setSize(window.innerWidth, window.innerHeight);
                renderer.shadowMap.enabled = true;
                renderer.shadowMap.type = THREE.PCFSoftShadowMap;
                document.getElementById('container').appendChild(renderer.domElement);
                
                // Enhanced lighting
                const ambientLight = new THREE.AmbientLight(0x404040, 0.8);
                scene.add(ambientLight);
                
                const directionalLight1 = new THREE.DirectionalLight(0xffffff, 1.0);
                directionalLight1.position.set(10, 10, 5);
                directionalLight1.castShadow = true;
                scene.add(directionalLight1);
                
                const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
                directionalLight2.position.set(-10, 10, -5);
                scene.add(directionalLight2);
                
                const pointLight = new THREE.PointLight(0xffffff, 0.5, 100);
                pointLight.position.set(0, 10, 0);
                scene.add(pointLight);
                
                console.log('✅ Three.js scene initialized');
                
                // Start GLB loading after a short delay
                setTimeout(() => {
                    loadGLBFromBase64();
                }, 500);
                
            } catch (error) {
                console.error('❌ Scene initialization error:', error);
                window.loadErrors.push('Scene init: ' + error.message);
                document.getElementById('loading').textContent = 'Scene Error: ' + error.message;
            }
        }
        
        function loadGLBFromBase64() {
            try {
                console.log('📥 Loading GLB from base64...');
                document.getElementById('loading').textContent = 'Parsing GLB model...';
                
                // Convert base64 to ArrayBuffer
                const binaryString = atob('${glbBase64}');
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                
                console.log('📊 GLB ArrayBuffer size:', bytes.length);
                
                // Check if GLTFLoader is available
                if (!THREE.GLTFLoader) {
                    throw new Error('GLTFLoader not available');
                }
                
                const loader = new THREE.GLTFLoader();
                
                loader.parse(bytes.buffer, '', function(gltf) {
                    try {
                        console.log('🎉 GLB parsed successfully');
                        
                        model = gltf.scene;
                        scene.add(model);
                        window.model = model;
                        
                        // Auto-fit camera to model
                        const box = new THREE.Box3().setFromObject(model);
                        const center = box.getCenter(new THREE.Vector3());
                        const size = box.getSize(new THREE.Vector3());
                        const maxDim = Math.max(size.x, size.y, size.z);
                        
                        console.log('📦 Model bounds:', { center, size, maxDim });
                        
                        if (maxDim > 0) {
                            const fov = camera.fov * (Math.PI / 180);
                            const cameraDistance = Math.abs(maxDim / Math.sin(fov / 2)) * 1.2;
                            
                            camera.position.set(
                                center.x + cameraDistance * 0.5,
                                center.y + cameraDistance * 0.5,
                                center.z + cameraDistance
                            );
                            camera.lookAt(center);
                        }
                        
                        document.getElementById('loading').style.display = 'none';
                        window.glbLoaded = true;
                        console.log('✅ GLB model loaded and ready for rendering');
                        
                        animate();
                        
                    } catch (error) {
                        console.error('❌ GLB processing error:', error);
                        window.loadErrors.push('GLB process: ' + error.message);
                        document.getElementById('loading').textContent = 'Processing error: ' + error.message;
                    }
                }, function(error) {
                    console.error('❌ GLB parsing error:', error);
                    window.loadErrors.push('GLB parse: ' + (error.message || error));
                    document.getElementById('loading').textContent = 'Parse error: ' + (error.message || error);
                });
                
            } catch (error) {
                console.error('❌ Base64 conversion error:', error);
                window.loadErrors.push('Base64: ' + error.message);
                document.getElementById('loading').textContent = 'Conversion error: ' + error.message;
            }
        }
        
        function animate() {
            requestAnimationFrame(animate);
            if (renderer && scene && camera) {
                renderer.render(scene, camera);
            }
        }
        
        window.setView = function(view) {
            if (!model) {
                console.log('⚠️ No model available for view change');
                return;
            }
            
            try {
                const box = new THREE.Box3().setFromObject(model);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                const distance = Math.max(size.x, size.y, size.z) * 2;
                
                switch(view) {
                    case 'front':
                        camera.position.set(center.x, center.y, center.z + distance);
                        break;
                    case 'back':
                        camera.position.set(center.x, center.y, center.z - distance);
                        break;
                    case 'left':
                        camera.position.set(center.x - distance, center.y, center.z);
                        break;
                    case 'right':
                        camera.position.set(center.x + distance, center.y, center.z);
                        break;
                    case 'top':
                        camera.position.set(center.x, center.y + distance, center.z);
                        break;
                    case 'bottom':
                        camera.position.set(center.x, center.y - distance, center.z);
                        break;
                    case 'isometric':
                        camera.position.set(center.x + distance, center.y + distance, center.z + distance);
                        break;
                }
                camera.lookAt(center);
                console.log('📷 Camera positioned for', view, 'view');
            } catch (error) {
                console.error('❌ View change error:', error);
            }
        };
        
        // Initialize when ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            setTimeout(init, 100);
        }
    </script>
</body>
</html>`;
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.isReady = false;
            console.log('🔒 Puppeteer browser closed');
        }
    }
}

module.exports = PuppeteerRenderer;