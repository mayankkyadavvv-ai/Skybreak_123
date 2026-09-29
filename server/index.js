import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { GameServer } from './GameServer.js';
import { readServiceConfig } from './ServiceConfig.js';
import { MAX_MESSAGE_BYTES, PROTOCOL_VERSION } from '../src/shared/Protocol.js';

export function createMatchService({env=process.env}={}) {
  const config=readServiceConfig(env);
  let gameServer;
  const server=http.createServer((req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    const url=new URL(req.url,'http://localhost');
    if(req.method!=='GET'){res.writeHead(405,{'Allow':'GET'});res.end();return;}
    if(['/health','/status','/ready'].includes(url.pathname)){const body={...gameServer.health(),deployment:config.public};res.writeHead(body.status==='healthy'?200:503,{'Content-Type':'application/json'});res.end(JSON.stringify(body));return;}
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({service:'Skybreak match worker',protocol:PROTOCOL_VERSION,health:'/health',ready:'/ready',websocket:'/ws'}));
  });
  const wss=new WebSocketServer({server,maxPayload:MAX_MESSAGE_BYTES,perMessageDeflate:false});gameServer=new GameServer(wss,{env:config.env,maxClients:config.maxClients,maxRooms:config.maxRooms});
  return {server,wss,gameServer,config,async close(){gameServer.cleanup();await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const service=createMatchService(),port=service.config.port,host=process.env.HOST||'0.0.0.0';service.server.listen(port,host,()=>console.log(`Skybreak protocol ${PROTOCOL_VERSION} room worker listening on ${host}:${port}; /health and /ready available`));for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{service.close().then(()=>process.exit(0));});}
