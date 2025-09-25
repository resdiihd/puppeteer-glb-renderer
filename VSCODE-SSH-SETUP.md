# 🖥️ VS Code SSH Setup Guide

## 🎯 Bạn đã có 3 cách connect vào VM:

### 1. **Remote-SSH Extension** (Khuyến nghị ⭐)
- ✅ Đã install extension Remote-SSH
- ✅ Đã tạo SSH config file
- 🔧 **Cách dùng:**
  1. Press `Ctrl+Shift+P`
  2. Type "Remote-SSH: Connect to Host"
  3. Chọn `glb-renderer` (root user) hoặc `glb-renderer-rd` (RD user)

### 2. **PuTTY Terminal trong VS Code**
- ✅ Đã config PuTTY terminal profile
- 🔧 **Cách dùng:**
  1. Press `Ctrl+Shift+P`
  2. Type "Terminal: Select Default Profile"
  3. Chọn "PuTTY SSH" hoặc "PuTTY SSH (Interactive)"
  4. Press `Ctrl+`` để mở terminal

### 3. **Integrated Terminal** (gcloud)
- 🔧 **Cách dùng:**
  ```bash
  gcloud compute ssh be-3d-render --zone "asia-southeast1-a"
  ```

## 🚀 **Bây giờ bạn có thể:**

### **Option 1: Remote-SSH (Tốt nhất)**
1. Press `Ctrl+Shift+P`
2. Type "Remote-SSH: Connect to Host"
3. Chọn `glb-renderer` 
4. VS Code sẽ mở window mới connected trực tiếp đến VM
5. Có thể edit files trực tiếp trên VM!

### **Option 2: Terminal trong VS Code**
1. Press `Ctrl+Shift+P`
2. Type "Terminal: Select Default Profile"
3. Chọn "PuTTY SSH (Interactive)"
4. Press `Ctrl+`` để mở terminal SSH

## 🔧 **Test Auto-Deploy System:**

Sau khi connect vào VM, chạy các lệnh này:

```bash
# Check current deployment
cd /opt/glb-renderer
git status
pm2 list

# Test auto-deploy script
/opt/auto-deploy.sh

# Check logs
tail -f /var/log/glb-renderer/deploy.log
```

## 🎪 **Test từ GitHub:**

1. Make a small change to any file
2. Commit and push:
   ```bash
   git add .
   git commit -m "Test auto deployment"
   git push origin main
   ```
3. Check GitHub Actions tab
4. Verify deployment on VM

---

**Bạn muốn dùng cách nào? Remote-SSH hay Terminal? 🤔**