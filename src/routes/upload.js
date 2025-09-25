const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const config = require('../config/config');

const router = express.Router();

// Configure multer for GLB file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = config.storage.uploadDir;
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      logger.error('Failed to create upload directory:', error);
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    // Generate unique filename with original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + extension);
  }
});

// File filter to only allow GLB/GLTF files
const fileFilter = (req, file, cb) => {
  const allowedExtensions = ['.glb', '.gltf'];
  const fileExtension = path.extname(file.originalname).toLowerCase();
  
  if (allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error('Only GLB and GLTF files are allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: config.storage.maxFileSize, // 50MB limit
    files: 1
  }
});

/**
 * Upload GLB/GLTF file endpoint
 * POST /api/upload
 */
router.post('/', upload.single('glbFile'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded or invalid file type'
      });
    }

    const fileInfo = {
      originalName: req.file.originalname,
      filename: req.file.filename,
      size: req.file.size,
      path: req.file.path,
      mimetype: req.file.mimetype,
      uploadedAt: new Date().toISOString()
    };

    logger.info('File uploaded successfully:', fileInfo);

    res.json({
      success: true,
      message: 'File uploaded successfully',
      fileId: req.file.filename,
      file: {
        id: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        uploadedAt: fileInfo.uploadedAt
      }
    });

  } catch (error) {
    logger.error('Upload error:', error);
    next(error);
  }
});

/**
 * Get uploaded file info
 * GET /api/upload/:fileId
 */
router.get('/:fileId', async (req, res, next) => {
  try {
    const fileId = req.params.fileId;
    const filePath = path.join(config.storage.uploadDir, fileId);

    try {
      const stats = await fs.stat(filePath);
      
      res.json({
        success: true,
        file: {
          id: fileId,
          size: stats.size,
          uploadedAt: stats.birthtime.toISOString(),
          exists: true
        }
      });
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.status(404).json({
          success: false,
          error: 'File not found'
        });
      }
      throw error;
    }

  } catch (error) {
    logger.error('Get file info error:', error);
    next(error);
  }
});

/**
 * Delete uploaded file
 * DELETE /api/upload/:fileId
 */
router.delete('/:fileId', async (req, res, next) => {
  try {
    const fileId = req.params.fileId;
    const filePath = path.join(config.storage.uploadDir, fileId);

    try {
      await fs.unlink(filePath);
      
      logger.info(`File deleted: ${fileId}`);
      
      res.json({
        success: true,
        message: 'File deleted successfully'
      });
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.status(404).json({
          success: false,
          error: 'File not found'
        });
      }
      throw error;
    }

  } catch (error) {
    logger.error('Delete file error:', error);
    next(error);
  }
});

/**
 * List all uploaded files
 * GET /api/upload
 */
router.get('/', async (req, res, next) => {
  try {
    const uploadDir = config.storage.uploadDir;
    
    try {
      const files = await fs.readdir(uploadDir);
      const fileInfos = await Promise.all(
        files.map(async (filename) => {
          try {
            const filePath = path.join(uploadDir, filename);
            const stats = await fs.stat(filePath);
            
            return {
              id: filename,
              size: stats.size,
              uploadedAt: stats.birthtime.toISOString(),
              modifiedAt: stats.mtime.toISOString()
            };
          } catch (error) {
            logger.warn(`Could not get stats for file ${filename}:`, error);
            return null;
          }
        })
      );

      // Filter out null results (files that couldn't be accessed)
      const validFiles = fileInfos.filter(file => file !== null);

      res.json({
        success: true,
        files: validFiles,
        count: validFiles.length
      });
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Upload directory doesn't exist yet
        res.json({
          success: true,
          files: [],
          count: 0
        });
      } else {
        throw error;
      }
    }

  } catch (error) {
    logger.error('List files error:', error);
    next(error);
  }
});

module.exports = router;