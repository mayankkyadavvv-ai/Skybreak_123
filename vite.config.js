import { defineConfig,loadEnv } from 'vite';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {configureHeaders} from './scripts/security.mjs';
export default defineConfig(({mode})=>{
  const env=loadEnv(mode,process.cwd(),'VITE_');
  return {
    base:'/',
    server:{host:'0.0.0.0',port:4173,allowedHosts:['terminal.local']},
    plugins:[{
      name:'skybreak-public-pages',
      configureServer(server){server.middlewares.use((req,res,next)=>{
        const path=new URL(req.url,'http://localhost').pathname;
        if(/^\/[a-z-]+\/?$/.test(path)){
          const file=resolve('public',path.replace(/^\//,'').replace(/\/$/,'')+'.html');
          if(existsSync(file)){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(readFileSync(file));return;}
          res.statusCode=404;res.setHeader('Content-Type','text/html; charset=utf-8');res.end(readFileSync('public/404.html'));return;
        }
        next();
      });},
      buildStart(){configureHeaders(env.VITE_SKYBREAK_WS_URL || process.env.VITE_SKYBREAK_WS_URL || '');}
    }],
    build:{emptyOutDir:true,target:'es2022',rollupOptions:{output:{manualChunks:{three:['three']}}}}
  };
});
