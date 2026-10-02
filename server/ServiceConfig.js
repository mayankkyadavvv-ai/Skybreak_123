// Validate the public worker before binding a port. Never include secret values in errors.
export function readServiceConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const fail = message => { throw new Error(`Match worker configuration: ${message}`); };
  const list = key => String(env[key] || '').split(',').map(s => s.trim()).filter(Boolean);
  const origins = list('SKYBREAK_ALLOWED_ORIGINS').map(value => {
    let url;
    try { url = new URL(value); } catch { fail('SKYBREAK_ALLOWED_ORIGINS contains an invalid origin'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.hostname.includes('*') || production && url.protocol !== 'https:') fail('SKYBREAK_ALLOWED_ORIGINS needs exact HTTPS origins in production, without paths or wildcards');
    return url.origin;
  });
  if (production && !origins.length) fail('SKYBREAK_ALLOWED_ORIGINS is required in production');
  const integer = (key, fallback, max) => {
    if (env[key] === undefined || env[key] === '') return fallback;
    const n = Number(env[key]);
    if (!Number.isInteger(n) || n < 1 || n > max) fail(`${key} must be an integer from 1 to ${max}`);
    return n;
  };
  const ice = (key, schemes) => list(key).map(value => {
    const match = /^(stuns?|turns?):(?:([a-zA-Z0-9.-]+)|\[([a-fA-F0-9:]+)\])(?::([0-9]+))?(?:\?transport=(udp|tcp))?$/.exec(value);
    if (!match || !schemes.includes(match[1]) || match[4] && (+match[4] < 1 || +match[4] > 65535) || match[1] === 'turns' && match[5] === 'udp') fail(`${key} contains an invalid ICE URL`);
    return value;
  });
  const stun = ice('SKYBREAK_STUN_URLS', ['stun', 'stuns']);
  const turn = ice('SKYBREAK_TURN_URLS', ['turn', 'turns']);
  const secret = String(env.SKYBREAK_TURN_SECRET || '');
  if (!!turn.length !== !!secret) fail('SKYBREAK_TURN_URLS and SKYBREAK_TURN_SECRET must be configured together');
  if (production && secret && secret.length < 32) fail('SKYBREAK_TURN_SECRET must contain at least 32 characters');
  const revision = String(env.SKYBREAK_DEPLOY_REVISION || '');
  if (revision && !/^[a-f0-9]{40}$/.test(revision)) fail('SKYBREAK_DEPLOY_REVISION must be the full Git commit SHA');
  return {
    env: { ...env, SKYBREAK_ALLOWED_ORIGINS: [...new Set(origins)].join(','), SKYBREAK_STUN_URLS: stun.join(','), SKYBREAK_TURN_URLS: turn.join(',') },
    port: integer('PORT', 8080, 65535),
    maxClients: integer('SKYBREAK_MAX_CLIENTS', production ? 8 : 32, 256),
    maxRooms: integer('SKYBREAK_MAX_ROOMS', production ? 1 : 4, 100),
    public: { revision: revision || null, production, restrictedOrigins: origins.length > 0, relayConfigured: turn.length > 0 }
  };
}
