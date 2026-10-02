import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createLanServer } from './lan.js';

export async function launchLan({ directory = resolve(fileURLToPath(new URL('../dist', import.meta.url))), port = Number(process.env.SKYBREAK_LAN_PORT || 4173), bind = '0.0.0.0' } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('SKYBREAK_LAN_PORT must be a port between 1 and 65535.');
  const service = createLanServer({ directory });
  try { await service.listen(port, bind); } catch (error) { await service.close(); throw error; }
  console.log(`\nSKYBREAK — LOCAL SQUADRON\nHost device: http://localhost:${port}/lan`);
  for (const address of service.addresses) console.log(`Friend on same Wi-Fi: http://${address}:${port}/lan`);
  if (!service.addresses.length) console.log('No LAN IPv4 address found. Connect Wi-Fi/Ethernet and restart to invite another device.');
  console.log('\nOpen /lan for QR codes and connection checks. Built game and match server run locally.\nAllow Node.js only on trusted Private networks if Windows asks. No port forwarding required.\nPress Ctrl+C to stop. Closing this process ends the local session.');
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; console.log('\nStopping Skybreak LAN session…'); await service.close(); process.off('SIGINT', stop); process.off('SIGTERM', stop); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  return service;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  launchLan().catch(error => { console.error(error.code === 'EADDRINUSE' ? 'Port is already in use. Close the previous launcher or set SKYBREAK_LAN_PORT to another port.' : error.message); process.exitCode = 1; });
}
