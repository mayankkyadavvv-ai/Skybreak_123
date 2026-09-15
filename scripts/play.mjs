import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.woff2':'font/woff2'};
const server = http.createServer(async (req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root)) {res.writeHead(403);res.end();return;}
    const body = await readFile(file);
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options':'nosniff'});
    res.end(body);
  } catch {res.writeHead(404);res.end('File not found. Rebuild with npm run build if dist is missing.');}
});
server.on('error', error => {console.error('Cannot start game:',error.message,'Close another running Skybreak window and retry.');process.exitCode=1;});
server.listen(4173,'127.0.0.1',()=>{
  console.log('Skybreak: http://127.0.0.1:4173\nKeep this terminal open. Ctrl+C stops the game.');
  if(process.platform==='win32') {
    const browser = spawn('cmd.exe',['/c','start','','http://127.0.0.1:4173'],{stdio:'ignore'});
    browser.on('error',()=>console.log('Open the address above in your browser.'));
  }
});
