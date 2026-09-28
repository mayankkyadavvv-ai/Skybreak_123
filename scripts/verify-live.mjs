import {readFile,writeFile,mkdir} from 'node:fs/promises';
const origin='https://skybreak-iota.vercel.app';
const expected=[...(await readFile('dist/index.html','utf8')).matchAll(/(?:src|href)="\/?(assets\/[^"]+\.(?:js|css))"/g)].map(m=>m[1]);
if(!expected.length)throw Error('No production asset references in dist/index.html. Build before verification.');
const report={origin,checkedAt:new Date().toISOString(),expectedAssets:expected,checks:[],status:'running'};
try{
 const response=await fetch(origin,{redirect:'manual',signal:AbortSignal.timeout(30000)}),body=await response.text();
 report.checks.push({path:'/',status:response.status,contentType:response.headers.get('content-type'),hsts:response.headers.get('strict-transport-security')});
 if(response.status!==200)throw Error(`Production returned ${response.status}. It may require your Vercel sign-in. Keep deployment protection enabled and open the URL in your signed-in browser.`);
 if(!expected.every(asset=>body.includes(asset)))throw Error('The live page does not yet reference the locally built assets; live update is not verified.');
 for(const [route,status,mime] of [...['about','help','privacy','terms','storage'].map(p=>['/'+p,200,'text/html']),['/missing-skybreak-qa-route',404,'text/html'],['/assets/missing-skybreak-qa.js',404,null],...expected.map(p=>['/'+p,200,p.endsWith('.js')?'javascript':'text/css'])]){
  const r=await fetch(origin+route,{redirect:'manual',signal:AbortSignal.timeout(30000)}),type=r.headers.get('content-type') || '';
  report.checks.push({path:route,status:r.status,mime:type,cache:r.headers.get('cache-control')});await r.arrayBuffer();
  if(r.status!==status || mime && !type.includes(mime))throw Error(`Unexpected production response for ${route}: ${r.status}, ${type}`);
 }
 report.status='passed';console.log('Verified current build and public routes: '+origin);
}catch(error){report.status='unverified';report.reason=error.message;console.error(error.message);process.exitCode=1;}
finally{await mkdir('qa-artifacts',{recursive:true});await writeFile('qa-artifacts/live-check.json',JSON.stringify(report,null,2));}
