# 🎨 Puppeteer GLB Renderer

**Advanced Server-Side GLB Rendering with Full Feature Support**

## 🌟 Features

✅ **Multiple Views**: Front, Side, Top, Perspective, 360° Turntable  
✅ **Animation Support**: GLB Model Animations + Custom Turntable  
✅ **Video Export**: MP4 Turntable + GIF Animations  
✅ **Quality Presets**: Ultra/High/Medium/Low  
✅ **Batch Processing**: Multiple Files Parallel Processing  
✅ **Background Options**: Colors, Gradients, HDR Environments  
✅ **Advanced Lighting**: Studio, Outdoor, Dramatic, Custom  
✅ **Output Formats**: PNG, JPG, WebP, MP4, GIF  

## 🏗️ Architecture

- **Puppeteer**: Headless Chrome for WebGL rendering
- **Three.js**: GLB loading and 3D scene management  
- **Express**: REST API server
- **Job Queue**: Async processing with progress tracking
- **Docker**: Containerized deployment

## 📁 Structure

```
puppeteer-glb-renderer/
├── src/
│   ├── server.js          # Main API server
│   ├── renderer/          # Puppeteer rendering engine
│   ├── viewer/           # Three.js GLB viewer
│   └── queue/            # Job processing system
├── storage/
│   ├── uploads/          # GLB input files
│   ├── renders/          # Output images/videos  
│   └── temp/             # Processing files
├── docker-compose.yml    # Container orchestration
└── README.md            # This file
```

## 🚀 Quick Start

```bash
docker-compose up -d
# Access: http://localhost:3000
```