# Use Node.js 18 on Ubuntu (CPU-based for better compatibility)
FROM node:18-bullseye-slim

# Install system dependencies for Three.js headless rendering and Puppeteer
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    gnupg \
    build-essential \
    python3 \
    python3-pip \
    pkg-config \
    libxi6 \
    libgconf-2-4 \
    libxss1 \
    libxtst6 \
    libxrandr2 \
    libasound2 \
    libpangocairo-1.0-0 \
    libatk1.0-0 \
    libcairo-gobject2 \
    libgtk-3-0 \
    libgdk-pixbuf2.0-0 \
    xvfb \
    mesa-utils \
    libgl1-mesa-dri \
    # Puppeteer dependencies
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    libxss1 \
    libgbm1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy application code
COPY server.js ./
COPY src/ ./src/

# Create required directories
RUN mkdir -p uploads rendered temp

# Set display for headless rendering
ENV DISPLAY=:99

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Start command
CMD ["node", "server.js"]