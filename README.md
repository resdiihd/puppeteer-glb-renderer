# GLB 3D Renderer Server

> Professional 3D GLB/GLTF file renderer with SSL support and automated deployment

## 🚀 Features

- **Server-side GLB Rendering**: Convert GLB/GLTF files to high-quality images using Puppeteer
- **SSL/HTTPS Support**: Automated SSL certificates via Let's Encrypt with Cloudflare DNS
- **Docker Containerized**: Production-ready containerization with Nginx reverse proxy
- **Security First**: Rate limiting, CORS, CSP headers, and comprehensive security middleware
- **Performance Optimized**: PM2 process management with graceful shutdown
- **Google Cloud Ready**: Optimized for deployment on Google Cloud VM

## 📋 Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local development)
- Cloudflare account with API token (for SSL)
- Domain name pointed to your server

## 🛠 Quick Start

### Local Development (HTTP)

```bash
# Clone repository
git clone <repository-url>
cd BE-3D-tour

# Install dependencies
npm install

# Start development server
npm run dev
```

### Production Deployment (HTTPS)

```bash
# Environment setup
cp .env.example .env
# Edit .env with your configuration

# Start with Docker Compose
docker-compose up -d
```

## 📁 Project Structure

```
src/
├── config/          # Configuration management
├── middleware/      # Express middleware
├── routes/          # API routes
├── services/        # Business logic
├── utils/           # Utilities and helpers
└── app.js          # Application entry point

docker/
├── ssl.conf        # Nginx HTTPS configuration
├── ssl-setup.sh    # SSL certificate management
├── start.sh        # Container startup script
└── Dockerfile      # Container definition

uploads/            # File storage
logs/              # Application logs
```

## 🔧 Configuration

### Environment Variables

```bash
# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# Domain & SSL
DOMAIN=3d.itsoa.io.vn
ACME_EMAIL=your-email@example.com

# Cloudflare API (for SSL)
CLOUDFLARE_API_TOKEN=your-cloudflare-api-token

# Puppeteer Settings
PUPPETEER_TIMEOUT=900000  # 15 minutes
```

## 📡 API Endpoints

### Health Check
```http
GET /health
GET /
```

### File Upload
```http
POST /api/upload
Content-Type: multipart/form-data

{
  "glbFile": <GLB file>
}
```

### GLB Rendering
```http
POST /api/render
Content-Type: application/json

{
  "filePath": "/uploads/model.glb",
  "width": 1920,
  "height": 1080,
  "cameraPosition": [0, 0, 5],
  "backgroundColor": "#ffffff"
}
```

### Response Format
```json
{
  "success": true,
  "data": {
    "imageUrl": "/renders/render-123.png",
    "renderTime": "2.5s",
    "fileSize": "1.2MB"
  }
}
```

## 🔒 SSL Configuration

### Automated SSL Setup

The application automatically provisions and renews SSL certificates using:

- **Let's Encrypt**: Free SSL certificates
- **Cloudflare DNS**: DNS challenge for certificate validation
- **Auto-renewal**: Certificates auto-renew before expiration

### SSL Features

- HTTP to HTTPS redirect
- HSTS headers for security
- Extended timeouts for GLB processing (15 minutes)
- Gzip compression
- Security headers (CSP, X-Frame-Options, etc.)

## 🐳 Docker Deployment

### Production Setup

```yaml
# docker-compose.yml
version: '3.8'
services:
  glb-renderer:
    build: .
    environment:
      - NODE_ENV=production
      - DOMAIN=3d.itsoa.io.vn
      - CLOUDFLARE_API_TOKEN=your-token
      - ACME_EMAIL=your-email@example.com
    volumes:
      - ssl_data:/etc/letsencrypt
      - acme_data:/var/lib/letsencrypt
    ports:
      - "80:80"
      - "443:443"
```

### Build & Deploy

```bash
# Build image
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# SSL certificate status
docker-compose exec glb-renderer certbot certificates
```

## 🌐 Google Cloud Deployment

### VM Requirements

```bash
# Minimum specifications
- CPU: 2 vCores
- RAM: 4GB
- Storage: 20GB SSD
- OS: Ubuntu 20.04 LTS
```

### Deployment Steps

1. **Create Google Cloud VM**
```bash
gcloud compute instances create glb-renderer \
    --zone=asia-southeast1-a \
    --machine-type=e2-standard-2 \
    --image-family=ubuntu-2004-lts \
    --image-project=ubuntu-os-cloud \
    --boot-disk-size=20GB \
    --boot-disk-type=pd-ssd
```

2. **Install Docker**
```bash
# SSH to VM
gcloud compute ssh glb-renderer

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

3. **Deploy Application**
```bash
# Clone repository
git clone <repository-url>
cd BE-3D-tour

# Configure environment
sudo nano .env

# Start application
sudo docker-compose up -d
```

4. **Configure Firewall**
```bash
# Allow HTTP/HTTPS
gcloud compute firewall-rules create allow-glb-renderer \
    --allow tcp:80,tcp:443 \
    --source-ranges 0.0.0.0/0 \
    --description "Allow GLB Renderer traffic"
```

## 📊 Monitoring & Logs

### Health Monitoring
```bash
# Health check
curl https://3d.itsoa.io.vn/health

# SSL certificate status
curl -I https://3d.itsoa.io.vn/
```

### Log Management
```bash
# Application logs
docker-compose logs glb-renderer -f

# Nginx access logs
docker-compose exec glb-renderer tail -f /var/log/nginx/access.log

# SSL certificate logs
docker-compose exec glb-renderer tail -f /var/log/letsencrypt/letsencrypt.log
```

## 🔧 Troubleshooting

### Common Issues

1. **SSL Certificate Failed**
```bash
# Check Cloudflare API token
docker-compose exec glb-renderer certbot certificates

# Manual certificate request
docker-compose exec glb-renderer certbot certonly --dns-cloudflare \
    --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
    -d 3d.itsoa.io.vn
```

2. **GLB Rendering Timeout**
```bash
# Increase timeout in docker/ssl.conf
proxy_read_timeout 1800s;  # 30 minutes
```

3. **Memory Issues**
```bash
# Monitor container resources
docker stats

# Increase VM memory if needed
```

## 🚀 Performance Optimization

### Production Tuning

- **PM2 Cluster Mode**: Utilize all CPU cores
- **Nginx Caching**: Cache static content and renders
- **Gzip Compression**: Reduce bandwidth usage
- **Extended Timeouts**: Handle large GLB files
- **Resource Limits**: Prevent memory leaks

### Scaling

- **Horizontal Scaling**: Multiple VM instances with load balancer
- **CDN Integration**: Cloudflare CDN for global distribution
- **Database**: Redis for session/cache management
- **Queue System**: Bull/BullMQ for render job management

## 📄 License

MIT License - see LICENSE file for details

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📞 Support

- **Email**: support@itsoa.io.vn
- **Documentation**: [Wiki](./wiki)
- **Issues**: [GitHub Issues](./issues)

---

**Made with ❤️ by ITSOA Team**