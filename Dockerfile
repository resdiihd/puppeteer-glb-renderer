# Multi-stage Docker build for GLB Renderer with Nginx
FROM node:18-alpine AS node-builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install Node.js dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source
COPY src/ ./src/

# Create storage directories
RUN mkdir -p storage/uploads storage/renders

FROM nginx:alpine AS production

# Install Node.js in Nginx container
    # Install Node.js and SSL tools
    RUN apk add --no-cache \
        nodejs \
        npm \
        chromium \
        nss \
        freetype \
        freetype-dev \
        harfbuzz \
        ca-certificates \
        ttf-freefont \
        curl \
        bash \
        openssl \
        certbot \
        py3-pip \
        python3-dev \
        gcc \
        musl-dev \
        libffi-dev \
        cronie \
        && python3 -m venv /opt/certbot \
        && /opt/certbot/bin/pip install certbot-dns-cloudflare \
        && ln -s /opt/certbot/bin/certbot /usr/local/bin/certbot-dns-cloudflare

    # Create app directory
    WORKDIR /app

# Copy Node.js application from builder stage
COPY --from=node-builder /app /app

# Copy Nginx configurations
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/default.conf /etc/nginx/conf.d/default.conf
COPY docker/ssl.conf /app/docker/ssl.conf

# Create nginx user and set permissions (nginx user already exists in alpine image)
RUN chown -R nginx:nginx /app/storage /var/cache/nginx /var/log/nginx || true
RUN chmod -R 755 /app/storage

# Install PM2 globally for process management
RUN npm install -g pm2

# Copy PM2 ecosystem and SSL setup
COPY docker/ecosystem.config.js /app/docker/
COPY docker/ssl-setup.sh /app/docker/

# Copy startup script
COPY docker/start.sh /app/docker/start.sh
RUN chmod +x /app/docker/start.sh

# Set Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Expose ports
EXPOSE 80 443

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

# Start services
CMD ["/app/docker/start.sh"]