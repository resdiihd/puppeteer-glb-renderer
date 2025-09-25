#!/bin/bash

# Nginx + SSL Setup Script for GLB Renderer
# Supports Cloudflare DNS + ACME (Let's Encrypt)

echo "🌐 Setting up Nginx Reverse Proxy with SSL..."

# Configuration
DOMAIN="your-domain.com"  # Replace with your actual domain
EMAIL="your-email@example.com"  # Replace with your email
SERVICE_NAME="glb-renderer-enhanced"
NGINX_CONFIG="/etc/nginx/sites-available/glb-renderer"
NGINX_ENABLED="/etc/nginx/sites-enabled/glb-renderer"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    print_error "This script must be run as root"
    exit 1
fi

# Function to install Nginx
install_nginx() {
    print_status "Installing Nginx..."
    
    dnf update -y
    dnf install -y nginx
    
    # Start and enable Nginx
    systemctl start nginx
    systemctl enable nginx
    
    print_success "Nginx installed and started"
}

# Function to configure firewall
configure_firewall() {
    print_status "Configuring firewall for HTTP/HTTPS..."
    
    firewall-cmd --permanent --add-service=http
    firewall-cmd --permanent --add-service=https
    firewall-cmd --reload
    
    print_success "Firewall configured"
}

# Function to install Certbot for Let's Encrypt
install_certbot() {
    print_status "Installing Certbot for Let's Encrypt..."
    
    # Install EPEL repository and Certbot
    dnf install -y epel-release
    dnf install -y certbot python3-certbot-nginx python3-certbot-dns-cloudflare
    
    print_success "Certbot installed"
}

# Function to setup Cloudflare DNS credentials
setup_cloudflare_credentials() {
    print_status "Setting up Cloudflare DNS credentials..."
    
    cat > /etc/letsencrypt/cloudflare.ini << 'EOF'
# Cloudflare API credentials
# Get these from: https://dash.cloudflare.com/profile/api-tokens

# Global API Key (NOT recommended - use API Token instead)
# dns_cloudflare_email = your-email@example.com
# dns_cloudflare_api_key = your-global-api-key

# API Token (Recommended - more secure)
dns_cloudflare_api_token = your-cloudflare-api-token

EOF

    chmod 600 /etc/letsencrypt/cloudflare.ini
    
    print_warning "Please edit /etc/letsencrypt/cloudflare.ini with your Cloudflare credentials"
    print_status "Get API Token from: https://dash.cloudflare.com/profile/api-tokens"
    print_status "Required permissions: Zone:DNS:Edit, Zone:Zone:Read"
}

# Function to create initial Nginx config (without SSL)
create_initial_nginx_config() {
    print_status "Creating initial Nginx configuration..."
    
    cat > "$NGINX_CONFIG" << EOF
# GLB Renderer Initial Configuration (HTTP only)
upstream glb_backend {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    
    # Client body size limit (for GLB file uploads)
    client_max_body_size 100M;
    client_body_timeout 120s;
    client_header_timeout 120s;
    
    # Proxy timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 300s;
    
    # Main application
    location / {
        proxy_pass http://glb_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_buffering off;
    }
    
    # Static file serving
    location /storage/ {
        proxy_pass http://glb_backend;
        proxy_cache_valid 200 1h;
        expires 1h;
    }
    
    # Health check
    location /health {
        proxy_pass http://glb_backend;
        access_log off;
    }
    
    # API endpoints with longer timeout
    location ~ ^/(upload|render) {
        proxy_pass http://glb_backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_comp_level 6;
    gzip_types application/json application/javascript text/css text/plain;
    
    # Logging
    access_log /var/log/nginx/glb-renderer.access.log;
    error_log /var/log/nginx/glb-renderer.error.log;
}
EOF

    # Enable the site
    ln -sf "$NGINX_CONFIG" "$NGINX_ENABLED"
    
    # Test Nginx configuration
    nginx -t
    
    if [ $? -eq 0 ]; then
        systemctl reload nginx
        print_success "Nginx configuration created and enabled"
    else
        print_error "Nginx configuration test failed"
        return 1
    fi
}

# Function to obtain SSL certificate with Cloudflare DNS
obtain_ssl_certificate() {
    print_status "Obtaining SSL certificate with Cloudflare DNS..."
    
    # Make sure Cloudflare credentials are configured
    if [ ! -f /etc/letsencrypt/cloudflare.ini ]; then
        print_error "Cloudflare credentials not found. Please run setup_cloudflare_credentials first."
        return 1
    fi
    
    # Obtain certificate using Cloudflare DNS challenge
    certbot certonly \
        --dns-cloudflare \
        --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
        --dns-cloudflare-propagation-seconds 60 \
        -d "$DOMAIN" \
        -d "www.$DOMAIN" \
        --email "$EMAIL" \
        --agree-tos \
        --no-eff-email \
        --non-interactive
    
    if [ $? -eq 0 ]; then
        print_success "SSL certificate obtained successfully"
        return 0
    else
        print_error "Failed to obtain SSL certificate"
        return 1
    fi
}

# Function to create final Nginx config with SSL
create_ssl_nginx_config() {
    print_status "Creating SSL-enabled Nginx configuration..."
    
    cat > "$NGINX_CONFIG" << EOF
# GLB Renderer with SSL Configuration
upstream glb_backend {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    
    # Redirect all HTTP requests to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    
    # SSL Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security Headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Client body size limit (for GLB file uploads)
    client_max_body_size 100M;
    client_body_timeout 120s;
    client_header_timeout 120s;
    
    # Proxy timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 300s;
    
    # Main application
    location / {
        proxy_pass http://glb_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_buffering off;
    }
    
    # Static file serving with caching
    location /storage/ {
        proxy_pass http://glb_backend;
        proxy_cache_valid 200 1h;
        expires 1h;
        add_header Cache-Control "public, immutable";
    }
    
    # Health check endpoint
    location /health {
        proxy_pass http://glb_backend;
        access_log off;
    }
    
    # API endpoints with longer timeout for rendering
    location ~ ^/(upload|render) {
        proxy_pass http://glb_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_buffering off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types
        application/atom+xml
        application/geo+json
        application/javascript
        application/x-javascript
        application/json
        application/ld+json
        application/manifest+json
        application/rdf+xml
        application/rss+xml
        application/xhtml+xml
        application/xml
        font/eot
        font/otf
        font/ttf
        image/svg+xml
        text/css
        text/javascript
        text/plain
        text/xml;
    
    # Logging
    access_log /var/log/nginx/glb-renderer.access.log;
    error_log /var/log/nginx/glb-renderer.error.log;
}
EOF

    # Test and reload Nginx
    nginx -t
    
    if [ $? -eq 0 ]; then
        systemctl reload nginx
        print_success "SSL-enabled Nginx configuration applied"
    else
        print_error "SSL Nginx configuration test failed"
        return 1
    fi
}

# Function to setup auto-renewal
setup_auto_renewal() {
    print_status "Setting up automatic SSL certificate renewal..."
    
    # Create renewal hook to reload Nginx
    cat > /etc/letsencrypt/renewal-hooks/deploy/nginx-reload.sh << 'EOF'
#!/bin/bash
systemctl reload nginx
EOF
    
    chmod +x /etc/letsencrypt/renewal-hooks/deploy/nginx-reload.sh
    
    # Test renewal
    certbot renew --dry-run
    
    if [ $? -eq 0 ]; then
        print_success "Auto-renewal configured and tested"
    else
        print_warning "Auto-renewal test failed, but certificates are still valid"
    fi
}

# Function to show final status
show_status() {
    print_success "🎉 Nginx + SSL Setup Complete!"
    echo ""
    echo "📍 Your GLB Renderer is now available at:"
    echo "   🔒 https://$DOMAIN"
    echo "   🔒 https://www.$DOMAIN"
    echo ""
    echo "🔧 Management Commands:"
    echo "   sudo systemctl status nginx     # Check Nginx status"
    echo "   sudo systemctl reload nginx    # Reload configuration"
    echo "   sudo certbot certificates      # Check SSL certificates"
    echo "   sudo certbot renew            # Manually renew certificates"
    echo ""
    echo "📋 Configuration Files:"
    echo "   Nginx: $NGINX_CONFIG"
    echo "   SSL: /etc/letsencrypt/live/$DOMAIN/"
    echo "   Logs: /var/log/nginx/glb-renderer.*.log"
    echo ""
    echo "🧪 Test Commands:"
    echo "   curl -I https://$DOMAIN/health"
    echo "   curl -I http://$DOMAIN/health   # Should redirect to HTTPS"
}

# Interactive setup function
interactive_setup() {
    echo "🌐 GLB Renderer Nginx + SSL Interactive Setup"
    echo "============================================="
    
    read -p "Enter your domain name (e.g., glb.example.com): " user_domain
    read -p "Enter your email for SSL certificate: " user_email
    
    if [ -n "$user_domain" ]; then
        DOMAIN="$user_domain"
    fi
    
    if [ -n "$user_email" ]; then
        EMAIL="$user_email"
    fi
    
    echo ""
    echo "📋 Configuration Summary:"
    echo "   Domain: $DOMAIN"
    echo "   Email: $EMAIL"
    echo "   Backend: 127.0.0.1:3000"
    echo ""
    
    read -p "Continue with this configuration? (y/N): " confirm
    
    if [[ $confirm =~ ^[Yy]$ ]]; then
        return 0
    else
        echo "Setup cancelled."
        exit 0
    fi
}

# Main setup function
main() {
    print_status "🚀 Starting Nginx + SSL Setup for GLB Renderer..."
    
    # Interactive configuration
    interactive_setup
    
    # Install and configure components
    install_nginx
    configure_firewall
    install_certbot
    setup_cloudflare_credentials
    
    print_warning "Please edit /etc/letsencrypt/cloudflare.ini with your Cloudflare API token"
    read -p "Press Enter after configuring Cloudflare credentials..."
    
    create_initial_nginx_config
    
    print_status "Testing HTTP setup before obtaining SSL..."
    sleep 3
    
    if obtain_ssl_certificate; then
        create_ssl_nginx_config
        setup_auto_renewal
        show_status
    else
        print_error "SSL setup failed. HTTP proxy is still working."
        print_status "You can access your service at: http://$DOMAIN"
    fi
}

# Handle script arguments
case "${1:-}" in
    "install-nginx")
        install_nginx
        ;;
    "configure-ssl")
        obtain_ssl_certificate && create_ssl_nginx_config
        ;;
    "test-renewal")
        certbot renew --dry-run
        ;;
    *)
        main "$@"
        ;;
esac