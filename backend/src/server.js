import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PUBLIC_DIR = normalize(join(__dirname, '..', '..', 'frontend', 'public'));
const PORT = Number(process.env.PORT) || 3000;

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function sendFile(res, filePath) {
  const extension = extname(filePath).toLowerCase();
  const type = MIME_TYPES[extension] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  createReadStream(filePath).pipe(res);
}

function getSafePath(urlPath) {
  const cleanPath = urlPath === '/' ? '/index.html' : urlPath;
  const fullPath = normalize(join(PUBLIC_DIR, cleanPath));
  if (!fullPath.startsWith(PUBLIC_DIR)) return null;
  return fullPath;
}

createServer((req, res) => {
  const requestedPath = getSafePath(req.url || '/');
  if (!requestedPath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  const filePath = existsSync(requestedPath) && statSync(requestedPath).isFile()
    ? requestedPath
    : join(PUBLIC_DIR, 'index.html');

  sendFile(res, filePath);
}).listen(PORT, () => {
  console.log(`Panchayat app running at http://localhost:${PORT}`);
});
