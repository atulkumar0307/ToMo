// Serves the ToMo admin build and proxies API/media requests to the backend.
const http = require('http');
const path = require('path');
const express = require('../node_modules/express');

const PORT = process.env.ADMIN_PORT || 6634;
const API_PORT = process.env.API_PORT || 6633;
const BUILD_DIR = path.join(__dirname, 'build');
const PROXY_PREFIXES = ['/api', '/uploads', '/socket.io', '/health'];

const app = express();

app.use((req, res, next) => {
  if (!PROXY_PREFIXES.some((p) => req.url === p || req.url.startsWith(p + '/') || req.url.startsWith(p + '?'))) {
    return next();
  }
  const upstream = http.request(
    { host: '127.0.0.1', port: API_PORT, method: req.method, path: req.url, headers: req.headers },
    (apiRes) => {
      res.writeHead(apiRes.statusCode, apiRes.headers);
      apiRes.pipe(res);
    }
  );
  upstream.on('error', (err) => {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) res.status(502).json({ success: false, message: 'API unavailable' });
  });
  req.pipe(upstream);
});

app.use(express.static(BUILD_DIR));
app.use((req, res) => res.sendFile(path.join(BUILD_DIR, 'index.html')));

const server = app.listen(PORT, () => {
  console.log(`ToMo admin running on port ${PORT} (API -> ${API_PORT})`);
});

// Forward websocket upgrades (realtime) to the API.
server.on('upgrade', (req, socket, head) => {
  const upstream = http.request({ host: '127.0.0.1', port: API_PORT, path: req.url, headers: req.headers });
  upstream.on('upgrade', (apiRes, apiSocket, apiHead) => {
    const headers = Object.entries(apiRes.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n${headers}\r\n\r\n`);
    if (apiHead && apiHead.length) socket.write(apiHead);
    if (head && head.length) apiSocket.write(head);
    apiSocket.pipe(socket).pipe(apiSocket);
  });
  upstream.on('error', () => socket.destroy());
  upstream.end();
});
