const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const GLBRenderer = require('./src/glb-renderer');
const PuppeteerGLBRenderer = require('./src/puppeteer-renderer');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize renderers
const renderer = new GLBRenderer();
const puppeteerRenderer = new PuppeteerGLBRenderer();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${Date.now()}${ext}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.glb', '.gltf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only GLB and GLTF files are allowed'));
    }
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from rendered directory
app.use('/rendered', express.static(path.join(__dirname, 'rendered')));

// Puppeteer render job handler
async function startPuppeteerRenderJob(jobId, filePath, options) {
  try {
    console.log(`🎭 Starting Puppeteer render job: ${jobId}`);
    
    // Create output directory
    const outputDir = path.join(__dirname, 'rendered');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Convert file to URL for Puppeteer access
    const fileUrl = `file://${path.resolve(filePath)}`;
    
    let result;
    if (options.outputType === 'multiView') {
      // Multi-view rendering
      result = await puppeteerRenderer.renderMultiView(fileUrl, options);
      
      // Save multiple views
      const outputs = [];
      for (let i = 0; i < result.length; i++) {
        const view = result[i];
        const outputPath = path.join(outputDir, `${jobId}_${view.view}.${options.format}`);
        await fs.promises.writeFile(outputPath, view.data);
        outputs.push({
          view: view.view,
          path: `/rendered/${jobId}_${view.view}.${options.format}`,
          url: `http://localhost:3001/rendered/${jobId}_${view.view}.${options.format}`
        });
      }
      
      return {
        jobId,
        status: 'completed',
        message: 'Multi-view rendering completed with Puppeteer',
        outputType: 'multiView',
        outputs,
        renderTime: new Date().toISOString(),
        renderer: 'puppeteer'
      };
      
    } else {
      // Single view rendering
      const screenshot = await puppeteerRenderer.renderGLB(fileUrl, options);
      const outputPath = path.join(outputDir, `${jobId}.${options.format}`);
      await fs.promises.writeFile(outputPath, screenshot);
      
      return {
        jobId,
        status: 'completed',
        message: 'Single view rendering completed with Puppeteer',
        outputType: 'single',
        output: {
          path: `/rendered/${jobId}.${options.format}`,
          url: `http://localhost:3001/rendered/${jobId}.${options.format}`
        },
        renderTime: new Date().toISOString(),
        renderer: 'puppeteer'
      };
    }
    
  } catch (error) {
    console.error(`❌ Puppeteer render job ${jobId} failed:`, error);
    return {
      jobId,
      status: 'failed',
      message: `Puppeteer rendering failed: ${error.message}`,
      error: error.message,
      renderer: 'puppeteer'
    };
  }
}

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  next();
});

// GPU info endpoint
app.get('/gpu', async (req, res) => {
  try {
    const gpuInfo = await renderer.getGPUInfo();
    res.json(gpuInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List available GLB files
app.get('/files', (req, res) => {
  try {
    const uploadsDir = path.join(__dirname, 'uploads');
    
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const files = fs.readdirSync(uploadsDir)
      .filter(file => file.toLowerCase().endsWith('.glb') || file.toLowerCase().endsWith('.gltf'))
      .map(fileName => {
        const filePath = path.join(uploadsDir, fileName);
        const stats = fs.statSync(filePath);
        return {
          name: fileName,
          size: stats.size,
          modified: stats.mtime.toISOString(),
          path: filePath
        };
      })
      .sort((a, b) => new Date(b.modified) - new Date(a.modified));
    
    res.json({
      success: true,
      files: files,
      count: files.length
    });
    
  } catch (error) {
    console.error('Failed to list files:', error);
    res.status(500).json({ 
      error: 'Failed to list files',
      details: error.message 
    });
  }
});

// Test Puppeteer endpoint
app.post('/test-puppeteer', async (req, res) => {
  try {
    const { fileName } = req.body;
    if (!fileName) {
      return res.status(400).json({ error: 'File name is required' });
    }

    const filePath = path.join(__dirname, 'uploads', fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'GLB file not found' });
    }

    console.log('🧪 Testing Puppeteer rendering...');
    
    const fileUrl = `file://${path.resolve(filePath)}`;
    const options = {
      width: 800,
      height: 600,
      format: 'png',
      backgroundColor: '#222222',
      lighting: 'studio'
    };

    const screenshot = await puppeteerRenderer.renderGLB(fileUrl, options);
    
    // Save test image
    const outputDir = path.join(__dirname, 'rendered');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const testPath = path.join(outputDir, `test_${fileName.replace('.glb', '')}.png`);
    await fs.promises.writeFile(testPath, screenshot);
    
    res.json({
      success: true,
      message: 'Puppeteer test completed successfully',
      testImage: `/rendered/test_${fileName.replace('.glb', '')}.png`,
      url: `http://localhost:3001/rendered/test_${fileName.replace('.glb', '')}.png`
    });

  } catch (error) {
    console.error('❌ Puppeteer test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Puppeteer test failed'
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    activeJobs: renderer.activeJobs,
    totalJobs: renderer.jobs.size
  });
});

// Upload and start rendering
app.post('/render', upload.single('glb'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No GLB file uploaded' });
    }

    const jobId = uuidv4();
    const renderOptions = {
      width: parseInt(req.body.width) || 1920,
      height: parseInt(req.body.height) || 1080,
      format: req.body.format || 'png',
      quality: parseInt(req.body.quality) || 90,
      frames: parseInt(req.body.frames) || 30,
      duration: parseFloat(req.body.duration) || 3.0,
      turntable: req.body.turntable === 'true',
      cameraAngle: req.body.cameraAngle || 'auto',
      backgroundColor: req.body.backgroundColor || '#ffffff',
      lighting: req.body.lighting || 'studio',
      shadows: req.body.shadows === 'true',
      // Enhanced NVIDIA API options
      useNvidiaAPI: req.body.useNvidiaAPI === 'true',
      outputType: req.body.outputType || 'single',
      enhancement: req.body.enhancement || 'quality_boost',
      animationDuration: parseFloat(req.body.animationDuration) || 5,
      fps: parseInt(req.body.fps) || 30,
      animationViews: req.body.animationViews || ['rotating'],
      materials: req.body.materials || 'enhanced'
    };

    console.log(`🎬 Starting render job: ${jobId}`);
    console.log('📋 Options:', renderOptions);

    const job = await renderer.startRenderingJob(jobId, req.file.path, renderOptions);

    res.json({
      success: true,
      jobId: jobId,
      status: job.status,
      message: job.message,
      options: renderOptions
    });

  } catch (error) {
    console.error('❌ Render endpoint error:', error);
    res.status(500).json({
      error: 'Failed to start rendering',
      details: error.message
    });
  }
});

// Render existing GLB file
app.post('/render-file', async (req, res) => {
  try {
    const { fileName } = req.body;
    if (!fileName) {
      return res.status(400).json({ error: 'File name is required' });
    }

    const filePath = path.join(__dirname, 'uploads', fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'GLB file not found' });
    }

    const jobId = uuidv4();
    const renderOptions = {
      width: parseInt(req.body.width) || 1920,
      height: parseInt(req.body.height) || 1080,
      format: req.body.format || 'png',
      quality: parseInt(req.body.quality) || 90,
      frames: parseInt(req.body.frames) || 30,
      duration: parseFloat(req.body.duration) || 3.0,
      turntable: req.body.turntable === 'true',
      cameraAngle: req.body.cameraAngle || 'auto',
      backgroundColor: req.body.backgroundColor || '#222222',
      lighting: req.body.lighting || 'studio',
      shadows: req.body.shadows === 'true',
      // Enhanced NVIDIA API options (always enabled for existing files)
      useNvidiaAPI: true,
      outputType: req.body.outputType || 'single',
      enhancement: req.body.enhancement || 'quality_boost',
      animationDuration: parseFloat(req.body.animationDuration) || 5,
      fps: parseInt(req.body.fps) || 30,
      animationViews: req.body.animationViews || ['rotating'],
      materials: req.body.materials || 'enhanced',
      // New Puppeteer rendering option
      usePuppeteer: req.body.usePuppeteer === 'true' || true // Default to Puppeteer
    };

    console.log(`🎬 Starting ${renderOptions.usePuppeteer ? 'Puppeteer' : 'NVIDIA'} render job: ${jobId} for ${fileName}`);
    console.log('📋 Options:', renderOptions);

    let job;
    if (renderOptions.usePuppeteer) {
      // Use Puppeteer rendering
      job = await startPuppeteerRenderJob(jobId, filePath, renderOptions);
    } else {
      // Use original NVIDIA API rendering
      job = await renderer.startRenderingJob(jobId, filePath, renderOptions);
    }

    res.json({
      success: true,
      jobId: jobId,
      status: job.status,
      message: job.message,
      options: renderOptions,
      fileName: fileName
    });

  } catch (error) {
    console.error('❌ Render file endpoint error:', error);
    res.status(500).json({
      error: 'Failed to start rendering',
      details: error.message
    });
  }
});

// Get job status
app.get('/status/:jobId', (req, res) => {
  try {
    const job = renderer.getJobStatus(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job);
  } catch (error) {
    console.error('❌ Status endpoint error:', error);
    res.status(500).json({
      error: 'Failed to get job status',
      details: error.message
    });
  }
});

// Get all jobs
app.get('/jobs', (req, res) => {
  try {
    const jobs = renderer.getAllJobs();
    res.json({
      success: true,
      jobs: jobs,
      count: jobs.length
    });
  } catch (error) {
    console.error('❌ Jobs endpoint error:', error);
    res.status(500).json({
      error: 'Failed to get jobs',
      details: error.message
    });
  }
});

// Download rendered file
app.get('/download/:jobId/:fileName?', (req, res) => {
  try {
    const { jobId, fileName } = req.params;
    const job = renderer.getJobStatus(jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (job.status !== 'completed') {
      return res.status(400).json({ error: 'Job not completed yet' });
    }
    
    let filePath;
    if (fileName) {
      // Download specific file
      filePath = path.join(__dirname, 'rendered', jobId, fileName);
    } else if (job.outputFiles && job.outputFiles.length > 0) {
      // Download first output file
      filePath = job.outputFiles[0].path;
    } else if (job.outputPath) {
      // Legacy single output
      filePath = job.outputPath;
    } else {
      return res.status(404).json({ error: 'No output files found' });
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Output file not found' });
    }
    
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4'
    };
    
    const mimeType = mimeTypes[ext] || 'application/octet-stream';
    
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('❌ Download endpoint error:', error);
    res.status(500).json({
      error: 'Failed to download file',
      details: error.message
    });
  }
});

// Cancel job
app.delete('/jobs/:jobId', (req, res) => {
  try {
    const success = renderer.cancelJob(req.params.jobId);
    if (success) {
      res.json({ success: true, message: 'Job cancelled' });
    } else {
      res.status(404).json({ error: 'Job not found or cannot be cancelled' });
    }
  } catch (error) {
    console.error('❌ Cancel endpoint error:', error);
    res.status(500).json({
      error: 'Failed to cancel job',
      details: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Server error:', error);
  res.status(500).json({
    error: 'Internal server error',
    details: error.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 GLB Renderer Service running on port ${PORT}`);
  console.log(`📁 Uploads directory: ${path.join(__dirname, 'uploads')}`);
  console.log(`🎨 Rendered output: ${path.join(__dirname, 'rendered')}`);
  console.log(`🔧 NVIDIA API: Enabled for enhanced rendering`);
});

module.exports = app;