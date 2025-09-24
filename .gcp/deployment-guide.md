# 🚀 Google Cloud Deployment Guide

## 📋 Prerequisites Checklist

### 1. **Google Cloud Account Setup**
- [ ] GCP Account created
- [ ] Billing enabled
- [ ] gcloud CLI installed
- [ ] Default project created

### 2. **Required GCP Services**
```bash
# Enable required APIs
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  containerregistry.googleapis.com \
  storage-api.googleapis.com
```

### 3. **Local Environment**
- [ ] Docker Desktop running
- [ ] gcloud CLI authenticated
- [ ] Project tested locally

---

## 🎯 Option 1: Cloud Run Deployment (Recommended)

### **A. Dockerfile Optimization for Cloud Run**
```dockerfile
# Optimized for Cloud Run
FROM node:18-bullseye-slim

# Install Chrome and dependencies
RUN apt-get update && apt-get install -y \
    wget gnupg ca-certificates \
    fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 \
    libdrm2 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libxss1 \
    libgtkd-3-0 libxshmfence1 --no-install-recommends \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Cloud Run environment
ENV PORT=8080
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
ENV NODE_ENV=production

EXPOSE 8080
CMD ["npm", "start"]
```

### **B. Cloud Run Configuration**
```yaml
# cloudrun.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: puppeteer-glb-renderer
  annotations:
    run.googleapis.com/ingress: all
spec:
  template:
    metadata:
      annotations:
        run.googleapis.com/memory: "4Gi"
        run.googleapis.com/cpu: "2"
        run.googleapis.com/execution-environment: gen2
        run.googleapis.com/timeout: "300s"
    spec:
      containerConcurrency: 10
      containers:
      - image: gcr.io/PROJECT_ID/puppeteer-glb-renderer
        ports:
        - containerPort: 8080
        env:
        - name: NODE_ENV
          value: "production"
        resources:
          limits:
            memory: "4Gi"
            cpu: "2000m"
```

### **C. Deployment Commands**
```bash
# 1. Build and push container
gcloud builds submit --tag gcr.io/PROJECT_ID/puppeteer-glb-renderer

# 2. Deploy to Cloud Run
gcloud run deploy puppeteer-glb-renderer \
  --image gcr.io/PROJECT_ID/puppeteer-glb-renderer \
  --platform managed \
  --region us-central1 \
  --memory 4Gi \
  --cpu 2 \
  --timeout 300s \
  --max-instances 50 \
  --allow-unauthenticated
```

---

## 🏢 Option 2: GKE Deployment

### **A. Cluster Setup**
```bash
# Create GKE cluster
gcloud container clusters create glb-renderer-cluster \
  --zone us-central1-a \
  --machine-type n1-standard-2 \
  --num-nodes 3 \
  --enable-autoscaling \
  --min-nodes 1 \
  --max-nodes 10
```

### **B. Kubernetes Manifests**
```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: puppeteer-glb-renderer
spec:
  replicas: 3
  selector:
    matchLabels:
      app: puppeteer-glb-renderer
  template:
    metadata:
      labels:
        app: puppeteer-glb-renderer
    spec:
      containers:
      - name: app
        image: gcr.io/PROJECT_ID/puppeteer-glb-renderer
        ports:
        - containerPort: 8080
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
---
apiVersion: v1
kind: Service
metadata:
  name: puppeteer-glb-service
spec:
  selector:
    app: puppeteer-glb-renderer
  ports:
  - port: 80
    targetPort: 8080
  type: LoadBalancer
```

---

## 🖥️ Option 3: Compute Engine VM

### **A. VM Creation**
```bash
# Create VM instance
gcloud compute instances create glb-renderer-vm \
  --zone=us-central1-a \
  --machine-type=n1-standard-4 \
  --boot-disk-size=50GB \
  --boot-disk-type=pd-ssd \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --tags=http-server,https-server
```

### **B. Setup Script**
```bash
#!/bin/bash
# vm-setup.sh

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Chrome
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list
sudo apt update
sudo apt install -y google-chrome-stable

# Install Docker
sudo apt install -y docker.io
sudo systemctl enable docker
sudo usermod -aG docker $USER

# Clone and setup project
git clone YOUR_REPO_URL /opt/glb-renderer
cd /opt/glb-renderer
npm install
```

---

## 💾 Storage Solutions

### **Cloud Storage for GLB Files**
```bash
# Create storage bucket
gsutil mb gs://YOUR-PROJECT-glb-files

# Set public read access (if needed)
gsutil iam ch allUsers:objectViewer gs://YOUR-PROJECT-glb-files
```

### **Storage Integration**
```javascript
// src/storage/gcs-storage.js
const { Storage } = require('@google-cloud/storage');
const storage = new Storage();
const bucket = storage.bucket('YOUR-PROJECT-glb-files');

class GCSStorage {
  async uploadFile(filePath, destination) {
    await bucket.upload(filePath, {
      destination: destination,
      metadata: { cacheControl: 'public, max-age=31536000' }
    });
  }
  
  async downloadFile(fileName, destination) {
    await bucket.file(fileName).download({ destination });
  }
}
```

---

## 🔐 Security & Networking

### **IAM Roles**
```bash
# Create service account
gcloud iam service-accounts create glb-renderer-sa

# Assign roles
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:glb-renderer-sa@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.admin"
```

### **Firewall Rules**
```bash
# Allow HTTP traffic
gcloud compute firewall-rules create allow-glb-renderer \
  --allow tcp:8080 \
  --source-ranges 0.0.0.0/0 \
  --target-tags http-server
```

---

## 📊 Monitoring & Logging

### **Cloud Monitoring Setup**
```yaml
# monitoring.yaml
resources:
- name: glb-renderer-uptime-check
  type: gcp-types/monitoring-v1:projects.uptimeCheckConfigs
  properties:
    displayName: "GLB Renderer Health Check"
    httpCheck:
      path: "/health"
      port: 8080
    monitoredResource:
      type: "uptime_url"
      labels:
        host: "YOUR-DOMAIN.com"
```

---

## 💰 Cost Optimization

### **Cloud Run Optimization**
- Set appropriate **memory/CPU limits**
- Use **min-instances: 0** for cost saving
- Implement **request caching**

### **Storage Optimization**
- Use **Nearline/Coldline** for backup files
- Set **lifecycle policies** for old renders
- Enable **compression** for GLB files

---

## 🚀 CI/CD Pipeline

### **Cloud Build Configuration**
```yaml
# cloudbuild.yaml
steps:
- name: 'gcr.io/cloud-builders/docker'
  args: ['build', '-t', 'gcr.io/$PROJECT_ID/puppeteer-glb-renderer', '.']
- name: 'gcr.io/cloud-builders/docker'
  args: ['push', 'gcr.io/$PROJECT_ID/puppeteer-glb-renderer']
- name: 'gcr.io/cloud-builders/gcloud'
  args:
  - 'run'
  - 'deploy'
  - 'puppeteer-glb-renderer'
  - '--image'
  - 'gcr.io/$PROJECT_ID/puppeteer-glb-renderer'
  - '--region'
  - 'us-central1'
  - '--platform'
  - 'managed'
  - '--allow-unauthenticated'
```

---

## 📈 Scaling Strategies

### **Horizontal Scaling**
- **Cloud Run**: Auto-scales based on requests
- **GKE**: HPA based on CPU/memory
- **VM**: Load balancer + instance groups

### **Performance Optimization**
- **Redis caching** for frequent renders
- **CDN integration** for static assets
- **Database optimization** for job queue

---

## 🎯 Next Steps

1. **Choose deployment option** (Cloud Run recommended)
2. **Setup GCP project** and billing
3. **Prepare Docker image** for production
4. **Configure storage** and networking
5. **Deploy and test** the system
6. **Setup monitoring** and alerts
7. **Optimize for cost** and performance