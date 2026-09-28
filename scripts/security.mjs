import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { site } from '../site.config.js';

export function securityHeaders(wsUrl = '') {
  const connections = ["'self'", site.origin.replace('https:', 'wss:')];
  if (wsUrl) {
    const url = new URL(wsUrl);
    if (url.protocol !== 'wss:' || url.username || url.password) throw new Error('Production multiplayer needs a public wss:// endpoint without credentials.');
    connections.push(url.origin);
  }
  return {
    'Content-Security-Policy': `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src ${[...new Set(connections)].join(' ')}; media-src 'self' blob: data:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'self'`,
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Permissions-Policy': 'camera=(), microphone=(self), geolocation=(), payment=(), usb=(), gamepad=(self), fullscreen=(self)',
  };
}

export function configureHeaders(wsUrl) {
  const headers = securityHeaders(wsUrl);
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
  config.headers = [
    { source: '/(.*)', headers: Object.entries({...headers,'Cache-Control':'public, max-age=0, must-revalidate'}).map(([key, value]) => ({ key, value })) },
    { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
  ];
  config.cleanUrls = true;
  writeFileSync('vercel.json', JSON.stringify(config, null, 2) + '\n');
  writeFileSync('public/_headers', '/*\n  Cache-Control: public, max-age=0, must-revalidate\n' + Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`).join('\n') + '\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n');
  writeFileSync('netlify.toml',`[build]
  publish = "dist"
  command = "npm run build"

# Security and cache headers are generated in public/_headers.
`);
  console.log('Configured explicit production security headers. Host TLS/redirect/HSTS must be verified after deployment.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) configureHeaders(process.env.VITE_SKYBREAK_WS_URL || '');
