#!/bin/bash

# 🚀 CentOS Stream VM Setup Script for Puppeteer GLB Renderer
# Run this script on your CentOS Stream 10 GCP VM instance

set -e  # Exit on any error

echo "🚀 Setting up Puppeteer GLB Renderer on CentOS Stream 10..."

# Step 1: Update system
echo "📦 Updating system packages..."
sudo dnf update -y

# Step 2: Install EPEL repository and development tools
echo "🔧 Installing EPEL and development tools..."
sudo dnf install -y epel-release
sudo dnf groupinstall -y "Development Tools"
sudo dnf install -y curl wget git unzip

# Step 3: Install Node.js 18
echo "⚡ Installing Node.js 18..."
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo dnf install -y nodejs

# Verify Node.js installation
NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
echo "✅ Node.js installed: $NODE_VERSION"
echo "✅ NPM installed: $NPM_VERSION"

# Step 4: Install Chrome and dependencies
echo "🌐 Installing Google Chrome..."
# Create Chrome repository
sudo tee /etc/yum.repos.d/google-chrome.repo > /dev/null <<EOF
[google-chrome]
name=google-chrome
baseurl=http://dl.google.com/linux/chrome/rpm/stable/x86_64
enabled=1
gpgcheck=1
gpgkey=https://dl.google.com/linux/linux_signing_key.pub
EOF

# Install Chrome
sudo dnf install -y google-chrome-stable

# Install additional dependencies for Puppeteer
echo "📚 Installing Puppeteer dependencies..."
sudo dnf install -y \
    liberation-fonts \
    liberation-fonts-common \
    liberation-mono-fonts \
    liberation-narrow-fonts \
    liberation-sans-fonts \
    liberation-serif-fonts \
    google-noto-fonts-common \
    google-noto-sans-fonts \
    google-noto-serif-fonts \
    google-noto-mono-fonts \
    alsa-lib \
    atk \
    cairo-gobject \
    cups-libs \
    dbus-glib \
    gtk3 \
    libdrm \
    libXcomposite \
    libXdamage \
    libXrandr \
    libXss \
    libxkbcommon \
    mesa-libgbm \
    xorg-x11-server-Xvfb

# Verify Chrome installation
CHROME_VERSION=$(google-chrome --version)
echo "✅ Chrome installed: $CHROME_VERSION"

# Step 5: Install additional tools
echo "🛠️ Installing additional tools..."
sudo dnf install -y htop nginx firewalld

# Step 6: Create application directory
echo "📁 Creating application directory..."
sudo mkdir -p /opt/glb-renderer
sudo chown $USER:$USER /opt/glb-renderer

# Step 7: Install PM2 for process management
echo "🔧 Installing PM2..."
sudo npm install -g pm2

# Step 8: Configure SELinux (if enabled)
echo "🔒 Configuring SELinux..."
if command -v getenforce &> /dev/null && [ "$(getenforce)" != "Disabled" ]; then
    sudo setsebool -P httpd_can_network_connect 1
    sudo semanage port -a -t http_port_t -p tcp 3000 2>/dev/null || true
    echo "✅ SELinux configured for HTTP traffic"
fi

# Step 9: Configure firewall
echo "🔥 Configuring firewall..."
sudo systemctl enable firewalld
sudo systemctl start firewalld
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
echo "✅ Firewall configured to allow port 3000"

echo "✅ CentOS Stream VM setup completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Upload your project files to /opt/glb-renderer"
echo "2. Run 'npm install' in the project directory"
echo "3. Configure environment variables"
echo "4. Start the application with PM2"
echo ""
echo "🔧 To continue setup:"
echo "   cd /opt/glb-renderer"
echo "   # Upload your project files here"
echo "   npm install"
echo "   pm2 start src/server.js --name glb-renderer"
echo ""
echo "🌐 Chrome path: /usr/bin/google-chrome"
echo "📍 Project path: /opt/glb-renderer"
echo "🔥 Firewall: Port 3000 opened"