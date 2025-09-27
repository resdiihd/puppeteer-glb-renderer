# GLB Renderer Production Troubleshooting Guide

## Current Issue
The Docker container is running, and Nginx is working, but the Node.js application on port 3000 is not starting properly.

## Troubleshooting Steps

### 1. Pull Latest Fixes
```bash
sudo git pull origin main
sudo docker compose down
sudo docker compose up -d --build
```

### 2. Check Container Logs
```bash
# View all container logs
sudo docker compose logs -f

# View only the startup logs
sudo docker compose logs glb-renderer-production | head -100

# Follow logs in real-time
sudo docker compose logs -f glb-renderer-production
```

### 3. Debug Inside Container
```bash
# Enter the running container
sudo docker exec -it glb-renderer-production bash

# Run the debug script
node /app/debug-startup.js

# Check PM2 status
pm2 list
pm2 logs

# Check if Node.js app is running
ps aux | grep node
netstat -tulpn | grep :3000

# Test the app manually
cd /app
npm start

# Check file permissions
ls -la /app/
ls -la /app/src/
ls -la /app/storage/
```

### 4. Manual Testing
If the container isn't starting properly:
```bash
# Stop the container
sudo docker compose down

# Run container interactively for debugging
sudo docker run -it --rm \
  -p 3000:3000 \
  -p 80:80 \
  -p 443:443 \
  --env-file .gcp/.env.production \
  -v glb_storage:/app/storage \
  -v ssl_data:/ssl \
  -v acme_data:/acme \
  glb-renderer-production:latest bash

# Inside the interactive container:
node /app/debug-startup.js
npm install --production
npm start
```

### 5. Check Common Issues

#### A. Dependencies Missing
```bash
# Inside container
cd /app
npm install --production --verbose
```

#### B. Permissions Issues
```bash
# Inside container
chown -R nginx:nginx /app
chmod -R 755 /app
mkdir -p /app/storage/uploads /app/storage/renders
chmod -R 755 /app/storage
```

#### C. Environment Variables
```bash
# Inside container
env | grep -E "(NODE_ENV|PORT|HOST|DOMAIN)"
```

#### D. Port Conflicts
```bash
# Check if port 3000 is already in use
netstat -tulpn | grep :3000
lsof -i :3000
```

### 6. Expected Working Output

When working correctly, you should see:
```
✅ Node.js application started successfully!
🌐 Starting Nginx reverse proxy...
```

And `curl http://localhost:3000/health` should return:
```json
{
  "status": "ok",
  "timestamp": "2025-09-27T...",
  "uptime": "...",
  "version": "2.0.0"
}
```

### 7. Fix Common Issues

#### Issue: "Module not found"
```bash
cd /app && npm install --production
```

#### Issue: "Permission denied"
```bash
chown -R nginx:nginx /app
chmod +x /app/docker/start.sh
```

#### Issue: "Port already in use"
```bash
pm2 kill
pkill -f node
```

#### Issue: "Puppeteer/Chromium not found"
```bash
# Check if Chromium is installed
which chromium-browser
/usr/bin/chromium-browser --version
```

### 8. Recovery Commands

If everything is broken:
```bash
# Complete reset
sudo docker compose down -v
sudo docker system prune -f
sudo git reset --hard HEAD
sudo git pull origin main
sudo docker compose up -d --build

# Or rebuild from scratch
sudo docker compose build --no-cache
sudo docker compose up -d
```

### 9. Success Indicators

Your deployment is working when:
- `sudo docker compose logs` shows "✅ Node.js application started successfully!"
- `curl https://3d.itsoa.io.vn/health` returns health status
- `curl https://3d.itsoa.io.vn` shows "GLB Renderer Production Server"
- No "Connection refused" errors in logs

### 10. Get Help

If issues persist:
1. Run `node /app/debug-startup.js` inside container
2. Share the output of `sudo docker compose logs glb-renderer-production`
3. Check `pm2 logs` output inside container
4. Verify all environment variables are set correctly

## Next Steps After Fix

Once the Node.js app is running:
1. Test SSL certificate provisioning: `curl -I https://3d.itsoa.io.vn`
2. Test file upload functionality
3. Monitor logs for any runtime errors
4. Set up monitoring and backups