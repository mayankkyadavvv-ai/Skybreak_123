import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEndpoint } from '../src/multiplayer/Endpoint.js';
import { securityHeaders } from '../scripts/security.mjs';
const location = { protocol: 'https:', host: 'skybreak-iota.vercel.app', hostname: 'skybreak-iota.vercel.app' };
test('production rejects insecure, credential-bearing and unconfigured stored WebSocket endpoints', () => {
  for (const value of ['ws://skybreak-iota.vercel.app', 'wss://user:pass@skybreak-iota.vercel.app', 'https://skybreak-iota.vercel.app', 'wss://unconfigured.test']) assert.throws(() => validateEndpoint(value, location));
  assert.equal(validateEndpoint('wss://skybreak-iota.vercel.app', location), 'wss://skybreak-iota.vercel.app/');
  assert.equal(validateEndpoint('wss://multiplayer.test/game', location, 'wss://multiplayer.test'), 'wss://multiplayer.test/game');
  assert.equal(validateEndpoint('ws://localhost:8080', {protocol:'http:',hostname:'localhost'}), 'ws://localhost:8080/');
});
test('CSP allows exactly the configured secure multiplayer origin and forbids inline scripts', () => {
  const csp = securityHeaders('wss://multiplayer.test/game')['Content-Security-Policy'];
  assert.match(csp, /connect-src 'self' wss:\/\/skybreak-iota.vercel.app wss:\/\/multiplayer.test;/);
  assert.match(csp, /script-src 'self';/);
  assert.throws(() => securityHeaders('ws://multiplayer.test'));
});
