const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const axios = require('axios');
const os = require('os');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// WebSocket setup with path for cPanel compatibility
const wss = new WebSocket.Server({ server }); // Allow connection on any path (handled by Nginx/proxy)

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============ JSON File Storage (no native deps needed) ============
const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading data:', e);
  }
  return { serviceChecks: [], logs: [], alerts: [] };
}

function saveData(data) {
  try {
    // Keep only last 1000 entries of each type to prevent file bloat
    data.serviceChecks = data.serviceChecks.slice(-1000);
    data.logs = data.logs.slice(-500);
    data.alerts = data.alerts.slice(-100);
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error saving data:', e);
  }
}

let storage = loadData();

// Auto-save every 5 minutes
setInterval(() => saveData(storage), 300000);

// ============ Services Configuration ============
const services = [
  {
    id: 1,
    name: 'GitHub API',
    url: 'https://api.github.com/zen',
    type: 'external',
    rateLimit: { maxPerHour: 60 }
  },
  {
    id: 2,
    name: 'Google DNS',
    url: 'https://dns.google',
    type: 'external',
    rateLimit: { maxPerHour: 120 }
  },
  {
    id: 3,
    name: 'Personal Website',
    url: 'https://yourdomain.com',
    type: 'external',
    rateLimit: { maxPerHour: 60 }
  },
  { id: 4, name: 'API Gateway', url: null, type: 'simulated' },
  { id: 5, name: 'Database Primary', url: null, type: 'simulated' },
  { id: 6, name: 'Cache Server', url: null, type: 'simulated' }
];

// Rate limiting tracker
const rateLimitTracker = new Map();

function canMakeRequest(service) {
  if (service.type !== 'external' || !service.rateLimit) return true;

  const now = Date.now();
  const key = service.id;

  if (!rateLimitTracker.has(key)) {
    rateLimitTracker.set(key, []);
  }

  const requests = rateLimitTracker.get(key);
  const oneHourAgo = now - 3600000;
  const recentRequests = requests.filter(time => time > oneHourAgo);
  rateLimitTracker.set(key, recentRequests);

  return recentRequests.length < service.rateLimit.maxPerHour;
}

function recordRequest(service) {
  if (service.type !== 'external') return;
  const key = service.id;
  if (!rateLimitTracker.has(key)) rateLimitTracker.set(key, []);
  rateLimitTracker.get(key).push(Date.now());
}

// Current service states
let serviceStates = services.map(s => ({
  ...s,
  status: 'healthy',
  uptime: 99.9,
  responseTime: 0,
  lastCheck: new Date().toISOString()
}));

// ============ Monitoring Functions ============
async function checkService(service) {
  const startTime = Date.now();
  let status = 'healthy';
  let responseTime = 0;

  try {
    if (service.type === 'external') {
      if (!canMakeRequest(service)) {
        const existing = serviceStates.find(s => s.id === service.id);
        return { service, status: existing?.status || 'healthy', responseTime: existing?.responseTime || 0, cached: true };
      }

      recordRequest(service);

      const response = await axios.get(service.url, {
        timeout: 10000,
        validateStatus: (s) => s < 500,
        headers: { 'User-Agent': 'HealthMonitor/1.0 (portfolio-demo)' },
        maxRedirects: 5
      });
      responseTime = Date.now() - startTime;

      if (response.status >= 400) status = 'warning';
      await new Promise(resolve => setTimeout(resolve, 100));

    } else {
      // Simulated services
      responseTime = Math.floor(Math.random() * 200) + 10;
      const rand = Math.random();
      if (rand > 0.95) status = 'down';
      else if (rand > 0.85) status = 'warning';
    }

    if (responseTime > 1000) status = 'warning';

  } catch (error) {
    status = 'down';
    responseTime = 0;
    addLog('error', service.name, `Connection failed: ${error.message}`);
  }

  // Save check
  storage.serviceChecks.push({
    serviceId: service.id,
    serviceName: service.name,
    status,
    responseTime,
    timestamp: new Date().toISOString()
  });

  // Update state
  const idx = serviceStates.findIndex(s => s.id === service.id);
  const previousStatus = serviceStates[idx].status;

  serviceStates[idx] = {
    ...serviceStates[idx],
    status,
    responseTime,
    lastCheck: new Date().toISOString()
  };

  // Create alert on status change
  if (previousStatus === 'healthy' && status !== 'healthy') {
    createAlert(
      status === 'down' ? 'critical' : 'warning',
      service.name,
      status === 'down' ? 'Service is DOWN' : 'Service performance degraded'
    );
  }

  if (previousStatus !== 'healthy' && status === 'healthy') {
    addLog('info', service.name, 'Service recovered');
  }

  return { service, status, responseTime };
}

function addLog(level, service, message) {
  const log = {
    id: Date.now(),
    level,
    service,
    message,
    timestamp: new Date().toISOString()
  };
  storage.logs.unshift(log);
  broadcastUpdate({ type: 'log', data: log });
}

function createAlert(severity, service, message) {
  const alert = {
    id: Date.now(),
    severity,
    service,
    message,
    resolved: false,
    timestamp: new Date().toISOString()
  };
  storage.alerts.unshift(alert);
  broadcastUpdate({ type: 'alert', data: alert });
}

function getSystemMetrics() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  return {
    cpu: Math.floor(Math.random() * 40) + 20,
    memory: Math.floor(((totalMem - freeMem) / totalMem) * 100),
    disk: Math.floor(Math.random() * 30) + 40,
    network: Math.floor(Math.random() * 300) + 100
  };
}

function calculateUptime(serviceId) {
  const now = Date.now();
  const dayAgo = now - 86400000;
  const checks = storage.serviceChecks.filter(c =>
    c.serviceId === serviceId && new Date(c.timestamp).getTime() > dayAgo
  );

  if (checks.length === 0) return 99.9;
  const healthy = checks.filter(c => c.status === 'healthy').length;
  return (healthy / checks.length) * 100;
}

// ============ WebSocket ============
function broadcastUpdate(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  ws.send(JSON.stringify({ type: 'services', data: serviceStates }));
  ws.send(JSON.stringify({ type: 'metrics', data: getSystemMetrics() }));

  ws.on('close', () => console.log('WebSocket client disconnected'));
  ws.on('error', (err) => console.error('WebSocket error:', err));
});

// ============ Monitoring Loop ============
async function monitorAllServices() {
  for (let i = 0; i < services.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 500));
    await checkService(services[i]);
  }

  // Update uptimes
  for (let i = 0; i < serviceStates.length; i++) {
    serviceStates[i].uptime = calculateUptime(serviceStates[i].id);
  }

  broadcastUpdate({ type: 'services', data: serviceStates });
  broadcastUpdate({ type: 'metrics', data: getSystemMetrics() });

  // Save data periodically
  saveData(storage);
}

// ============ API Routes ============
app.get('/api/services', (req, res) => {
  res.json(serviceStates);
});

app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(storage.logs.slice(0, limit));
});

app.get('/api/alerts', (req, res) => {
  res.json(storage.alerts.filter(a => !a.resolved));
});

app.post('/api/alerts/:id/resolve', (req, res) => {
  const id = parseInt(req.params.id);
  const alert = storage.alerts.find(a => a.id === id);
  if (alert) {
    alert.resolved = true;
    saveData(storage);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Alert not found' });
  }
});

app.get('/api/history/:serviceId', (req, res) => {
  const serviceId = parseInt(req.params.serviceId);
  const hours = parseInt(req.query.hours) || 24;
  const cutoff = Date.now() - (hours * 3600000);

  const history = storage.serviceChecks.filter(c =>
    c.serviceId === serviceId && new Date(c.timestamp).getTime() > cutoff
  );
  res.json(history);
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============ Start Server ============
const CHECK_INTERVAL = 5000; // 5 seconds
setInterval(monitorAllServices, CHECK_INTERVAL);
monitorAllServices();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Health Monitor running on port ${PORT}`);
  console.log(`WebSocket available at /ws`);
  console.log(`Checking services every ${CHECK_INTERVAL / 1000} seconds`);
  addLog('info', 'System', 'Monitoring service started');
});
