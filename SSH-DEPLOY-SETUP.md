# 🔑 SSH Deploy Key Setup Guide

## 📋 Overview
This guide shows how to setup SSH deploy keys for automatic deployment from GitHub to your Google Cloud VM.

## 🎯 What You Need
- ✅ SSH key pair generated on VM: `/root/.ssh/github_deploy_key`
- ✅ Public key: `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIE1jUb8MH9Qlnm43rF9cKg1O3+Q6Ec0EnrYjgpQJK7pr`
- 📝 GitHub repository: `resdiihd/puppeteer-glb-renderer`
- 🌐 VM IP: `34.142.244.25`

## 🔧 Step 1: Add Deploy Key to GitHub

### Via GitHub Web Interface:
1. Go to your repository: https://github.com/resdiihd/puppeteer-glb-renderer
2. Click **Settings** tab
3. Click **Deploy keys** in left sidebar
4. Click **Add deploy key** button
5. Fill in the form:
   - **Title**: `GLB Renderer VM Deploy Key`
   - **Key**: `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIE1jUb8MH9Qlnm43rF9cKg1O3+Q6Ec0EnrYjgpQJK7pr github-deploy-key@glb-renderer`
   - ✅ Check **Allow write access**
6. Click **Add key**

### Via GitHub CLI (if you have it):
```bash
# Install GitHub CLI first: https://cli.github.com/
gh repo deploy-key add /root/.ssh/github_deploy_key.pub --title "GLB Renderer VM Deploy Key" --allow-write
```

## 🚀 Step 2: Setup Auto-Deploy Script on VM

```bash
# SSH to your VM
ssh root@34.142.244.25

# Upload auto-deploy script
# (You can copy from local file or create directly)

# Make executable
chmod +x /opt/auto-deploy.sh

# Test the script
/opt/auto-deploy.sh
```

## ⚙️ Step 3: Configure GitHub Actions Secrets

Add these secrets to your GitHub repository:

1. Go to repository **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Add these secrets:

### Required Secrets:
```
VM_SSH_PRIVATE_KEY = [Contents of /root/.ssh/github_deploy_key - PRIVATE KEY]
VM_HOST = 34.142.244.25
```

To get the private key:
```bash
ssh root@34.142.244.25 "cat /root/.ssh/github_deploy_key"
```

## 🧪 Step 4: Test the Setup

### Manual Test:
```bash
# On VM, test Git clone with deploy key
export GIT_SSH_COMMAND="ssh -i /root/.ssh/github_deploy_key -o StrictHostKeyChecking=no"
git clone git@github.com:resdiihd/puppeteer-glb-renderer.git /tmp/test-clone
```

### GitHub Actions Test:
1. Make a small change to any file
2. Commit and push to main branch
3. Check Actions tab in GitHub for deployment status

## 🔄 How Auto-Deployment Works

### Trigger Events:
- ✅ Push to `main` branch
- ✅ Merged pull request to `main`

### Deployment Process:
1. 📥 **Pull Code**: Latest changes from GitHub
2. 📦 **Backup**: Current deployment
3. 🛑 **Stop**: Running services
4. 📦 **Install**: Dependencies with npm
5. ✅ **Validate**: Code syntax check
6. 🚀 **Start**: Services with PM2
7. 🏥 **Health Check**: Verify service is running
8. 🔄 **Rollback**: If anything fails

### Monitoring:
- 📊 **PM2**: `pm2 list`, `pm2 logs`
- 📝 **Logs**: `/var/log/glb-renderer/deploy.log`
- 💾 **Backups**: `/opt/glb-renderer-backups/`

## 🐛 Troubleshooting

### SSH Issues:
```bash
# Test SSH connection
ssh -i /root/.ssh/github_deploy_key -T git@github.com

# Expected output: "Hi resdiihd/puppeteer-glb-renderer! You've successfully authenticated"
```

### Permission Issues:
```bash
# Fix SSH key permissions
chmod 600 /root/.ssh/github_deploy_key
chmod 644 /root/.ssh/github_deploy_key.pub
```

### Git Issues:
```bash
# Configure Git to use deploy key
cd /opt/glb-renderer
git config core.sshCommand "ssh -i /root/.ssh/github_deploy_key -o StrictHostKeyChecking=no"
```

### Service Issues:
```bash
# Check PM2 status
pm2 list

# View logs
pm2 logs glb-renderer-enhanced

# Restart service
pm2 restart glb-renderer-enhanced
```

## 📊 Monitoring & Logs

### Deployment Logs:
```bash
tail -f /var/log/glb-renderer/deploy.log
```

### Service Logs:
```bash
pm2 logs glb-renderer-enhanced --lines 50
```

### System Status:
```bash
# Check service
curl http://localhost:3000/health

# Check processes
pm2 monit

# Check resources
htop
```

## 🎉 Success Indicators

When everything is working:
- ✅ GitHub shows green checkmark on commits
- ✅ Actions tab shows successful deployments
- ✅ Service responds at http://34.142.244.25:3000
- ✅ Health endpoint returns status 200
- ✅ PM2 shows service running
- ✅ No errors in deployment logs

## 🔒 Security Notes

- 🔑 Deploy key has **read-only access** to repository
- 🛡️ Private key stays secure on VM only
- 🔐 VM firewall blocks unauthorized access
- 📝 All deployment activities are logged
- 🔄 Automatic rollback on failures

---

**Ready for automated deployments! 🚀**