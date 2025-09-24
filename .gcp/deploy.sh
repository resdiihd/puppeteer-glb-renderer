#!/bin/bash

# 🚀 Google Cloud Deployment Script
# Deploy Puppeteer GLB Renderer to Cloud Run

set -e  # Exit on any error

# Configuration
PROJECT_ID="your-gcp-project-id"
SERVICE_NAME="puppeteer-glb-renderer"
REGION="us-central1"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "🚀 Starting deployment to Google Cloud Run..."
echo "Project: ${PROJECT_ID}"
echo "Service: ${SERVICE_NAME}"
echo "Region: ${REGION}"

# Step 1: Authenticate and set project
echo "🔐 Authenticating with Google Cloud..."
gcloud auth login
gcloud config set project ${PROJECT_ID}

# Step 2: Enable required APIs
echo "🔧 Enabling required Google Cloud APIs..."
gcloud services enable \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    containerregistry.googleapis.com \
    storage-api.googleapis.com

# Step 3: Build and submit container
echo "🏗️ Building and pushing Docker image..."
gcloud builds submit \
    --config=.gcp/cloudbuild.yaml \
    --substitutions=_SERVICE_NAME=${SERVICE_NAME}

# Step 4: Deploy to Cloud Run
echo "☁️ Deploying to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
    --image ${IMAGE_NAME}:latest \
    --platform managed \
    --region ${REGION} \
    --memory 4Gi \
    --cpu 2 \
    --timeout 300s \
    --max-instances 50 \
    --min-instances 0 \
    --concurrency 10 \
    --allow-unauthenticated \
    --set-env-vars NODE_ENV=production,PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome

# Step 5: Get service URL
echo "✅ Deployment completed!"
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --platform managed --region ${REGION} --format 'value(status.url)')
echo "🌐 Service URL: ${SERVICE_URL}"
echo "📖 API Docs: ${SERVICE_URL}"
echo "🎨 GLB Viewer: ${SERVICE_URL}/viewer"
echo "💾 Storage: ${SERVICE_URL}/storage"

# Step 6: Test health endpoint
echo "🩺 Testing health endpoint..."
curl -f "${SERVICE_URL}/health" && echo "✅ Health check passed!" || echo "❌ Health check failed!"

echo "🎉 Deployment script completed!"
echo ""
echo "📋 Next steps:"
echo "1. Upload GLB files to ${SERVICE_URL}/storage"
echo "2. Test rendering via ${SERVICE_URL}/api/render"
echo "3. Monitor logs: gcloud run logs tail ${SERVICE_NAME} --region ${REGION}"
echo "4. Scale if needed: gcloud run services update ${SERVICE_NAME} --max-instances 100"