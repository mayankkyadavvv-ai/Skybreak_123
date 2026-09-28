export function validateEndpoint(value, location = globalThis.location, configured = '') {
  const url = new URL(value);
  if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('Use a WebSocket URL without credentials or a fragment.');
  }
  const localPage = !location || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (!localPage || location?.protocol === 'https:') {
    if (url.protocol !== 'wss:') throw new Error('This page requires a secure wss:// multiplayer server.');
    const sameOrigin = location?.host === url.host;
    const allowed = configured && url.origin === new URL(configured).origin;
    if (!sameOrigin && !allowed) throw new Error('This server is not enabled for this build. Configure VITE_SKYBREAK_WS_URL and rebuild.');
  }
  return url.href;
}
