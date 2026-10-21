/**
 * server.js — Isomer local dev server
 *
 * Serves the app with the COOP + COEP headers required for SharedArrayBuffer
 * (needed by multi-threaded FFmpeg.wasm).
 *
 *   node server.js          → http://localhost:8765
 *   node server.js 3000     → http://localhost:3000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.argv[2] || '8765', 10);
const ROOT = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.wasm': 'application/wasm',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
};

const server = http.createServer((req, res) => {
    // Security headers required for SharedArrayBuffer / WASM threads
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    // Resolve the requested file path
    let urlPath = req.url.split('?')[0]; // strip query string
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.join(ROOT, urlPath);

    // Security: prevent directory traversal
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found: ' + urlPath);
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('500 Internal Server Error');
            }
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const mime = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log('\n  ╔══════════════════════════════════════╗');
    console.log('  ║        Isomer — Local Server         ║');
    console.log('  ╚══════════════════════════════════════╝');
    console.log(`\n  ✓  Listening on http://localhost:${PORT}`);
    console.log('  ✓  COOP / COEP headers: enabled');
    console.log('  ✓  SharedArrayBuffer:   available');
    console.log('\n  Press Ctrl+C to stop.\n');
});
