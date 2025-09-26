#!/bin/bash

# SSL Certificate Management with Cloudflare
# Domain and API configuration
DOMAIN=${DOMAIN:-"3d.itsoa.io.vn"}
CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN:-""}
ACME_EMAIL=${ACME_EMAIL:-"admin@itsoa.io.vn"}

# Paths
SSL_DIR="/etc/ssl"
CERT_DIR="${SSL_DIR}/certs"
KEY_DIR="${SSL_DIR}/private"
ACME_DIR="/acme"

# Create directories
mkdir -p "$CERT_DIR" "$KEY_DIR" "$ACME_DIR"

echo "🔐 Starting SSL certificate setup for $DOMAIN..."

# Function to generate self-signed certificate (fallback)
generate_self_signed() {
    echo "📝 Generating self-signed certificate for development..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "${KEY_DIR}/${DOMAIN}.key" \
        -out "${CERT_DIR}/${DOMAIN}.crt" \
        -subj "/C=VN/ST=HCM/L=HCM/O=ITSOA/CN=${DOMAIN}"
}

# Function to get Let's Encrypt certificate with Cloudflare DNS
get_letsencrypt_cert() {
    if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
        echo "❌ No Cloudflare API token provided, using self-signed certificate"
        generate_self_signed
        return
    fi
    
    echo "🌐 Requesting Let's Encrypt certificate via Cloudflare DNS..."
    
    # Install certbot and cloudflare plugin
    apk add --no-cache certbot py3-pip
    pip3 install certbot-dns-cloudflare
    
    # Create Cloudflare credentials file
    cat > /tmp/cloudflare.ini << EOF
dns_cloudflare_api_token = ${CLOUDFLARE_API_TOKEN}
EOF
    chmod 600 /tmp/cloudflare.ini
    
    # Request certificate
    certbot certonly \
        --dns-cloudflare \
        --dns-cloudflare-credentials /tmp/cloudflare.ini \
        --dns-cloudflare-propagation-seconds 60 \
        --email "$ACME_EMAIL" \
        --agree-tos \
        --non-interactive \
        --expand \
        --domain "$DOMAIN" \
        --cert-path "${CERT_DIR}/${DOMAIN}.crt" \
        --key-path "${KEY_DIR}/${DOMAIN}.key"
    
    if [ $? -eq 0 ]; then
        echo "✅ Successfully obtained Let's Encrypt certificate!"
        # Copy certificates to our structure
        cp "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" "${CERT_DIR}/${DOMAIN}.crt"
        cp "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" "${KEY_DIR}/${DOMAIN}.key"
        
        # Set proper permissions
        chmod 644 "${CERT_DIR}/${DOMAIN}.crt"
        chmod 600 "${KEY_DIR}/${DOMAIN}.key"
        
        # Setup auto-renewal
        echo "0 12 * * * certbot renew --quiet && nginx -s reload" | crontab -
    else
        echo "❌ Failed to obtain Let's Encrypt certificate, using self-signed"
        generate_self_signed
    fi
    
    # Cleanup
    rm -f /tmp/cloudflare.ini
}

# Check if certificates already exist
if [ -f "${CERT_DIR}/${DOMAIN}.crt" ] && [ -f "${KEY_DIR}/${DOMAIN}.key" ]; then
    echo "✅ SSL certificates already exist"
    
    # Check if certificate is about to expire (less than 30 days)
    if openssl x509 -checkend 2592000 -noout -in "${CERT_DIR}/${DOMAIN}.crt" >/dev/null 2>&1; then
        echo "📄 Certificate is valid for more than 30 days"
        exit 0
    else
        echo "⚠️  Certificate expires within 30 days, renewing..."
        get_letsencrypt_cert
    fi
else
    echo "🆕 No existing certificates found, generating new ones..."
    get_letsencrypt_cert
fi

# Test Nginx configuration
echo "🧪 Testing Nginx configuration..."
nginx -t

if [ $? -eq 0 ]; then
    echo "✅ SSL setup completed successfully!"
else
    echo "❌ Nginx configuration test failed!"
    exit 1
fi