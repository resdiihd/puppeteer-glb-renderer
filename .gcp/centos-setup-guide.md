# 🚀 CentOS Stream 10 VM Setup Guide for Puppeteer GLB Renderer

## 📋 CentOS Stream 10 Specific Setup Instructions

### **Kiểm Tra OS Version**
```bash
# Xác nhận OS version
cat /etc/os-release
hostnamectl
```

---

## **🎯 Option A: Auto Setup Script**

### **Download và Run Script:**
```bash
# Download setup script
curl -sSL https://raw.githubusercontent.com/YOUR-REPO/BE-3D-tour/main/.gcp/vm-setup.sh -o vm-setup.sh

# Hoặc tạo file manual:
nano vm-setup.sh
# Copy nội dung từ file vm-setup.sh

# Make executable và run
chmod +x vm-setup.sh
./vm-setup.sh
```

---

## **🎯 Option B: Manual Step by Step**

### **1. Update System & Install Development Tools**
```bash
# Update CentOS Stream
sudo dnf update -y

# Install EPEL repository
sudo dnf install -y epel-release

# Install development tools
sudo dnf groupinstall -y "Development Tools"
sudo dnf install -y curl wget git unzip
```

### **2. Install Node.js 18**
```bash
# Add NodeSource repository for CentOS/RHEL
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -

# Install Node.js
sudo dnf install -y nodejs

# Verify installation
node --version  # Should show v18.x.x
npm --version
```

### **3. Install Google Chrome**
```bash
# Create Chrome repository file
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

# Verify Chrome installation
google-chrome --version
```

### **4. Install Puppeteer Dependencies**
```bash
# Install fonts and libraries needed for Puppeteer
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

# Test Chrome with no-sandbox
google-chrome --no-sandbox --headless --disable-gpu --version
```

### **5. Configure SELinux (If Enabled)**
```bash
# Check SELinux status
getenforce

# If SELinux is enabled, configure it
if [ "$(getenforce)" != "Disabled" ]; then
    # Allow HTTP connections
    sudo setsebool -P httpd_can_network_connect 1
    
    # Add port 3000 to allowed HTTP ports
    sudo semanage port -a -t http_port_t -p tcp 3000
    
    echo "✅ SELinux configured for HTTP traffic"
fi
```

### **6. Configure Firewall**
```bash
# Start and enable firewalld
sudo systemctl enable firewalld
sudo systemctl start firewalld

# Open port 3000 for the application
sudo firewall-cmd --permanent --add-port=3000/tcp

# Reload firewall rules
sudo firewall-cmd --reload

# Check firewall status
sudo firewall-cmd --list-ports
```

### **7. Setup Project Directory**
```bash
# Create application directory
sudo mkdir -p /opt/glb-renderer
sudo chown $USER:$USER /opt/glb-renderer
cd /opt/glb-renderer

# Install PM2 process manager
sudo npm install -g pm2
```

---

## **📦 Upload Project Files**

### **Method 1: Upload from Local (Recommended)**
```bash
# Từ máy local Windows (PowerShell mới)
cd "C:\Users\RD\Desktop\BE 3D tour"

# Upload entire project to VM
gcloud compute scp --recurse . be-3d-render:/opt/glb-renderer --zone "asia-southeast1-a" --project "spatial-subject-470302-j2"
```

### **Method 2: Manual File Creation**
```bash
# Trên VM, tạo từng file cần thiết
cd /opt/glb-renderer

# Tạo package.json
cat > package.json << 'EOF'
{
  "name": "puppeteer-glb-renderer",
  "version": "1.0.0",
  "description": "Advanced Server-Side GLB Rendering with Puppeteer",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "test": "node src/test.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "puppeteer": "^21.11.0",
    "multer": "^1.4.5-lts.1",
    "sharp": "^0.32.6",
    "ffmpeg-static": "^5.2.0",
    "three": "^0.158.0",
    "uuid": "^9.0.1",
    "cors": "^2.8.5"
  }
}
EOF

# Tạo thư mục cấu trúc
mkdir -p src/renderer src/queue src/viewer storage/uploads storage/renders storage/temp
```

---

## **🔧 Install Dependencies & Configure**

### **Install NPM Packages:**
```bash
cd /opt/glb-renderer
npm install

# Fix potential permission issues
sudo chown -R $USER:$USER node_modules/
```

### **Create Environment File:**
```bash
# Tạo file .env cho production
cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
MAX_CONCURRENT_JOBS=3
REQUEST_TIMEOUT=300000
PUPPETEER_ARGS=--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage,--disable-gpu
LOG_LEVEL=info
EOF
```

---

## **🚀 Start Application**

### **Start with PM2:**
```bash
cd /opt/glb-renderer

# Start application with PM2
pm2 start src/server.js --name glb-renderer

# Check status
pm2 status
pm2 logs glb-renderer

# Monitor resources
pm2 monit
```

### **Configure Auto-start:**
```bash
# Setup PM2 to start on boot
pm2 startup

# Copy and run the command PM2 provides (usually like this:)
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME

# Save current PM2 processes
pm2 save
```

---

## **🔥 Configure GCP Firewall**

### **Create Firewall Rule:**
```bash
# Từ local machine hoặc Cloud Shell
gcloud compute firewall-rules create allow-glb-renderer-centos \
    --allow tcp:3000 \
    --source-ranges 0.0.0.0/0 \
    --target-tags http-server \
    --description "Allow GLB Renderer on port 3000" \
    --project "spatial-subject-470302-j2"

# Add tag to VM instance
gcloud compute instances add-tags be-3d-render \
    --tags http-server \
    --zone "asia-southeast1-a" \
    --project "spatial-subject-470302-j2"
```

---

## **🧪 Test Your Deployment**

### **Get External IP:**
```bash
# On VM
curl ifconfig.me

# Or from local
gcloud compute instances describe be-3d-render \
    --zone "asia-southeast1-a" \
    --project "spatial-subject-470302-j2" \
    --format="get(networkInterfaces[0].accessConfigs[0].natIP)"
```

### **Test Endpoints:**
```bash
# Get your external IP first
EXTERNAL_IP=$(curl -s ifconfig.me)
echo "External IP: $EXTERNAL_IP"

# Test locally on VM
curl http://localhost:3000/health

# Test externally (from browser or another machine)
curl http://$EXTERNAL_IP:3000/health
```

---

## **🔍 Troubleshooting CentOS-Specific Issues**

### **Chrome Issues:**
```bash
# Test Chrome directly
google-chrome --no-sandbox --headless --disable-gpu --dump-dom https://www.google.com

# Check Chrome dependencies
ldd /usr/bin/google-chrome | grep "not found"

# Install missing dependencies if any
sudo dnf install -y mesa-libgbm
```

### **SELinux Issues:**
```bash
# Check SELinux denials
sudo ausearch -m AVC -ts recent

# Temporarily disable SELinux for testing
sudo setenforce 0  # Only for testing!

# Re-enable after testing
sudo setenforce 1
```

### **Firewall Issues:**
```bash
# Check firewall status
sudo firewall-cmd --state
sudo firewall-cmd --list-all

# Test port connectivity
sudo ss -tulpn | grep 3000
```

### **Node.js/NPM Issues:**
```bash
# Check Node.js installation
which node
which npm
npm config list

# Fix NPM permissions
npm config set prefix ~/.local
export PATH="$HOME/.local/bin:$PATH"
```

---

## **📊 Monitor & Maintain**

### **System Monitoring:**
```bash
# Check system resources
htop
df -h
free -h
iostat -x 1

# Monitor application
pm2 status
pm2 logs glb-renderer --lines 50

# Monitor Chrome processes
ps aux | grep chrome
```

### **Log Management:**
```bash
# Application logs
tail -f ~/.pm2/logs/glb-renderer-out.log
tail -f ~/.pm2/logs/glb-renderer-error.log

# System logs
sudo journalctl -f -u pm2-$USER
```

---

## **🎯 Performance Optimization for CentOS**

### **System Tuning:**
```bash
# Increase file limits
echo "* soft nofile 65536" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 65536" | sudo tee -a /etc/security/limits.conf

# Optimize for Chrome/Puppeteer
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### **Chrome Optimization:**
```bash
# Add Chrome-specific environment variables
cat >> ~/.bashrc << 'EOF'
export CHROME_BIN=/usr/bin/google-chrome
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
EOF

source ~/.bashrc
```

---

## **✅ Success Checklist:**

- [ ] CentOS Stream 10 updated
- [ ] Node.js 18 installed
- [ ] Google Chrome installed
- [ ] Puppeteer dependencies installed
- [ ] SELinux configured (if enabled)
- [ ] Firewall configured
- [ ] Project files uploaded
- [ ] Dependencies installed
- [ ] Environment configured
- [ ] Application started with PM2
- [ ] External access working
- [ ] Health endpoint responding

**🎉 Your CentOS Stream 10 VM is now ready for production GLB rendering!**