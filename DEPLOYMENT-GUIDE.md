# Enhanced GLB Renderer - Deployment Guide

## 🎯 Overview
This guide provides complete instructions for deploying the enhanced GLB renderer system to your Google Cloud VM. The enhanced version includes improved error handling, better Three.js integration, and more robust GLB processing.

## 📋 Prerequisites
- Google Cloud VM running CentOS Stream 10
- SSH access with root privileges
- External IP: `34.142.244.25`
- Open firewall port 3000

## 🚀 Quick Deployment

### Step 1: Upload Files to VM
```bash
# Upload enhanced files to VM
scp server-enhanced.js root@34.142.244.25:/tmp/
scp package-fixed.json root@34.142.244.25:/tmp/
scp deploy-enhanced.sh root@34.142.244.25:/tmp/
```

### Step 2: Run Deployment Script
```bash
# SSH to VM
ssh root@34.142.244.25

# Make script executable and run
chmod +x /tmp/deploy-enhanced.sh
/tmp/deploy-enhanced.sh
```

## 🔧 Manual Deployment Steps

If you prefer manual deployment:

### 1. Stop Current Services
```bash
pm2 stop all
pm2 delete all
```

### 2. Backup Current Deployment
```bash
cp -r /opt/glb-renderer /opt/glb-renderer-backup-$(date +%Y%m%d-%H%M%S)
```

### 3. Update Dependencies
```bash
dnf update -y
dnf install -y chromium chromium-headless liberation-fonts
```

### 4. Deploy Enhanced Files
```bash
cp /tmp/server-enhanced.js /opt/glb-renderer/server.js
cp /tmp/package-fixed.json /opt/glb-renderer/package.json
```

### 5. Install Node Dependencies
```bash
cd /opt/glb-renderer
rm -rf node_modules package-lock.json
npm install --production
```

### 6. Start Enhanced Service
```bash
pm2 start server.js --name "glb-renderer-enhanced"
pm2 save
```

## 🎨 Enhanced Features

### Improved Error Handling
- Better GLB loading error messages
- Comprehensive logging system
- Graceful failure recovery
- Detailed debug information

### Enhanced Three.js Integration
- CDN-based Three.js loading
- Improved GLTFLoader usage
- Better model centering and scaling
- Enhanced lighting setup

### Robust GLB Processing
- Base64 GLB embedding
- Multi-view camera positioning
- Automatic model optimization
- Progressive loading indicators

### Production-Ready Features
- PM2 process management
- Health check endpoints
- File management APIs
- Comprehensive logging

## 🧪 Testing the Enhanced System

### 1. Health Check
```bash
curl http://34.142.244.25:3000/health
```

### 2. Upload GLB File
```bash
curl -X POST -F "glb=@your-model.glb" http://34.142.244.25:3000/upload
```

### 3. Render GLB Model
```bash
curl -X POST http://34.142.244.25:3000/render/your-uploaded-file.glb
```

### 4. View Results
Visit: `http://34.142.244.25:3000/storage/renders/`

## 📊 System Monitoring

### PM2 Management
```bash
pm2 list                    # Show running processes
pm2 logs glb-renderer-enhanced  # View logs
pm2 restart glb-renderer-enhanced  # Restart service
pm2 monit                   # Real-time monitoring
```

### System Resources
```bash
htop                        # CPU/Memory usage
df -h                       # Disk usage
netstat -tlpn | grep 3000   # Port status
```

## 🐛 Troubleshooting

### Common Issues

#### Chrome/Puppeteer Issues
```bash
# Check Chrome installation
which chromium-browser
chromium-browser --version

# Test Puppeteer
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

#### Port Issues
```bash
# Check port availability
netstat -tlpn | grep 3000
firewall-cmd --list-ports
```

#### Permission Issues
```bash
# Fix permissions
chown -R nodejs:nodejs /opt/glb-renderer
chmod -R 755 /opt/glb-renderer/storage
```

### Debug Mode
Enable verbose logging:
```bash
export DEBUG=puppeteer:*
pm2 restart glb-renderer-enhanced
pm2 logs glb-renderer-enhanced
```

## 📈 Performance Optimization

### Memory Settings
- Default max memory restart: 1GB
- Adjust in `ecosystem.config.js` if needed

### Concurrent Processing
- Single instance by default
- Can scale to multiple instances if needed

### Storage Management
- Automatic cleanup of old renders
- Configurable file size limits
- Storage monitoring

## 🔒 Security Considerations

### File Upload Security
- File type validation
- Size limits enforced
- Sanitized file names

### Network Security
- Firewall configured
- CORS enabled
- Input validation

## 📚 API Documentation

### Endpoints
- `GET /` - Service information
- `GET /health` - Health check with system stats
- `POST /upload` - Upload GLB/GLTF files
- `POST /render/:filename` - Render GLB to multiple views
- `GET /files` - List uploaded files
- `GET /renders` - List rendered images

### Response Format
```json
{
  "success": true,
  "data": {
    "renders": [...],
    "stats": {
      "totalViews": 6,
      "successfulViews": 6,
      "renderTime": 5432
    }
  }
}
```

## 🎊 Success Indicators

✅ PM2 shows service running  
✅ Health endpoint returns 200  
✅ Upload endpoint accepts files  
✅ Render endpoint generates images  
✅ Storage directory contains results  
✅ No memory leaks or crashes  

## 📞 Support

If you encounter issues:
1. Check PM2 logs: `pm2 logs glb-renderer-enhanced`
2. Verify Chrome installation: `chromium-browser --version`
3. Test connectivity: `curl http://localhost:3000/health`
4. Check system resources: `htop` and `df -h`

---

**Ready to deploy! 🚀**