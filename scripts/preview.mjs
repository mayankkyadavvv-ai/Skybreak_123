import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {securityHeaders} from './security.mjs';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8','.json':'application/json; charset=utf-8','.glb':'model/gltf-binary'};
export function createPreviewServer({directory='dist',preview=true}={}){
  const root=resolve(directory);
  return createServer(async(req,res)=>{
    const headers={...securityHeaders(process.env.VITE_SKYBREAK_WS_URL || ''),'Cache-Control':'public, max-age=0, must-revalidate',...(preview?{'X-Robots-Tag':'noindex, nofollow'}:{})};
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{...headers,Allow:'GET, HEAD'});res.end();return;}
    let path;try{path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400,headers);res.end();return;}
    if(path.includes('\0') || path.split('/').some(part=>part.startsWith('.'))){res.writeHead(404,{...headers,'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');return;}
    if(path.endsWith('.html') && path!='/404.html' || path!=='/' && path.endsWith('/')){
      const destination=path.replace(/\.html$/,'').replace(/\/$/,'').replace(/^\/index$/,'/') || '/';
      const candidate=resolve(root,'.'+(destination==='/'?'/index.html':destination+'.html'));
      if(candidate.startsWith(root+sep) && await stat(candidate).catch(()=>null)){res.writeHead(308,{...headers,Location:destination});res.end();return;}
    }
    const name=path==='/'?'index.html':path.slice(1)+(extname(path)?'':'.html'),file=resolve(root,name);
    let body,status=path==='/404' || path==='/404.html'?404:200,type=MIME[extname(file)] || 'application/octet-stream';
    try{if(!file.startsWith(root+sep))throw Error();body=await readFile(file);}catch{
      status=404;
      if(extname(path)){type='text/plain; charset=utf-8';body=Buffer.from('Asset not found');}
      else{type=MIME['.html'];body=await readFile(resolve(root,'404.html')).catch(()=>Buffer.from('Page not found'));}
    }
    if(status===200 && /^\/assets\/[^/]+-[\w-]{8,}\.(?:js|css)$/.test(path))headers['Cache-Control']='public, max-age=31536000, immutable';
    if(status===404)headers['X-Robots-Tag']='noindex';
    res.writeHead(status,{...headers,'Content-Type':type,'Content-Length':body.length});res.end(req.method==='HEAD'?undefined:body);
  });
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const port=Number(process.env.PORT || 4173),host=process.env.HOST || '0.0.0.0';
  createPreviewServer().listen(port,host,()=>console.log(`Skybreak production preview: http://localhost:${port} (local noindex)`));
}
