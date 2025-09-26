# Google Cloud VM Deployment Guide

## 🚀 Quick Deployment

### Method 1: Automated Script (Recommended)

```bash
# SSH to your Google Cloud VM
gcloud compute ssh your-vm-name

# Download and run deployment script
curl -fsSL https://raw.githubusercontent.com/resdiihd/puppeteer-glb-renderer/main/.gcp/deploy-gcp.sh -o deploy.sh
chmod +x deploy.sh
./deploy.sh
```

### Method 2: Manual Deployment

```bash
# 1. Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# 2. Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 3. Clone repository
git clone https://github.com/resdiihd/puppeteer-glb-renderer.git
cd puppeteer-glb-renderer

# 4. Setup environment
cp .gcp/.env.production .env

# 5. Deploy
docker-compose up -d
```

## 🔧 Configuration

### Environment Variables (.env)

**Required for SSL:**
```bash
DOMAIN=3d.itsoa.io.vn
ACME_EMAIL=admin@itsoa.io.vn
CLOUDFLARE_API_TOKEN=3YeqmF46MSojOcJ6zi7rjlQpyKZGC-cXRLgO_AWj
```

**Server Settings:**
```bash
PORT=3000
NODE_ENV=production
PUPPETEER_TIMEOUT=900000
```

### Cloudflare DNS Setup

1. Point domain `3d.itsoa.io.vn` to VM IP:
```
A Record: 3d.itsoa.io.vn → [VM_PUBLIC_IP]
```

2. Cloudflare API Token permissions:
- `Zone:DNS:Edit`
- `Zone:Zone:Read` 
- For domain: `itsoa.io.vn`

## 📊 Monitoring

### Health Check
```bash
curl https://3d.itsoa.io.vn/health
```

### Service Status
```bash
docker-compose ps
docker-compose logs -f
```

### SSL Certificate Status
```bash
docker-compose exec glb-renderer certbot certificates
```

## 🔄 Management Commands

### Start/Stop Services
```bash
docker-compose up -d      # Start
docker-compose down       # Stop
docker-compose restart    # Restart
```

### Update Deployment
```bash
git pull origin main
docker-compose build --no-cache
docker-compose up -d
```

### View Logs
```bash
# All logs
docker-compose logs -f

# Specific service logs
docker-compose logs -f glb-renderer

# Nginx logs
docker-compose exec glb-renderer tail -f /var/log/nginx/access.log
```

## 🚨 Troubleshooting

### SSL Certificate Issues
```bash
# Check certificate status
docker-compose exec glb-renderer certbot certificates

# Manual certificate request
docker-compose exec glb-renderer certbot certonly --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
  -d 3d.itsoa.io.vn
```

### Container Issues
```bash
# Restart specific container
docker-compose restart glb-renderer

# Rebuild containers
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Check Resources
```bash
# System resources
htop
df -h

# Container resources
docker stats
```

## 🔥 Firewall Configuration

```bash
# Allow HTTP/HTTPS traffic
gcloud compute firewall-rules create allow-glb-renderer \
  --allow tcp:80,tcp:443 \
  --source-ranges 0.0.0.0/0 \
  --description "Allow GLB Renderer HTTP/HTTPS traffic"
```

## ✅ Verification

After deployment, verify:

1. **HTTP Redirect**: `curl -I http://3d.itsoa.io.vn/` should redirect to HTTPS
2. **HTTPS Access**: `curl -I https://3d.itsoa.io.vn/health` should return 200
3. **SSL Certificate**: Check certificate validity in browser
4. **API Endpoints**: Test file upload and rendering endpoints

## 🎯 Production URLs

- **Health Check**: `https://3d.itsoa.io.vn/health`
- **File Upload**: `https://3d.itsoa.io.vn/api/upload`
- **GLB Rendering**: `https://3d.itsoa.io.vn/api/render`