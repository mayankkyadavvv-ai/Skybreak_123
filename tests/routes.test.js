import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPreviewServer} from '../scripts/preview.mjs';
test('strict preview returns real 404s, clean valid routes, correct MIME and cache headers',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'skybreak-route-'));await mkdir(join(dir,'assets'));for(const [file,data] of Object.entries({'index.html':'<h1>Skybreak</h1>','help.html':'<h1>Help</h1>','404.html':'<h1>No runway here</h1>','assets/game-Abc12345.js':'export const game=true;'}))await writeFile(join(dir,file),data);
 const server=createPreviewServer({directory:dir});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 try{
  const page=await fetch(origin+'/help');assert.equal(page.status,200);assert.match(page.headers.get('content-type'),/text\/html/);assert.match(page.headers.get('cache-control'),/must-revalidate/);assert.equal(page.headers.get('x-robots-tag'),'noindex, nofollow');
  const redirect=await fetch(origin+'/help.html',{redirect:'manual'});assert.equal(redirect.status,308);assert.equal(redirect.headers.get('location'),'/help');
  const missing=await fetch(origin+'/no-such-route');assert.equal(missing.status,404);assert.match(await missing.text(),/No runway here/);
  const asset=await fetch(origin+'/assets/missing.js');assert.equal(asset.status,404);assert.match(asset.headers.get('content-type'),/text\/plain/);assert.doesNotMatch(await asset.text(),/<html|Skybreak/);
  const script=await fetch(origin+'/assets/game-Abc12345.js');assert.equal(script.status,200);assert.match(script.headers.get('content-type'),/javascript/);assert.match(script.headers.get('cache-control'),/immutable/);
  const blocked=await fetch(origin+'/.env.local');assert.equal(blocked.status,404);
 }finally{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});
