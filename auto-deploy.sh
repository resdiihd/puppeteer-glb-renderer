#!/bin/bash

# Auto Deploy Script for GLB Renderer
# This script pulls latest code from GitHub and redeploys the service

echo "🚀 Starting Auto Deployment..."

# Configuration
REPO_URL="git@github.com:resdiihd/puppeteer-glb-renderer.git"
PROJECT_DIR="/opt/glb-renderer"
SERVICE_NAME="glb-renderer-enhanced"
LOG_FILE="/var/log/glb-renderer/deploy.log"
BACKUP_DIR="/opt/glb-renderer-backups"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS:${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$LOG_FILE"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    log_error "This script must be run as root"
    exit 1
fi

# Create log directory if not exists
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$BACKUP_DIR"

log "🎯 Auto deployment started"

# Function to create backup
create_backup() {
    if [ -d "$PROJECT_DIR" ]; then
        local backup_name="backup-$(date +%Y%m%d-%H%M%S)"
        log "📦 Creating backup: $backup_name"
        
        cp -r "$PROJECT_DIR" "$BACKUP_DIR/$backup_name"
        
        # Keep only last 5 backups
        cd "$BACKUP_DIR"
        ls -t | tail -n +6 | xargs -r rm -rf
        
        log_success "Backup created successfully"
    fi
}

# Function to stop services
stop_services() {
    log "🛑 Stopping services..."
    
    # Stop PM2 processes
    if command -v pm2 &> /dev/null; then
        pm2 stop "$SERVICE_NAME" 2>/dev/null || log_warning "Service not running"
        pm2 delete "$SERVICE_NAME" 2>/dev/null || true
    fi
    
    # Kill any remaining node processes
    pkill -f "node.*server" 2>/dev/null || true
    
    log_success "Services stopped"
}

# Function to pull latest code
pull_code() {
    log "📥 Pulling latest code from GitHub..."
    
    cd "$PROJECT_DIR"
    
    # Configure SSH to use the deploy key
    export GIT_SSH_COMMAND="ssh -i /root/.ssh/github_deploy_key -o StrictHostKeyChecking=no"
    
    # Pull latest changes
    if git pull origin main; then
        log_success "Code pulled successfully"
        
        # Show latest commit
        local latest_commit=$(git log -1 --pretty=format:"%h - %s (%an, %ar)")
        log "📝 Latest commit: $latest_commit"
        
        return 0
    else
        log_error "Failed to pull code from GitHub"
        return 1
    fi
}

# Function to install dependencies
install_dependencies() {
    log "📦 Installing/updating Node.js dependencies..."
    
    cd "$PROJECT_DIR"
    
    # Clear cache and reinstall
    npm cache clean --force 2>/dev/null || true
    rm -rf node_modules package-lock.json 2>/dev/null || true
    
    # Install with production flag
    if npm install --production --no-optional; then
        log_success "Dependencies installed successfully"
        return 0
    else
        log_error "Failed to install dependencies"
        return 1
    fi
}

# Function to validate code
validate_code() {
    log "✅ Validating code..."
    
    cd "$PROJECT_DIR"
    
    # Check if main files exist
    if [ ! -f "server.js" ] && [ ! -f "src/server.js" ]; then
        log_error "Server file not found"
        return 1
    fi
    
    if [ ! -f "package.json" ]; then
        log_error "package.json not found"
        return 1
    fi
    
    # Test node syntax
    local server_file="server.js"
    [ -f "src/server.js" ] && server_file="src/server.js"
    
    if node -c "$server_file" 2>/dev/null; then
        log_success "Code syntax validation passed"
        return 0
    else
        log_error "Code syntax validation failed"
        return 1
    fi
}

# Function to start services
start_services() {
    log "🚀 Starting services..."
    
    cd "$PROJECT_DIR"
    
    # Determine server file location
    local server_file="server.js"
    [ -f "src/server.js" ] && server_file="src/server.js"
    
    # Start with PM2
    if pm2 start "$server_file" --name "$SERVICE_NAME"; then
        pm2 save
        
        # Wait for service to start
        sleep 5
        
        # Check if service is running
        if pm2 list | grep -q "$SERVICE_NAME.*online"; then
            log_success "Service started successfully"
            return 0
        else
            log_error "Service failed to start"
            pm2 logs "$SERVICE_NAME" --lines 10
            return 1
        fi
    else
        log_error "Failed to start service with PM2"
        return 1
    fi
}

# Function to run health check
health_check() {
    log "🏥 Running health check..."
    
    # Wait for service to be ready
    sleep 10
    
    # Check if port 3000 is listening
    if netstat -tlpn | grep -q ":3000"; then
        log_success "Service is listening on port 3000"
    else
        log_error "Service is not listening on port 3000"
        return 1
    fi
    
    # Try to connect to health endpoint
    local max_attempts=5
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s --max-time 10 http://localhost:3000/health > /dev/null; then
            log_success "Health endpoint responding"
            return 0
        else
            log_warning "Health check attempt $attempt/$max_attempts failed"
            sleep 5
            ((attempt++))
        fi
    done
    
    log_error "Health check failed after $max_attempts attempts"
    return 1
}

# Function to send notification
send_notification() {
    local status=$1
    local message=$2
    
    if [ "$status" = "success" ]; then
        log_success "🎉 DEPLOYMENT SUCCESS: $message"
    else
        log_error "💥 DEPLOYMENT FAILED: $message"
    fi
    
    # Could add webhook notification here
    # curl -X POST "webhook_url" -d "{"text": "$message"}"
}

# Function to rollback
rollback() {
    log_warning "🔄 Starting rollback..."
    
    # Find latest backup
    local latest_backup=$(ls -t "$BACKUP_DIR" | head -n 1)
    
    if [ -n "$latest_backup" ]; then
        log "📦 Rolling back to: $latest_backup"
        
        # Stop current service
        pm2 stop "$SERVICE_NAME" 2>/dev/null || true
        pm2 delete "$SERVICE_NAME" 2>/dev/null || true
        
        # Restore backup
        rm -rf "$PROJECT_DIR"
        cp -r "$BACKUP_DIR/$latest_backup" "$PROJECT_DIR"
        
        # Start service
        cd "$PROJECT_DIR"
        pm2 start server.js --name "$SERVICE_NAME"
        pm2 save
        
        log_success "Rollback completed"
    else
        log_error "No backup found for rollback"
    fi
}

# Main deployment function
main() {
    local start_time=$(date +%s)
    
    log "🎯 Starting auto deployment process..."
    
    # Create backup before deployment
    create_backup
    
    # Stop current services
    stop_services
    
    # Pull latest code
    if ! pull_code; then
        send_notification "failed" "Failed to pull code from GitHub"
        exit 1
    fi
    
    # Install dependencies
    if ! install_dependencies; then
        send_notification "failed" "Failed to install dependencies"
        rollback
        exit 1
    fi
    
    # Validate code
    if ! validate_code; then
        send_notification "failed" "Code validation failed"
        rollback
        exit 1
    fi
    
    # Start services
    if ! start_services; then
        send_notification "failed" "Failed to start services"
        rollback
        exit 1
    fi
    
    # Health check
    if ! health_check; then
        send_notification "failed" "Health check failed"
        rollback
        exit 1
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    log_success "🎊 Auto deployment completed successfully in ${duration}s"
    
    # Show deployment info
    log "📊 Deployment Summary:"
    log "   - Service: $SERVICE_NAME"
    log "   - Status: $(pm2 list | grep "$SERVICE_NAME" | awk '{print $10}')"
    log "   - URL: http://$(curl -s ifconfig.me):3000"
    log "   - Duration: ${duration}s"
    
    send_notification "success" "Auto deployment completed in ${duration}s"
}

# Handle script interruption
trap 'log_error "Deployment interrupted"; exit 1' INT TERM

# Run main function
main "$@"