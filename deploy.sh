#!/bin/bash

# Production deployment script for GLB Renderer
# Usage: ./deploy.sh [environment]

set -e

ENVIRONMENT=${1:-production}
DOCKER_IMAGE="glb-renderer:${ENVIRONMENT}"
CONTAINER_NAME="glb-renderer-${ENVIRONMENT}"

echo "🚀 Deploying GLB Renderer to ${ENVIRONMENT}..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Check if .env file exists
if [[ ! -f .env ]]; then
    print_warning ".env file not found. Creating from example..."
    cat > .env << EOF
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
DOMAIN=3d.itsoa.io.vn
CLOUDFLARE_TOKEN=3YeqmF46MSojOcJ6zi7rjlQpyKZGC-cXRLgO_AWj
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
EOF
fi

# Stop existing container if running
if docker ps -q -f name=${CONTAINER_NAME} | grep -q .; then
    print_status "Stopping existing container..."
    docker-compose down
fi

# Remove old image if exists
if docker images -q ${DOCKER_IMAGE} | grep -q .; then
    print_status "Removing old image..."
    docker rmi ${DOCKER_IMAGE} || true
fi

# Build new image
print_status "Building Docker image..."
docker-compose build --no-cache

# Create storage directory if not exists
mkdir -p storage

# Set proper permissions
chmod 755 storage

# Start services
print_status "Starting services..."
docker-compose up -d

# Wait for container to be ready
print_status "Waiting for container to be ready..."
sleep 10

# Health check
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -f -s http://localhost/health > /dev/null; then
        print_status "✅ GLB Renderer is healthy and ready!"
        break
    else
        print_warning "Waiting for service to be ready... ($((RETRY_COUNT + 1))/${MAX_RETRIES})"
        sleep 2
        RETRY_COUNT=$((RETRY_COUNT + 1))
    fi
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    print_error "❌ Service failed to start properly"
    print_error "Check logs with: docker-compose logs -f"
    exit 1
fi

# Display deployment info
echo ""
print_status "🎉 Deployment completed successfully!"
echo ""
echo "📊 Service Information:"
echo "  - Environment: ${ENVIRONMENT}"
echo "  - Container: ${CONTAINER_NAME}"
echo "  - Health Check: http://localhost/health"
echo "  - API Documentation: http://localhost/api-docs"
echo "  - Domain: https://3d.itsoa.io.vn"
echo ""
echo "📋 Useful Commands:"
echo "  - View logs: docker-compose logs -f"
echo "  - Restart: docker-compose restart"
echo "  - Stop: docker-compose down"
echo "  - Update: git pull && ./deploy.sh"
echo ""

# Show running containers
print_status "📦 Running containers:"
docker-compose ps

# Show logs for the last few lines
echo ""
print_status "📝 Recent logs:"
docker-compose logs --tail=20

echo ""
print_status "🔗 Service endpoints:"
echo "  GET  /health               - Health check"
echo "  POST /api/upload           - Upload GLB file"
echo "  POST /api/render           - Render GLB to image"
echo "  POST /api/render/multi     - Multi-angle render"
echo "  GET  /api/render/status    - Render service status"
echo ""

print_status "Deployment completed! 🚀"