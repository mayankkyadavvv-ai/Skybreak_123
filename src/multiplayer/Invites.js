export const ROOM_CODE = /^SKY-[A-Z0-9]{4}$/;
export const PARTY_MODES = Object.freeze({ open_skies_coop: 'Open Skies Co-op', air_superiority: 'Air Superiority', team_deathmatch: 'Team Battle', '1v1': '1 vs 1 Duel', free_flight: 'Free Flight' });
export function parseInvite(location = globalThis.location) {
  try { const url = new URL(location?.href || location); const code = url.searchParams.get('join')?.toUpperCase(); return ROOM_CODE.test(code || '') ? code : null; } catch { return null; }
}
export function inviteURL(code, location = globalThis.location) {
  if (!ROOM_CODE.test(code || '')) throw new Error('Invalid room code.');
  const url = new URL(location?.href || location);
  url.search = ''; url.hash = ''; url.searchParams.set('join', code);
  if (globalThis.window?.SKYBREAK_LAN) url.searchParams.set('lan', '1');
  // Never serialize endpoints, resume credentials or authentication into invitations.
  return url.href;
}
export async function inviteQR(url) {
  const qr = await import('qrcode');
  return (qr.default || qr).toDataURL(url, { errorCorrectionLevel: 'M', margin: 2, width: 208, color: { dark: '#071426', light: '#ffffff' } });
}
