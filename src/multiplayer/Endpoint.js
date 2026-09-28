export function validateEndpoint(value, location = globalThis.location, configured = '') {
  const url = new URL(value);
  if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('Use a WebSocket URL without credentials or a fragment.');
  }
  const privateHost = host => /^(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(host || '');
  const sameLan = location?.protocol === 'http:' && privateHost(location.hostname) && url.hostname === location.hostname && url.port === (location.port || '');
  const localPage = !location || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || sameLan;
  if (!localPage || location?.protocol === 'https:') {
    if (url.protocol !== 'wss:') throw new Error('This page requires a secure wss:// multiplayer server.');
    const sameOrigin = location?.host === url.host;
    const allowed = configured && url.origin === new URL(configured).origin;
    if (!sameOrigin && !allowed) throw new Error('This server is not enabled for this build. Configure VITE_SKYBREAK_WS_URL and rebuild.');
  }
  return url.href;
}
