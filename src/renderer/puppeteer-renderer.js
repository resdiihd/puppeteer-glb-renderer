const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs-extra');
const sharp = require('sharp');
const ffmpeg = require('ffmpeg-static');
const { spawn } = require('child_process');

class PuppeteerRenderer {
    constructor() {
        this.browser = null;
        this.isInitialized = false;
    }

    async initialize() {
        try {
            console.log('🚀 Initializing Puppeteer browser...');
            
            // Use system Chrome if PUPPETEER_EXECUTABLE_PATH is set
            const launchOptions = {
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu-sandbox',
                    '--disable-software-rasterizer',
                    '--enable-webgl',
                    '--use-gl=desktop',
                    '--enable-accelerated-2d-canvas',
                    '--force-gpu-rasterization'
                ],
                defaultViewport: null
            };
            
            // Use system Chrome if environment variable is set
            console.log('🔍 Environment variables:');
            console.log('   PUPPETEER_EXECUTABLE_PATH:', process.env.PUPPETEER_EXECUTABLE_PATH);
            console.log('   PATH contains:', process.env.PATH);
            
            if (process.env.PUPPETEER_EXECUTABLE_PATH) {
                launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
                console.log(`🔧 Using Chrome at: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
            } else {
                console.log('🔧 Using default Puppeteer Chrome');
            }
            
            this.browser = await puppeteer.launch(launchOptions);

            this.isInitialized = true;
            console.log('✅ Puppeteer browser initialized successfully');
            
        } catch (error) {
            console.error('❌ Puppeteer initialization failed:', error);
            throw error;
        }
    }

    async checkHealth() {
        if (!this.browser) {
            return { status: 'not_initialized' };
        }

        try {
            const pages = await this.browser.pages();
            return {
                status: 'healthy',
                pages: pages.length,
                version: await this.browser.version()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message
            };
        }
    }

    async renderGLB(fileName, options = {}) {
        if (!this.isInitialized || !this.browser) {
            throw new Error('Puppeteer not initialized');
        }

        const startTime = Date.now();
        console.log(`🎨 Starting GLB render: ${fileName}`);
        console.log(`⚙️ Options:`, JSON.stringify(options, null, 2));

        let page = null;
        const results = [];

        try {
            // Create new page
            page = await this.browser.newPage();
            
            // Set viewport based on quality preset
            const viewport = this.getViewportFromPreset(options.preset, options.width, options.height);
            await page.setViewport(viewport);

            // Navigate to GLB viewer
            const viewerUrl = `http://localhost:3000/viewer/glb-viewer.html`;
            await page.goto(viewerUrl, { waitUntil: 'networkidle0' });

            // Wait for Three.js to load
            await page.waitForFunction('window.THREE && window.GLTFLoader');
            console.log('✅ Three.js loaded');

            // Load GLB model
            const glbPath = `/storage/uploads/${fileName}`;
            await page.evaluate((glbPath, options) => {
                return window.loadGLBModel(glbPath, options);
            }, glbPath, options);

            // Wait for model to load
            await page.waitForFunction('window.modelLoaded === true', { timeout: 30000 });
            console.log('✅ GLB model loaded');

            // Apply rendering settings
            await page.evaluate((options) => {
                window.applyRenderSettings(options);
            }, options);

            console.log('✅ Render settings applied');

            // Handle different rendering modes
            if (options.format === 'mp4' || options.turntable) {
                // Video rendering
                const videoResult = await this.renderVideo(page, fileName, options);
                results.push(videoResult);
            } else if (options.format === 'gif' || options.views.includes('animated')) {
                // GIF rendering
                const gifResult = await this.renderGIF(page, fileName, options);
                results.push(gifResult);
            } else {
                // Static image rendering
                const imageResults = await this.renderImages(page, fileName, options);
                results.push(...imageResults);
            }

            const duration = Date.now() - startTime;
            console.log(`✅ Render completed in ${duration}ms`);

            return {
                success: true,
                results,
                duration,
                options
            };

        } catch (error) {
            console.error('❌ Render failed:', error);
            throw error;
        } finally {
            if (page) {
                await page.close();
            }
        }
    }

    async renderImages(page, fileName, options) {
        const results = [];
        const views = this.expandViews(options.views);
        
        console.log(`📸 Rendering ${views.length} views...`);

        for (const view of views) {
            try {
                // Set camera position for this view
                await page.evaluate((view) => {
                    window.setCameraView(view);
                }, view);

                // Wait for camera transition
                await page.waitForTimeout(500);

                // Take screenshot
                const screenshotOptions = {
                    type: options.format === 'jpg' ? 'jpeg' : 'png',
                    quality: options.format === 'jpg' ? options.quality : undefined,
                    omitBackground: options.transparent
                };

                const screenshot = await page.screenshot(screenshotOptions);

                // Process with Sharp if needed
                let processedImage = screenshot;
                if (options.postProcessing) {
                    processedImage = await this.postProcessImage(screenshot, options);
                }

                // Save to storage
                const outputFileName = `${path.parse(fileName).name}_${view}.${options.format}`;
                const outputPath = path.join(__dirname, '../../storage/renders', outputFileName);
                await fs.writeFile(outputPath, processedImage);

                results.push({
                    view,
                    fileName: outputFileName,
                    path: outputPath,
                    size: processedImage.length
                });

                console.log(`✅ Rendered view: ${view}`);

            } catch (error) {
                console.error(`❌ Failed to render view ${view}:`, error);
            }
        }

        return results;
    }

    async renderVideo(page, fileName, options) {
        console.log('🎬 Starting video rendering...');

        const frameDir = path.join(__dirname, '../../storage/temp', `frames_${Date.now()}`);
        await fs.ensureDir(frameDir);

        try {
            const totalFrames = options.duration * options.fps;
            const angleStep = 360 / totalFrames;

            console.log(`📹 Capturing ${totalFrames} frames...`);

            // Capture frames
            for (let frame = 0; frame < totalFrames; frame++) {
                const angle = frame * angleStep;
                
                // Rotate camera
                await page.evaluate((angle) => {
                    window.rotateCameraToAngle(angle);
                }, angle);

                await page.waitForTimeout(50); // Small delay for smooth rotation

                // Capture frame
                const screenshot = await page.screenshot({
                    type: 'png',
                    omitBackground: options.transparent
                });

                const framePath = path.join(frameDir, `frame_${frame.toString().padStart(6, '0')}.png`);
                await fs.writeFile(framePath, screenshot);

                // Progress logging
                if (frame % Math.floor(totalFrames / 10) === 0) {
                    console.log(`📹 Progress: ${Math.round((frame / totalFrames) * 100)}%`);
                }
            }

            // Convert frames to video using FFmpeg
            const outputFileName = `${path.parse(fileName).name}_turntable.mp4`;
            const outputPath = path.join(__dirname, '../../storage/renders', outputFileName);

            await this.convertFramesToVideo(frameDir, outputPath, options.fps);

            // Cleanup frames
            await fs.remove(frameDir);

            const stats = await fs.stat(outputPath);

            console.log('✅ Video rendering completed');

            return {
                type: 'video',
                fileName: outputFileName,
                path: outputPath,
                size: stats.size,
                duration: options.duration,
                fps: options.fps,
                frames: totalFrames
            };

        } catch (error) {
            // Cleanup on error
            await fs.remove(frameDir).catch(() => {});
            throw error;
        }
    }

    async renderGIF(page, fileName, options) {
        console.log('🎞️ Starting GIF rendering...');
        
        // Similar to video but with fewer frames for GIF
        const gifOptions = {
            ...options,
            duration: Math.min(options.duration, 3), // Max 3s for GIF
            fps: Math.min(options.fps, 15) // Max 15 FPS for GIF
        };

        const frameDir = path.join(__dirname, '../../storage/temp', `gif_frames_${Date.now()}`);
        await fs.ensureDir(frameDir);

        try {
            const totalFrames = gifOptions.duration * gifOptions.fps;
            const angleStep = 360 / totalFrames;

            // Capture frames
            for (let frame = 0; frame < totalFrames; frame++) {
                const angle = frame * angleStep;
                
                await page.evaluate((angle) => {
                    window.rotateCameraToAngle(angle);
                }, angle);

                await page.waitForTimeout(100);

                const screenshot = await page.screenshot({
                    type: 'png',
                    omitBackground: false // GIF doesn't support transparency well
                });

                const framePath = path.join(frameDir, `frame_${frame.toString().padStart(4, '0')}.png`);
                await fs.writeFile(framePath, screenshot);
            }

            // Convert to GIF using FFmpeg
            const outputFileName = `${path.parse(fileName).name}_animated.gif`;
            const outputPath = path.join(__dirname, '../../storage/renders', outputFileName);

            await this.convertFramesToGIF(frameDir, outputPath, gifOptions);

            await fs.remove(frameDir);

            const stats = await fs.stat(outputPath);

            console.log('✅ GIF rendering completed');

            return {
                type: 'gif',
                fileName: outputFileName,
                path: outputPath,
                size: stats.size,
                duration: gifOptions.duration,
                fps: gifOptions.fps,
                frames: totalFrames
            };

        } catch (error) {
            await fs.remove(frameDir).catch(() => {});
            throw error;
        }
    }

    getViewportFromPreset(preset, width = 1920, height = 1080) {
        const presets = {
            ultra: { width: width * 2, height: height * 2 },
            high: { width, height },
            medium: { width: Math.floor(width * 0.75), height: Math.floor(height * 0.75) },
            low: { width: Math.floor(width * 0.5), height: Math.floor(height * 0.5) }
        };

        return presets[preset] || presets.high;
    }

    expandViews(views) {
        if (views.includes('all')) {
            return ['front', 'side', 'top', 'perspective', 'back', 'bottom'];
        }
        return views;
    }

    async postProcessImage(imageBuffer, options) {
        let image = sharp(imageBuffer);

        // Apply post-processing effects
        if (options.postProcessing) {
            image = image
                .sharpen()
                .modulate({
                    brightness: 1.05,
                    saturation: 1.1
                });
        }

        return await image.toBuffer();
    }

    async convertFramesToVideo(frameDir, outputPath, fps) {
        return new Promise((resolve, reject) => {
            const args = [
                '-y', // Overwrite output
                '-framerate', fps.toString(),
                '-i', path.join(frameDir, 'frame_%06d.png'),
                '-c:v', 'libx264',
                '-pix_fmt', 'yuv420p',
                '-crf', '18', // High quality
                outputPath
            ];

            const ffmpegProcess = spawn(ffmpeg, args);

            ffmpegProcess.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`FFmpeg failed with code ${code}`));
                }
            });

            ffmpegProcess.on('error', reject);
        });
    }

    async convertFramesToGIF(frameDir, outputPath, options) {
        return new Promise((resolve, reject) => {
            const args = [
                '-y',
                '-framerate', options.fps.toString(),
                '-i', path.join(frameDir, 'frame_%04d.png'),
                '-vf', 'palettegen=stats_mode=diff',
                '-y',
                path.join(path.dirname(outputPath), 'palette.png')
            ];

            const paletteProcess = spawn(ffmpeg, args);
            
            paletteProcess.on('close', (code) => {
                if (code === 0) {
                    // Create GIF with palette
                    const gifArgs = [
                        '-y',
                        '-framerate', options.fps.toString(),
                        '-i', path.join(frameDir, 'frame_%04d.png'),
                        '-i', path.join(path.dirname(outputPath), 'palette.png'),
                        '-lavfi', 'paletteuse=dither=bayer:bayer_scale=5',
                        outputPath
                    ];

                    const gifProcess = spawn(ffmpeg, gifArgs);
                    
                    gifProcess.on('close', (code) => {
                        // Cleanup palette
                        fs.remove(path.join(path.dirname(outputPath), 'palette.png')).catch(() => {});
                        
                        if (code === 0) {
                            resolve();
                        } else {
                            reject(new Error(`GIF creation failed with code ${code}`));
                        }
                    });

                    gifProcess.on('error', reject);
                } else {
                    reject(new Error(`Palette generation failed with code ${code}`));
                }
            });

            paletteProcess.on('error', reject);
        });
    }

    async cleanup() {
        if (this.browser) {
            console.log('🛑 Closing Puppeteer browser...');
            await this.browser.close();
            this.browser = null;
            this.isInitialized = false;
            console.log('✅ Puppeteer cleanup completed');
        }
    }
}

module.exports = PuppeteerRenderer;