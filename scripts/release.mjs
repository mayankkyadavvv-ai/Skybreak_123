import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPreviewServer} from './preview.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const team='team_xDpOqkSlmQt7VSM3F5XKYKya',project='prj_p9e6EIGKjc9Sq0wGZXuFq8Shdf8T';
const env={...process.env,NO_UPDATE_NOTIFIER:'1',VERCEL_TELEMETRY_DISABLED:'1',VERCEL_ORG_ID:team,VERCEL_PROJECT_ID:project};
async function run(command,args,{allowFailure=false,extraEnv={}}={}){
 const code=await new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:root,env:{...env,...extraEnv},stdio:'inherit'});child.once('error',reject);child.once('exit',(code,signal)=>resolve(signal?1:code));});
 if(code && !allowFailure)throw Error(`${path.basename(command)} exited with ${code}; deployment stopped.`);
 return code;
}
function npm(args){
 // All npm arguments below are fixed literals, never user-entered shell text.
 return process.platform==='win32'?run(process.env.ComSpec || 'cmd.exe',['/d','/s','/c','npm '+args.join(' ')]):run('npm',args);
}
const report={started:new Date().toISOString(),target:'https://skybreak-iota.vercel.app',projectId:project,steps:[],status:'running'};
let preview;
try{
 console.log('SKYBREAK: verify current source, then publish to the existing Vercel project.');
 if(Number(process.versions.node.split('.')[0])<22)throw Error('Use Node.js 22 or newer (tested here with 24).');
 console.log('[1/7] Install locked project dependencies');await npm(['ci','--no-audit','--no-fund']);report.steps.push('dependencies');
 console.log('[2/7] Run regression tests and production build');await npm(['test']);await npm(['run','build']);await npm(['run','audit:secrets']);report.steps.push('tests/build/source-scan');
 console.log('[3/7] Install isolated QA tools without editing the lockfile');await npm(['install','--no-save','--package-lock=false','--no-audit','--no-fund','playwright@1.62.1','axe-core@4']);
 console.log('[4/7] Test installed Chrome/Edge, six layouts and five minutes of flight. Allow several minutes.');
 preview=createPreviewServer({directory:path.join(root,'dist')});await new Promise(resolve=>preview.listen(0,'127.0.0.1',resolve));
 await run(process.execPath,['scripts/browser-acceptance.mjs'],{extraEnv:{SKYBREAK_QA_URL:`http://127.0.0.1:${preview.address().port}`}});
 await new Promise(resolve=>preview.close(resolve));preview=null;report.steps.push('browser-automation');
 const manifest=JSON.parse(await readFile('node_modules/vercel/package.json','utf8'));
 const cli=path.resolve('node_modules/vercel',typeof manifest.bin==='string'?manifest.bin:manifest.bin.vercel);
 console.log('[5/7] Sign in to the Vercel account that owns Skybreak');
 if(await run(process.execPath,[cli,'whoami'],{allowFailure:true}))await run(process.execPath,[cli,'login']);
 console.log('[6/7] Verify the existing project and publish current source');
 await run(process.execPath,[cli,'link','--yes','--scope',team,'--project',project]);
 const linked=JSON.parse(await readFile('.vercel/project.json','utf8'));
 if(linked.orgId!==team || linked.projectId!==project)throw Error('Linked project differs from the approved Skybreak project. Nothing uploaded.');
 await run(process.execPath,[cli,'deploy','--prod','--yes','--scope',team]);report.steps.push('vercel-cli-success');
 console.log('[7/7] Verify the production URL serves this build');
 await run(process.execPath,['scripts/verify-live.mjs']);report.steps.push('live-build-check');report.status='published-and-verified';
 console.log('\nPLAY: https://skybreak-iota.vercel.app\nBrowser automation passed; physical controls and visual feel still need your review.');
}catch(error){report.status='stopped';report.reason=error.message;console.error('\n'+error.message+'\nSee qa-artifacts/acceptance.json and release-status.json. Protection settings were not changed.');process.exitCode=1;}
finally{if(preview)await new Promise(resolve=>preview.close(resolve));report.finished=new Date().toISOString();await mkdir('qa-artifacts',{recursive:true});await writeFile('qa-artifacts/release-status.json',JSON.stringify(report,null,2));}
