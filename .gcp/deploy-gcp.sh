#!/bin/bash

# GLB Renderer - Google Cloud VM Deployment Script
# Usage: chmod +x deploy-gcp.sh && ./deploy-gcp.sh

set -e

echo "🚀 Starting GLB Renderer deployment on Google Cloud VM..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running on Google Cloud VM
if ! command -v gcloud &> /dev/null; then
    print_warning "gcloud CLI not detected. Assuming running on Google Cloud VM."
fi

# Update system packages
print_status "Updating system packages..."
sudo apt-get update -y
sudo apt-get upgrade -y

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    print_status "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    print_success "Docker installed successfully"
else
    print_success "Docker is already installed"
fi

# Install Docker Compose if not present
if ! command -v docker-compose &> /dev/null; then
    print_status "Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    print_success "Docker Compose installed successfully"
else
    print_success "Docker Compose is already installed"
fi

# Install Git if not present
if ! command -v git &> /dev/null; then
    print_status "Installing Git..."
    sudo apt-get install git -y
    print_success "Git installed successfully"
else
    print_success "Git is already installed"
fi

# Clone repository
REPO_DIR="/opt/glb-renderer"
if [ -d "$REPO_DIR" ]; then
    print_status "Repository exists. Pulling latest changes..."
    cd $REPO_DIR
    sudo git pull origin main
else
    print_status "Cloning repository..."
    sudo git clone https://github.com/resdiihd/puppeteer-glb-renderer.git $REPO_DIR
    cd $REPO_DIR
fi

# Set permissions
sudo chown -R $USER:$USER $REPO_DIR

# Copy production environment file
print_status "Setting up production environment..."
if [ -f ".gcp/.env.production" ]; then
    cp .gcp/.env.production .env
    print_success "Production environment configured"
else
    print_error "Production environment file not found!"
    exit 1
fi

# Create required directories
sudo mkdir -p /opt/glb-renderer/uploads
sudo mkdir -p /opt/glb-renderer/renders
sudo mkdir -p /opt/glb-renderer/logs
sudo chown -R $USER:$USER /opt/glb-renderer/uploads
sudo chown -R $USER:$USER /opt/glb-renderer/renders
sudo chown -R $USER:$USER /opt/glb-renderer/logs

# Build and start containers
print_status "Building Docker containers..."
sudo docker-compose build --no-cache

print_status "Starting GLB Renderer services..."
sudo docker-compose up -d

# Wait for services to start
print_status "Waiting for services to start..."
sleep 30

# Check service status
if sudo docker-compose ps | grep -q "Up"; then
    print_success "GLB Renderer services started successfully!"
    
    # Show service status
    print_status "Service status:"
    sudo docker-compose ps
    
    # Show logs
    print_status "Recent logs:"
    sudo docker-compose logs --tail=20
    
    # Check SSL certificate status
    print_status "Checking SSL certificate status..."
    if sudo docker-compose exec -T glb-renderer certbot certificates 2>/dev/null; then
        print_success "SSL certificates are configured"
    else
        print_warning "SSL certificates may still be provisioning..."
    fi
    
    echo ""
    print_success "🎉 Deployment completed successfully!"
    echo ""
    echo "📡 Your GLB Renderer is now accessible at:"
    echo "   HTTP:  http://$(curl -s ifconfig.me):80"
    echo "   HTTPS: https://3d.itsoa.io.vn:443"
    echo ""
    echo "📋 Useful commands:"
    echo "   View logs:         sudo docker-compose logs -f"
    echo "   Restart services:  sudo docker-compose restart"
    echo "   Stop services:     sudo docker-compose down"
    echo "   SSL status:        sudo docker-compose exec glb-renderer certbot certificates"
    echo ""
    
else
    print_error "Failed to start GLB Renderer services!"
    print_status "Checking logs..."
    sudo docker-compose logs
    exit 1
fi