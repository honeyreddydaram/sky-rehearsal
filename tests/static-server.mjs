// Minimal static file server for the Playwright smoke test — avoids depending on
// Python or an extra npm package just to serve a few static files over HTTP.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname, join} from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:');
const port = Number(process.env.PORT) || 4173;

const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.gltf': 'model/gltf+json',
};

createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  if (path.includes('..')) {
    res.writeHead(400).end();
    return;
  }
  const filePath = join(root, path === '/' ? 'index.html' : path);
  try {
    const body = await readFile(filePath);
    res.writeHead(200, {'content-type': types[extname(filePath)] || 'application/octet-stream'});
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`static-server listening on http://localhost:${port}`));
