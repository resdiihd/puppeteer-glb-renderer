# 🌐 Nginx + SSL Setup Guide

## 🎯 Tổng Quan
Hướng dẫn setup Nginx reverse proxy với SSL certificate từ Let's Encrypt sử dụng Cloudflare DNS challenge.

## 📋 Chuẩn Bị

### 1. **Domain & DNS**
- Domain name (ví dụ: `glb.yourdomain.com`)
- Cloudflare account với domain của bạn
- DNS A record trỏ về IP VM: `34.142.244.25`

### 2. **Cloudflare API Token**
1. Vào: https://dash.cloudflare.com/profile/api-tokens
2. Click "Create Token"
3. Chọn template "Custom Token"
4. Cấu hình:
   - **Token name**: GLB Renderer SSL
   - **Permissions**:
     - Zone:DNS:Edit
     - Zone:Zone:Read
   - **Zone Resources**: Include - Specific zone - yourdomain.com
5. Copy API token đã tạo

## 🚀 Cài Đặt Tự Động

### Upload script lên VM:
```bash
# Từ máy local
scp setup-nginx-ssl.sh root@34.142.244.25:/tmp/
```

### Chạy script trên VM:
```bash
# SSH vào VM
ssh root@34.142.244.25

# Make executable và chạy
chmod +x /tmp/setup-nginx-ssl.sh
/tmp/setup-nginx-ssl.sh
```

### Script sẽ hỏi:
1. **Domain name**: Nhập domain của bạn (ví dụ: `glb.example.com`)
2. **Email**: Email để đăng ký SSL certificate
3. **Cloudflare API Token**: Paste token đã tạo

## 🔧 Cài Đặt Thủ Công

### 1. **Cài Nginx**
```bash
dnf update -y
dnf install -y nginx
systemctl start nginx
systemctl enable nginx
```

### 2. **Cài Certbot**
```bash
dnf install -y epel-release
dnf install -y certbot python3-certbot-nginx python3-certbot-dns-cloudflare
```

### 3. **Cấu hình Cloudflare**
```bash
# Tạo file credentials
nano /etc/letsencrypt/cloudflare.ini

# Thêm nội dung:
dns_cloudflare_api_token = your-cloudflare-api-token

# Set permissions
chmod 600 /etc/letsencrypt/cloudflare.ini
```

### 4. **Tạo Nginx Config**
```bash
nano /etc/nginx/sites-available/glb-renderer
```

Copy config từ file `nginx-config.conf` và thay `your-domain.com` bằng domain thật.

### 5. **Enable Site**
```bash
ln -s /etc/nginx/sites-available/glb-renderer /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### 6. **Lấy SSL Certificate**
```bash
certbot certonly \
    --dns-cloudflare \
    --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
    -d your-domain.com \
    -d www.your-domain.com \
    --email your-email@example.com \
    --agree-tos \
    --non-interactive
```

### 7. **Update Nginx với SSL**
Update Nginx config để enable SSL (uncomment các dòng SSL).

### 8. **Cấu hình Firewall**
```bash
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --reload
```

## ✅ **Sau Khi Setup Xong:**

### **URLs Mới:**
- 🔒 **HTTPS**: `https://your-domain.com`
- 🔒 **HTTPS**: `https://www.your-domain.com`
- ↩️ **HTTP**: `http://your-domain.com` → Redirect to HTTPS

### **Test Commands:**
```bash
# Test HTTPS
curl -I https://your-domain.com/health

# Test HTTP redirect
curl -I http://your-domain.com/health

# Check SSL
openssl s_client -connect your-domain.com:443 -servername your-domain.com

# Check certificate
certbot certificates
```

## 🔄 **Certificate Auto-Renewal:**

Certificates tự động renew qua systemd timer:
```bash
# Check renewal status
systemctl status certbot-renew.timer

# Test renewal
certbot renew --dry-run

# Manual renewal
certbot renew
```

## 📊 **Monitoring & Logs:**

### **Nginx Logs:**
```bash
# Access logs
tail -f /var/log/nginx/glb-renderer.access.log

# Error logs
tail -f /var/log/nginx/glb-renderer.error.log

# Nginx status
systemctl status nginx
```

### **SSL Certificate Info:**
```bash
# List certificates
certbot certificates

# Certificate details
openssl x509 -in /etc/letsencrypt/live/your-domain.com/cert.pem -text -noout
```

## 🔧 **Nginx Management:**

```bash
# Test configuration
nginx -t

# Reload configuration
systemctl reload nginx

# Restart Nginx
systemctl restart nginx

# Check status
systemctl status nginx
```

## 🐛 **Troubleshooting:**

### **SSL Issues:**
```bash
# Check certificate files exist
ls -la /etc/letsencrypt/live/your-domain.com/

# Test certificate renewal
certbot renew --dry-run

# Check Cloudflare credentials
cat /etc/letsencrypt/cloudflare.ini
```

### **Nginx Issues:**
```bash
# Check configuration syntax
nginx -t

# Check error logs
tail -20 /var/log/nginx/error.log

# Check if ports are open
netstat -tlpn | grep -E ':80|:443'
```

### **Firewall Issues:**
```bash
# Check firewall status
firewall-cmd --list-services

# Check if ports are open
firewall-cmd --list-ports
```

---

**Sau khi setup xong, GLB Renderer sẽ có HTTPS với SSL certificate tự động renew! 🎉**