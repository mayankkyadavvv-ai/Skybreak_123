import { chromium } from 'playwright';
import { createPreviewServer } from './preview.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const out='qa-artifacts/weapon-browser';await mkdir(out,{recursive:true});
const report={checks:[],errors:[],unverified:['Audible speaker quality','Sustained foreground Intel UHD benchmark and human control feel','Physical multiplayer clients'],setup:'Combat mission start plus existing targeting-training scenario; no mocked renderer or damage. Preset snapshots share the rolling frame window and are not isolated benchmarks.'};
const check=(ok,name,detail)=>{report.checks.push({name,passed:!!ok,detail});if(!ok)throw Error(name);};
let browser,server;
try {
  server=createPreviewServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1366,height:768}});
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.addInitScript(()=>localStorage.setItem('skybreak-settings',JSON.stringify({quality:'medium',controlsVersion:5,device:'keyboard',reducedMotion:true})));
  await page.goto(process.env.SKYBREAK_WEAPON_URL || `http://127.0.0.1:${server.address().port}`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.game?.state==='menu',null,{timeout:60000});
  report.renderer=await page.evaluate(()=>{const gl=game.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {version:gl.getParameter(gl.VERSION),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),lost:gl.isContextLost()};});
  check(!report.renderer.lost,'WebGL context available',report.renderer);
  if(/swiftshader|llvmpipe|software/i.test(report.renderer.renderer))report.unverified.push('Hardware GPU rendering: this run uses software WebGL');
  await page.evaluate(()=>game.start(2,{seed:4422}));
  await page.waitForFunction(()=>game.state==='playing');
  await page.screenshot({path:`${out}/combat.png`});
  check(await page.evaluate(()=>game.enemies.some(e=>e.alive)),'Combat mission starts with live enemies');
  await page.evaluate(()=>game.prepareTrainingLesson('targeting'));
  await page.waitForFunction(()=>game.lock>=1.4,null,{timeout:30000});
  check(true,'Actual targeting system acquires lock');
  const ammo=await page.evaluate(()=>game.missilesLeft);
  await page.keyboard.down('e');await page.keyboard.down('e');
  await page.waitForTimeout(2100);
  check(await page.evaluate(()=>game.missilesLeft)===ammo-1,'Held E and repeat keydown launch exactly once');
  await page.keyboard.up('e');
  await page.waitForFunction(()=>game.stats.missileHits>0,null,{timeout:15000});
  check(true,'Missile flight registers confirmed damage');
  await page.screenshot({path:`${out}/missile-impact.png`});
  await page.evaluate(()=>{game.prepareTrainingLesson('targeting');const target=game.target;target.position.copy(game.player.position).addScaledVector(game.player.forward,420);target.resetInterpolation();});
  await page.keyboard.down('Space');
  await page.waitForFunction(()=>game.stats.hits>0,null,{timeout:10000});
  await page.screenshot({path:`${out}/cannon.png`});
  check(true,'Held Space produces actual cannon damage');
  await page.keyboard.press('Escape');
  const paused=await page.evaluate(()=>({ammo:game.cannonLeft,state:game.state}));
  await page.waitForTimeout(250);check(await page.evaluate(()=>game.cannonLeft)===paused.ammo&&paused.state==='paused','Pause stops held fire');
  await page.keyboard.up('Space');await page.keyboard.press('Escape');
  const resumed=await page.evaluate(()=>game.cannonLeft);await page.waitForTimeout(250);
  check(await page.evaluate(()=>game.cannonLeft)===resumed,'Resume cannot restore held fire');
  await page.evaluate(()=>game.restart());
  check(await page.evaluate(()=>game.weapons.missiles.every(m=>!m.active)&&game.input.keys.size===0),'Restart clears missiles and inputs');
  await page.evaluate(()=>{for(let i=0;i<20;i++)game.effects.burst(game.player.position.clone().addScaledVector(game.player.forward,150+i*8),65,30);});
  await page.waitForTimeout(100);await page.screenshot({path:`${out}/explosions.png`});
  check(await page.evaluate(()=>game.effects.particles.filter(p=>p.life>0).length<=game.effects.budget),'Simultaneous explosions stay within particle budget');
  report.presets=[];
  for(const quality of ['low','medium','high','ultra']){
    await page.evaluate(quality=>{game.settings.quality=quality;game.applySettings();},quality);await page.waitForTimeout(250);
    report.presets.push(await page.evaluate(()=>game.getPerformanceSnapshot()));
  }
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{game.audio.init();game.settings.volume=0;game.audio.settings.volume=0;game.audio.syncMix();});
  check(await page.evaluate(()=>game.audio.play('cannon')===false),'Master mute prevents new shot audio');
  await page.evaluate(()=>{game.audio.settings.volume=.6;game.audio.settings.weaponsVolume=.2;game.audio.syncMix();});
  check(await page.evaluate(()=>Math.abs(game.audio.settings.weaponsVolume-.2)<.001),'Weapon volume applies');
  report.restarts=[];
  for(let i=0;i<5;i++){await page.evaluate(()=>game.start(2,{seed:4422}));await page.waitForTimeout(150);report.restarts.push(await page.evaluate(()=>({...game.getPerformanceSnapshot(),voices:game.audio.voices.size})));}
  await page.evaluate(()=>game.start(3));await page.keyboard.press('e');await page.keyboard.down('Space');await page.waitForTimeout(250);await page.keyboard.up('Space');
  check(await page.evaluate(()=>game.mission.freeFlight&&game.stats.shots===0&&game.stats.missiles===0),'Ordinary Free Flight still prohibits weapons');
  check(report.errors.length===0,'No browser or shader errors',report.errors);
  report.status='passed';
}catch(error){report.status=report.renderer?'failed':'blocked';report.errors.push(error.stack);process.exitCode=1;}
finally{await browser?.close();await new Promise(r=>server?server.close(r):r());await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
