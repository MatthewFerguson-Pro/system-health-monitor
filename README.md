# System Health Monitor

A real-time system health monitoring dashboard built with Node.js and React. This application provides live metrics for server performance, service availability, and system alerts using WebSockets for instant updates.

## 🚀 Live Demo
**[monitor.yourdomain.com](https://monitor.yourdomain.com)**

## ✨ Features
*   **Real-time Monitoring**: Live updates for CPU, Memory, Disk, and Network usage.
*   **Service Health Checks**: Monitors external APIs (GitHub, Google, etc.) and internal simulated services.
*   **WebSocket Connection**: Instant data push from server to client.
*   **Response Time Tracking**: Visual history of service latency.
*   **Rate Limiting**: Intelligent backend that respects external API limits.
*   **Responsive Design**: Built with Tailwind CSS for mobile and desktop.

## 🛠️ Tech Stack
*   **Backend**: Node.js, Express, `ws` (WebSocket)
*   **Frontend**: React (served via CDN for zero-build simplicity), Tailwind CSS
*   **Deployment**: Optimized for cPanel/Shared Hosting (Passenger) and VPS.

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/Your Name-Pro/health-monitor.git

# Install dependencies
npm install

# Start the server
npm start
```

The server runs on port `3000` by default.

## 🌍 Deployment
This project includes specific optimizations for subpath and subdomain deployments.
See `DEPLOYMENT.md` for detailed instructions on setting this up on a VPS or Namecheap Shared Hosting.

## 📝 License
MIT
