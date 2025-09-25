#!/bin/bash

# Enhanced GLB Renderer Deployment Script
# For Google Cloud VM (CentOS Stream 10)

echo "🚀 Starting Enhanced GLB Renderer Deployment..."

# Configuration
PROJECT_DIR="/opt/glb-renderer"
BACKUP_DIR="/opt/glb-renderer-backup-$(date +%Y%m%d-%H%M%S)"
SERVICE_NAME="glb-renderer"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Function to check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root"
        exit 1
    fi
}

# Function to backup current deployment
backup_current() {
    if [ -d "$PROJECT_DIR" ]; then
        print_status "Creating backup of current deployment..."
        cp -r "$PROJECT_DIR" "$BACKUP_DIR"
        print_success "Backup created at: $BACKUP_DIR"
    fi
}

# Function to stop current services
stop_services() {
    print_status "Stopping current GLB renderer services..."
    
    # Stop PM2 processes
    if command -v pm2 &> /dev/null; then
        sudo -u nodejs pm2 stop all || true
        sudo -u nodejs pm2 delete all || true
    fi
    
    # Stop any node processes on port 3000
    pkill -f "node.*server" || true
    
    print_success "Services stopped"
}

# Function to install dependencies
install_dependencies() {
    print_status "Installing/updating system dependencies..."
    
    # Update system
    dnf update -y
    
    # Install required packages
    dnf install -y \
        curl \
        wget \
        git \
        unzip \
        gcc-c++ \
        make \
        python3 \
        python3-pip \
        chromium \
        chromium-headless \
        liberation-fonts \
        dejavu-sans-fonts \
        liberation-sans-fonts
    
    # Install Node.js if not present
    if ! command -v node &> /dev/null; then
        print_status "Installing Node.js..."
        curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
        dnf install -y nodejs
    fi
    
    # Install PM2 globally if not present
    if ! command -v pm2 &> /dev/null; then
        print_status "Installing PM2 process manager..."
        npm install -g pm2
    fi
    
    print_success "Dependencies installed"
}

# Function to setup project directory
setup_project() {
    print_status "Setting up project directory..."
    
    # Create project directory
    mkdir -p "$PROJECT_DIR"
    cd "$PROJECT_DIR"
    
    # Create storage directories
    mkdir -p storage/uploads storage/renders
    
    # Set permissions
    chmod 755 "$PROJECT_DIR"
    chmod 755 storage
    chmod 755 storage/uploads storage/renders
    
    print_success "Project directory setup complete"
}

# Function to deploy enhanced files
deploy_files() {
    print_status "Deploying enhanced server files..."
    
    # Copy enhanced server file
    if [ ! -f "/tmp/server-enhanced.js" ]; then
        print_error "Enhanced server file not found at /tmp/server-enhanced.js"
        print_status "Please upload the enhanced server file first"
        return 1
    fi
    
    cp /tmp/server-enhanced.js "$PROJECT_DIR/server.js"
    
    # Copy enhanced package.json
    if [ ! -f "/tmp/package-fixed.json" ]; then
        print_error "Enhanced package file not found at /tmp/package-fixed.json"
        print_status "Please upload the enhanced package file first"
        return 1
    fi
    
    cp /tmp/package-fixed.json "$PROJECT_DIR/package.json"
    
    print_success "Enhanced files deployed"
}

# Function to install Node.js dependencies
install_node_deps() {
    print_status "Installing Node.js dependencies..."
    
    cd "$PROJECT_DIR"
    
    # Clear any existing node_modules
    rm -rf node_modules package-lock.json
    
    # Install dependencies with specific flags for CentOS
    npm install --production --no-optional
    
    # Verify critical dependencies
    if npm list puppeteer &> /dev/null; then
        print_success "Puppeteer installed successfully"
    else
        print_warning "Installing Puppeteer with additional flags..."
        npm install puppeteer --unsafe-perm=true --allow-root
    fi
    
    # Install Three.js if missing
    if ! npm list three &> /dev/null; then
        npm install three@0.158.0
    fi
    
    print_success "Node.js dependencies installed"
}

# Function to configure Chrome for Puppeteer
configure_chrome() {
    print_status "Configuring Chrome for Puppeteer..."
    
    # Find Chrome executable
    CHROME_PATH=""
    for path in "/usr/bin/chromium-browser" "/usr/bin/chromium" "/usr/bin/google-chrome" "/usr/bin/chrome"; do
        if [ -f "$path" ]; then
            CHROME_PATH="$path"
            break
        fi
    done
    
    if [ -z "$CHROME_PATH" ]; then
        print_error "Chrome/Chromium not found"
        return 1
    fi
    
    print_success "Chrome found at: $CHROME_PATH"
    
    # Set Chrome path for Puppeteer
    export PUPPETEER_EXECUTABLE_PATH="$CHROME_PATH"
    echo "export PUPPETEER_EXECUTABLE_PATH=\"$CHROME_PATH\"" >> /etc/environment
    
    print_success "Chrome configured for Puppeteer"
}

# Function to configure firewall
configure_firewall() {
    print_status "Configuring firewall..."
    
    # Enable firewall if not enabled
    systemctl enable firewalld
    systemctl start firewalld
    
    # Open port 3000
    firewall-cmd --permanent --add-port=3000/tcp
    firewall-cmd --reload
    
    print_success "Firewall configured (port 3000 opened)"
}

# Function to create PM2 ecosystem file
create_pm2_config() {
    print_status "Creating PM2 configuration..."
    
    cat > "$PROJECT_DIR/ecosystem.config.js" << 'EOF'
module.exports = {
  apps: [{
    name: 'glb-renderer-enhanced',
    script: 'server.js',
    cwd: '/opt/glb-renderer',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: 'true',
      PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium-browser'
    },
    error_file: '/var/log/glb-renderer/error.log',
    out_file: '/var/log/glb-renderer/out.log',
    log_file: '/var/log/glb-renderer/combined.log',
    time: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
EOF
    
    # Create log directory
    mkdir -p /var/log/glb-renderer
    chmod 755 /var/log/glb-renderer
    
    print_success "PM2 configuration created"
}

# Function to start services
start_services() {
    print_status "Starting enhanced GLB renderer service..."
    
    cd "$PROJECT_DIR"
    
    # Start with PM2
    pm2 start ecosystem.config.js
    pm2 save
    pm2 startup
    
    # Wait for service to start
    sleep 5
    
    # Check if service is running
    if pm2 list | grep -q "glb-renderer-enhanced"; then
        print_success "GLB renderer service started successfully"
    else
        print_error "Failed to start GLB renderer service"
        pm2 logs glb-renderer-enhanced --lines 20
        return 1
    fi
    
    print_success "Enhanced GLB renderer deployment complete!"
}

# Function to run health check
health_check() {
    print_status "Running health check..."
    
    sleep 3
    
    # Check if port 3000 is listening
    if netstat -tlpn | grep -q ":3000"; then
        print_success "Service is listening on port 3000"
    else
        print_error "Service is not listening on port 3000"
        return 1
    fi
    
    # Try to connect to health endpoint
    if curl -s http://localhost:3000/health > /dev/null; then
        print_success "Health endpoint responding"
    else
        print_warning "Health endpoint not responding (this may be normal during startup)"
    fi
    
    # Show PM2 status
    print_status "PM2 Process Status:"
    pm2 list
    
    print_status "Recent logs:"
    pm2 logs glb-renderer-enhanced --lines 10 --nostream
}

# Function to show deployment info
show_info() {
    print_success "🎉 Enhanced GLB Renderer Deployment Complete!"
    echo ""
    echo "📍 Service URL: http://$(curl -s ifconfig.me):3000"
    echo "🏠 Local URL: http://localhost:3000"
    echo "📁 Project Directory: $PROJECT_DIR"
    echo "📋 PM2 Process: glb-renderer-enhanced"
    echo ""
    echo "🔧 Management Commands:"
    echo "  pm2 restart glb-renderer-enhanced  # Restart service"
    echo "  pm2 stop glb-renderer-enhanced     # Stop service"
    echo "  pm2 logs glb-renderer-enhanced     # View logs"
    echo "  pm2 monit                          # Monitor processes"
    echo ""
    echo "🧪 Test Endpoints:"
    echo "  GET  /                   # Service info"
    echo "  GET  /health             # Health check"
    echo "  POST /upload             # Upload GLB files"
    echo "  POST /render/:filename   # Render GLB to images"
    echo ""
    
    if [ -d "$BACKUP_DIR" ]; then
        echo "💾 Backup Location: $BACKUP_DIR"
    fi
}

# Main deployment function
main() {
    print_status "🚀 Enhanced GLB Renderer Deployment Starting..."
    
    check_root
    backup_current
    stop_services
    install_dependencies
    setup_project
    deploy_files || exit 1
    install_node_deps
    configure_chrome
    configure_firewall
    create_pm2_config
    start_services
    health_check
    show_info
    
    print_success "🎊 Deployment completed successfully!"
}

# Run main function
main "$@"