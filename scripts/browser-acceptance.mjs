// Optional real-browser gate. Install Playwright locally before running; see QA.md.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import os from 'node:os';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url);
const origin=process.env.SKYBREAK_QA_URL || 'http://localhost:4173',out='qa-artifacts';await mkdir(out,{recursive:true});
const report={origin,started:new Date().toISOString(),status:'running',environment:{os:`${os.platform()} ${os.release()}`,cpu:os.cpus()[0]?.model,logicalCPUs:os.cpus().length,memoryGiB:Math.round(os.totalmem()/1024**3)},viewports:[],errors:[],samples:[],accessibility:[],unverified:['physical controller feel','screen reader','human visual review','field Web Vitals']};
let browser,axe;
const channels=process.env.SKYBREAK_BROWSER_CHANNEL?[process.env.SKYBREAK_BROWSER_CHANNEL]:['chrome','msedge',null];
const launchErrors=[];
for(const channel of channels){try{browser=await chromium.launch({...(channel?{channel}:{}),headless:process.env.HEADED!=='1'});report.browserChannel=channel || 'bundled-chromium';break;}catch(error){launchErrors.push({channel,error:error.message.split('\n')[0]});}}
if(!browser){report.status='blocked';report.launchErrors=launchErrors;await writeFile(`${out}/acceptance.json`,JSON.stringify(report,null,2));throw Error('No usable Chrome/Edge/Chromium found. Install Chrome or Edge, enable graphics acceleration, and run again. See qa-artifacts/acceptance.json.');}
try{axe=await readFile(require.resolve('axe-core/axe.min.js'),'utf8');}catch{report.unverified.push('axe accessibility scan: install axe-core');}
async function audit(page,label){if(!axe)return;await page.evaluate(axe);const result=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));report.accessibility.push({label,violations:result.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,help:v.help,helpUrl:v.helpUrl,nodes:v.nodes.map(n=>({target:n.target,failureSummary:n.failureSummary}))})),incomplete:result.incomplete.map(v=>({id:v.id,impact:v.impact}))});}
try{
 for(const [width,height] of [[360,800],[390,844],[412,915],[768,1024],[1366,768],[1920,1080]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:width<900,isMobile:width<900}),page=await context.newPage();
  page.on('pageerror',error=>report.errors.push({width,height,message:error.message}));
  const started=Date.now();await page.goto(origin);await page.waitForFunction(()=>window.game?.state==='menu',{},{timeout:45000});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  report.viewports.push({width,height,documentOverflow:overflow,timeToMenuMs:Date.now()-started,navigation:await page.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0];return n?{transferSize:n.transferSize,domContentLoadedMs:n.domContentLoadedEventEnd,loadMs:n.loadEventEnd}:null;})});
  await audit(page,`menu-${width}x${height}`);
  await page.screenshot({path:`${out}/menu-${width}x${height}.png`,fullPage:true});
  await page.locator('[data-action="settings"]').first().click();await page.screenshot({path:`${out}/settings-${width}x${height}.png`});await audit(page,`settings-${width}x${height}`);await page.keyboard.press('Escape');
  await page.locator('[data-action="hangar"]').first().click();await page.locator('[data-tab="weapons"]').click();await page.screenshot({path:`${out}/hangar-${width}x${height}.png`});await page.keyboard.press('Escape');
  await page.locator('[data-action="play"]').first().click();if(await page.locator('[data-action="launch-flight"]').count())await page.locator('[data-action="launch-flight"]').click();
  await page.waitForFunction(()=>window.game.state==='playing');await page.screenshot({path:`${out}/flight-${width}x${height}.png`});
  if(width===1366){
   const before=await page.evaluate(()=>window.game.player.throttle);
   await page.keyboard.down('KeyW');await page.waitForTimeout(800);await page.keyboard.up('KeyW');
   const held=await page.evaluate(()=>window.game.player.throttle);await page.waitForTimeout(300);
   const after=await page.evaluate(()=>window.game.player.throttle);
   report.throttle={before,afterHold:held,afterRelease:after};
   if(!(held>before && Math.abs(held-after)<.01))report.errors.push({message:'Throttle did not increase and hold'});
   await page.keyboard.down('ArrowDown');await page.waitForTimeout(600);await page.keyboard.up('ArrowDown');
   for(const key of ['KeyC','KeyV','KeyN','KeyN'])await page.keyboard.press(key);
   await page.keyboard.press('Escape');await page.waitForFunction(()=>window.game.state==='paused');await page.keyboard.press('Escape');await page.waitForFunction(()=>window.game.state==='playing');
   // Five minutes of sampled running. This automated run is separate from manual feel/playthrough acceptance.
   const flightStart=Date.now();
   for(let i=0;i<60;i++){await page.waitForTimeout(5000);report.samples.push(await page.evaluate(()=>({...window.game.getPerformanceSnapshot(),state:window.game.state,alive:window.game.player.alive})));if(i%8===7)await page.evaluate(()=>window.game.resetPracticePosition());if(i%6===0)console.log(`Flight sampling ${i+1}/60`);}
   report.automatedFlightDurationMs=Date.now()-flightStart;
   report.renderer=await page.evaluate(()=>{const gl=window.game.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {userAgent:navigator.userAgent,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):'unavailable'};});
   for(const time of ['day','sunset','night']){await page.evaluate(time=>window.game.atmosphere.setTimeOfDay(time),time);await page.waitForTimeout(500);await page.screenshot({path:`${out}/flight-${time}.png`});}
   await page.evaluate(()=>window.game.approachBase('ambala_afb'));await page.waitForTimeout(500);await page.screenshot({path:`${out}/approach.png`});
   await page.evaluate(()=>window.game.landAtBase('ambala_afb'));await page.waitForTimeout(500);await page.screenshot({path:`${out}/ground.png`});
   await page.evaluate(()=>window.game.settings.device='keyboard');
   await page.keyboard.down('KeyW');await page.waitForTimeout(2000);await page.keyboard.up('KeyW');
   await page.keyboard.down('ArrowDown');await page.waitForTimeout(3000);await page.keyboard.up('ArrowDown');
   report.takeoff=await page.evaluate(()=>({landed:window.game.player.isLanded,speed:window.game.player.speed,altitude:window.game.player.position.y}));
   report.lifecycle=[];for(let i=0;i<10;i++){await page.evaluate(()=>{const g=window.game;g.menu();g.start(3);});await page.waitForTimeout(250);report.lifecycle.push(await page.evaluate(()=>window.game.getPerformanceSnapshot()));}
  }
  await context.close();
 }
 const page=await browser.newPage();for(const route of ['/about','/help','/privacy','/terms','/storage']){const response=await page.goto(origin+route);if(response.status()!==200)report.errors.push({route,message:`HTTP ${response.status()}`});if(await page.evaluate(()=>performance.getEntriesByType('resource').some(r=>/\/(?:three|index)-[^/]+\.js/.test(r.name))))report.errors.push({route,message:'Game engine fetched on public page'});await audit(page,route);}
 report.status=report.errors.length || report.viewports.some(v=>v.documentOverflow) || report.accessibility.some(a=>a.violations.some(v=>['critical','serious'].includes(v.impact)))?'failed':'passed';
}catch(error){report.status='failed';report.errors.push({message:error.message});throw error;}
finally{report.finished=new Date().toISOString();await writeFile(`${out}/acceptance.json`,JSON.stringify(report,null,2));await browser.close();}
if(report.status!=='passed')process.exitCode=1;
