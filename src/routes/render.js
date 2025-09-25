const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const config = require('../config/config');

const router = express.Router();

// Puppeteer browser instance (reused across requests for better performance)
let browserInstance = null;

/**
 * Get or create browser instance
 */
async function getBrowser() {
  if (!browserInstance || !browserInstance.connected) {
    try {
      browserInstance = await puppeteer.launch(config.puppeteer);
      logger.info('Puppeteer browser launched successfully');
      
      // Handle browser disconnect
      browserInstance.on('disconnected', () => {
        logger.warn('Puppeteer browser disconnected');
        browserInstance = null;
      });
      
    } catch (error) {
      logger.error('Failed to launch Puppeteer browser:', error);
      throw error;
    }
  }
  return browserInstance;
}

/**
 * Render GLB file to image
 * POST /api/render
 */
router.post('/', async (req, res, next) => {
  let page = null;
  
  try {
    const { fileId, cameraPosition = 'front', width = 800, height = 600, backgroundColor = '#f0f0f0' } = req.body;
    
    if (!fileId) {
      return res.status(400).json({
        success: false,
        error: 'fileId is required'
      });
    }

    // Validate file exists
    const filePath = path.join(config.storage.uploadDir, fileId);
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: 'GLB file not found'
      });
    }

    // Get browser instance
    const browser = await getBrowser();
    page = await browser.newPage();

    // Set viewport size
    await page.setViewport({ width: parseInt(width), height: parseInt(height) });

    // Create HTML content with Three.js GLB viewer
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>GLB Renderer</title>
    <style>
        body {
            margin: 0;
            background-color: ${backgroundColor};
            overflow: hidden;
            font-family: Arial, sans-serif;
        }
        #container {
            width: 100vw;
            height: 100vh;
        }
        #loading {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 18px;
            color: #666;
        }
        #error {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: red;
            text-align: center;
            display: none;
        }
    </style>
</head>
<body>
    <div id="loading">Loading GLB model...</div>
    <div id="error">
        <h3>Error loading model</h3>
        <p id="error-message"></p>
    </div>
    <div id="container"></div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/0.169.0/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.169.0/examples/js/loaders/GLTFLoader.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.169.0/examples/js/controls/OrbitControls.js"></script>

    <script>
        let scene, camera, renderer, controls;
        let model = null;
        
        const cameraPositions = {
            front: { x: 0, y: 0, z: 5 },
            back: { x: 0, y: 0, z: -5 },
            left: { x: -5, y: 0, z: 0 },
            right: { x: 5, y: 0, z: 0 },
            top: { x: 0, y: 5, z: 0 },
            bottom: { x: 0, y: -5, z: 0 },
            diagonal: { x: 3, y: 3, z: 3 }
        };

        function init() {
            const container = document.getElementById('container');
            const loading = document.getElementById('loading');
            const errorDiv = document.getElementById('error');
            
            // Create scene
            scene = new THREE.Scene();
            scene.background = new THREE.Color('${backgroundColor}');
            
            // Create camera
            camera = new THREE.PerspectiveCamera(75, ${width} / ${height}, 0.1, 1000);
            
            // Create renderer
            renderer = new THREE.WebGLRenderer({ 
                antialias: true,
                alpha: true,
                preserveDrawingBuffer: true 
            });
            renderer.setSize(${width}, ${height});
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            renderer.outputColorSpace = THREE.SRGBColorSpace;
            
            container.appendChild(renderer.domElement);
            
            // Add lights
            const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
            scene.add(ambientLight);
            
            const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
            directionalLight.position.set(10, 10, 5);
            directionalLight.castShadow = true;
            directionalLight.shadow.mapSize.width = 2048;
            directionalLight.shadow.mapSize.height = 2048;
            scene.add(directionalLight);
            
            // Add controls
            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.25;
            controls.enableZoom = true;
            
            // Load GLB model
            const loader = new THREE.GLTFLoader();
            
            // Convert file to data URL for loading
            fetch('/storage/${fileId}')
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Failed to load GLB file');
                    }
                    return response.arrayBuffer();
                })
                .then(buffer => {
                    const blob = new Blob([buffer], { type: 'application/octet-stream' });
                    const url = URL.createObjectURL(blob);
                    
                    loader.load(url, function(gltf) {
                        model = gltf.scene;
                        scene.add(model);
                        
                        // Center and scale model
                        const box = new THREE.Box3().setFromObject(model);
                        const center = box.getCenter(new THREE.Vector3());
                        const size = box.getSize(new THREE.Vector3());
                        
                        model.position.sub(center);
                        
                        const maxDim = Math.max(size.x, size.y, size.z);
                        const scale = 2 / maxDim;
                        model.scale.setScalar(scale);
                        
                        // Set camera position
                        const pos = cameraPositions['${cameraPosition}'] || cameraPositions.front;
                        camera.position.set(pos.x, pos.y, pos.z);
                        camera.lookAt(0, 0, 0);
                        
                        loading.style.display = 'none';
                        
                        // Mark as ready for screenshot
                        window.modelLoaded = true;
                        
                        animate();
                    }, 
                    function(progress) {
                        console.log('Loading progress:', progress);
                    },
                    function(error) {
                        console.error('GLB loading error:', error);
                        loading.style.display = 'none';
                        errorDiv.style.display = 'block';
                        document.getElementById('error-message').textContent = error.message;
                        window.modelError = true;
                    });
                    
                    URL.revokeObjectURL(url);
                })
                .catch(error => {
                    console.error('Fetch error:', error);
                    loading.style.display = 'none';
                    errorDiv.style.display = 'block';
                    document.getElementById('error-message').textContent = error.message;
                    window.modelError = true;
                });
        }
        
        function animate() {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }
        
        // Initialize when page loads
        init();
    </script>
</body>
</html>`;

    // Set page content
    await page.setContent(htmlContent);

    // Serve the GLB file
    await page.route('/storage/*', async (route) => {
      const url = route.request().url();
      const filename = path.basename(url);
      const filePath = path.join(config.storage.uploadDir, filename);
      
      try {
        const fileBuffer = await fs.readFile(filePath);
        await route.fulfill({
          status: 200,
          contentType: 'application/octet-stream',
          body: fileBuffer
        });
      } catch (error) {
        await route.fulfill({
          status: 404,
          body: 'File not found'
        });
      }
    });

    // Wait for model to load or error
    await page.waitForFunction(
      () => window.modelLoaded === true || window.modelError === true,
      { timeout: config.renderer.timeout }
    );

    // Check if there was an error
    const hasError = await page.evaluate(() => window.modelError === true);
    if (hasError) {
      const errorMessage = await page.evaluate(() => {
        const errorElement = document.getElementById('error-message');
        return errorElement ? errorElement.textContent : 'Unknown error loading model';
      });
      
      return res.status(500).json({
        success: false,
        error: `Failed to load GLB model: ${errorMessage}`
      });
    }

    // Take screenshot
    const screenshot = await page.screenshot({
      type: config.renderer.imageFormat,
      quality: config.renderer.imageQuality,
      fullPage: false
    });

    // Convert to base64
    const base64Image = screenshot.toString('base64');
    const dataUrl = `data:image/${config.renderer.imageFormat};base64,${base64Image}`;

    logger.info(`GLB rendered successfully: ${fileId}, camera: ${cameraPosition}, size: ${width}x${height}`);

    res.json({
      success: true,
      message: 'GLB rendered successfully',
      image: dataUrl,
      metadata: {
        fileId,
        cameraPosition,
        width: parseInt(width),
        height: parseInt(height),
        backgroundColor,
        format: config.renderer.imageFormat,
        renderedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Render error:', error);
    
    if (error.name === 'TimeoutError') {
      return res.status(408).json({
        success: false,
        error: 'Rendering timeout. The GLB file may be too complex or corrupted.'
      });
    }
    
    next(error);
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (error) {
        logger.warn('Error closing page:', error);
      }
    }
  }
});

/**
 * Render GLB file with multiple camera angles
 * POST /api/render/multi
 */
router.post('/multi', async (req, res, next) => {
  try {
    const { 
      fileId, 
      cameraPositions = ['front', 'diagonal'], 
      width = 400, 
      height = 300, 
      backgroundColor = '#f0f0f0' 
    } = req.body;
    
    if (!fileId) {
      return res.status(400).json({
        success: false,
        error: 'fileId is required'
      });
    }

    // Validate camera positions
    const validPositions = ['front', 'back', 'left', 'right', 'top', 'bottom', 'diagonal'];
    const invalidPositions = cameraPositions.filter(pos => !validPositions.includes(pos));
    
    if (invalidPositions.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid camera positions: ${invalidPositions.join(', ')}`
      });
    }

    // Render each camera position
    const renders = [];
    for (const position of cameraPositions) {
      try {
        // Make internal request to single render endpoint
        const renderResult = await new Promise((resolve, reject) => {
          const mockReq = {
            body: { fileId, cameraPosition: position, width, height, backgroundColor }
          };
          const mockRes = {
            json: (data) => resolve(data),
            status: (code) => ({
              json: (data) => resolve({ ...data, statusCode: code })
            })
          };
          const mockNext = (error) => reject(error);

          // Call the single render endpoint handler
          router.stack[0].handle(mockReq, mockRes, mockNext);
        });

        if (renderResult.success) {
          renders.push({
            cameraPosition: position,
            image: renderResult.image,
            metadata: renderResult.metadata
          });
        } else {
          renders.push({
            cameraPosition: position,
            error: renderResult.error
          });
        }
      } catch (error) {
        renders.push({
          cameraPosition: position,
          error: error.message
        });
      }
    }

    const successfulRenders = renders.filter(r => r.image);
    const failedRenders = renders.filter(r => r.error);

    logger.info(`Multi-angle render completed: ${successfulRenders.length} successful, ${failedRenders.length} failed`);

    res.json({
      success: successfulRenders.length > 0,
      message: `Rendered ${successfulRenders.length} out of ${cameraPositions.length} views`,
      renders: renders,
      summary: {
        total: cameraPositions.length,
        successful: successfulRenders.length,
        failed: failedRenders.length
      },
      renderedAt: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Multi-render error:', error);
    next(error);
  }
});

/**
 * Get render status and browser info
 * GET /api/render/status
 */
router.get('/status', async (req, res, next) => {
  try {
    let browserStatus = 'disconnected';
    let browserVersion = null;
    
    if (browserInstance && browserInstance.connected) {
      browserStatus = 'connected';
      try {
        browserVersion = await browserInstance.version();
      } catch (error) {
        logger.warn('Could not get browser version:', error);
      }
    }

    res.json({
      success: true,
      browser: {
        status: browserStatus,
        version: browserVersion
      },
      config: {
        timeout: config.renderer.timeout,
        imageFormat: config.renderer.imageFormat,
        imageQuality: config.renderer.imageQuality
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Status check error:', error);
    next(error);
  }
});

// Graceful shutdown handler
process.on('SIGINT', async () => {
  if (browserInstance) {
    logger.info('Closing Puppeteer browser...');
    await browserInstance.close();
  }
});

process.on('SIGTERM', async () => {
  if (browserInstance) {
    logger.info('Closing Puppeteer browser...');
    await browserInstance.close();
  }
});

module.exports = router;