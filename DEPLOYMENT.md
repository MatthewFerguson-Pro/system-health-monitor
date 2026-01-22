# System Health Monitor - Deployment Guide

## Target Environment
- **VPS:** RackNerd 1GB KVM VPS
- **OS:** Ubuntu 24.04 64-bit
- **IP:** YOUR_SERVER_IP
- **Domain:** monitor.yourdomain.com

---

## Step 1: Initial VPS Setup

### 1.1 Connect to your VPS via SSH
```bash
ssh root@YOUR_SERVER_IP
```

### 1.2 Update the system
```bash
apt update && apt upgrade -y
```

### 1.3 Create a non-root user (recommended)
```bash
adduser your_username
usermod -aG sudo your_username
```

### 1.4 Set up basic firewall
```bash
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable
```

---

## Step 2: Install Node.js

### 2.1 Install Node.js 20 LTS
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt install -y nodejs
```

### 2.2 Verify installation
```bash
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

### 2.3 Install build essentials (needed for better-sqlite3)
```bash
apt install -y build-essential python3
```

---

## Step 3: Install PM2 (Process Manager)

```bash
npm install -g pm2
```

---

## Step 4: Deploy the Application

### 4.1 Create app directory
```bash
mkdir -p /var/www/health-monitor
cd /var/www/health-monitor
```

### 4.2 Create the project files

**Create package.json:**
```bash
cat > package.json << 'EOF'
{
  "name": "health-monitor-dashboard",
  "version": "1.0.0",
  "description": "Real-time system health monitoring dashboard",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node server.js"
  },
  "author": "Your Name",
  "license": "MIT",
  "dependencies": {
    "express": "^4.18.2",
    "ws": "^8.16.0",
    "better-sqlite3": "^9.4.3",
    "node-fetch": "^2.7.0",
    "cors": "^2.8.5"
  }
}
EOF
```

**Create server.js:**
Upload or copy the server.js file to /var/www/health-monitor/server.js

**Create public directory and index.html:**
```bash
mkdir -p public data
```
Upload or copy the public/index.html file to /var/www/health-monitor/public/index.html

### 4.3 Install dependencies
```bash
cd /var/www/health-monitor
npm install
```

### 4.4 Test the application
```bash
node server.js
```
You should see: "Health Monitor started on port 3000"
Press Ctrl+C to stop.

### 4.5 Start with PM2
```bash
pm2 start server.js --name health-monitor
pm2 save
pm2 startup
```
Follow the command output to enable PM2 on system boot.

### 4.6 Verify PM2 is running
```bash
pm2 status
pm2 logs health-monitor
```

---

## Step 5: Install and Configure Nginx

### 5.1 Install Nginx
```bash
apt install -y nginx
```

### 5.2 Create Nginx configuration
```bash
cat > /etc/nginx/sites-available/health-monitor << 'EOF'
server {
    listen 80;
    server_name monitor.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
}
EOF
```

### 5.3 Enable the site
```bash
ln -s /etc/nginx/sites-available/health-monitor /etc/nginx/sites-enabled/
nginx -t  # Test configuration
systemctl restart nginx
```

---

## Step 6: Configure DNS (Namecheap)

### 6.1 Log into Namecheap
1. Go to Domain List > yourdomain.com > Manage
2. Click "Advanced DNS"

### 6.2 Add A Record for subdomain
| Type | Host | Value | TTL |
|------|------|-------|-----|
| A Record | monitor | YOUR_SERVER_IP | Automatic |

### 6.3 Wait for DNS propagation
This can take 5-30 minutes. Test with:
```bash
dig monitor.yourdomain.com
```
or
```bash
nslookup monitor.yourdomain.com
```

---

## Step 7: Install SSL Certificate (Let's Encrypt)

### 7.1 Install Certbot
```bash
apt install -y certbot python3-certbot-nginx
```

### 7.2 Obtain SSL certificate
```bash
certbot --nginx -d monitor.yourdomain.com
```

Follow the prompts:
- Enter your email for renewal notices
- Agree to terms
- Choose whether to redirect HTTP to HTTPS (recommended: Yes)

### 7.3 Verify auto-renewal
```bash
certbot renew --dry-run
```

### 7.4 Your Nginx config will now look like this (auto-updated by Certbot):
```nginx
server {
    server_name monitor.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/monitor.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/monitor.yourdomain.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    if ($host = monitor.yourdomain.com) {
        return 301 https://$host$request_uri;
    }
    listen 80;
    server_name monitor.yourdomain.com;
    return 404;
}
```

---

## Step 8: Final Verification

### 8.1 Check all services are running
```bash
pm2 status
systemctl status nginx
```

### 8.2 Test in browser
Visit: https://monitor.yourdomain.com

You should see:
- Dashboard loading
- "Live" indicator in green
- Services being monitored
- Real-time logs appearing

---

## Maintenance Commands

### View application logs
```bash
pm2 logs health-monitor
pm2 logs health-monitor --lines 100
```

### Restart the application
```bash
pm2 restart health-monitor
```

### Stop/Start the application
```bash
pm2 stop health-monitor
pm2 start health-monitor
```

### View PM2 monitoring dashboard
```bash
pm2 monit
```

### Update the application
```bash
cd /var/www/health-monitor
# Make your changes or upload new files
pm2 restart health-monitor
```

### Check disk space (database will grow over time)
```bash
df -h
du -sh /var/www/health-monitor/data/
```

### Manual database cleanup (if needed)
```bash
cd /var/www/health-monitor
sqlite3 data/monitor.db "DELETE FROM metrics WHERE timestamp < datetime('now', '-30 days');"
sqlite3 data/monitor.db "DELETE FROM logs WHERE timestamp < datetime('now', '-30 days');"
sqlite3 data/monitor.db "VACUUM;"
```

---

## Troubleshooting

### Application won't start
```bash
cd /var/www/health-monitor
node server.js  # Run directly to see errors
```

### WebSocket not connecting
- Check Nginx config has WebSocket headers
- Check browser console for errors
- Ensure port 3000 is only accessible via Nginx

### SSL certificate issues
```bash
certbot certificates  # Check certificate status
certbot renew --force-renewal  # Force renewal if needed
```

### High memory usage
With 1GB RAM, the app should use ~100-150MB. If higher:
```bash
pm2 restart health-monitor
```

### Permission issues
```bash
chown -R www-data:www-data /var/www/health-monitor
chmod -R 755 /var/www/health-monitor
```

---

## Quick Reference

| What | Command |
|------|---------|
| SSH to server | `ssh root@YOUR_SERVER_IP` |
| App directory | `/var/www/health-monitor` |
| View logs | `pm2 logs health-monitor` |
| Restart app | `pm2 restart health-monitor` |
| Restart Nginx | `systemctl restart nginx` |
| Test Nginx config | `nginx -t` |
| Renew SSL | `certbot renew` |
| Database location | `/var/www/health-monitor/data/monitor.db` |

---

## Security Notes

1. **Change root password** if you haven't already
2. **Set up SSH keys** and disable password authentication
3. **Keep system updated**: `apt update && apt upgrade`
4. **Monitor logs** for suspicious activity
5. **The app includes rate limiting** (100 requests/minute per IP)

---

## Done!

Your System Health Monitor should now be live at:
**https://monitor.yourdomain.com**

Update your portfolio website's project link to point to this URL!
