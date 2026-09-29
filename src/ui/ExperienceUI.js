import { escapeHTML } from './Accessibility.js';
import { bindingLabel, curveAxis, actionForCode, chordFromEvent, readGamepad } from '../game/InputActions.js';
import { FLIGHT_LESSONS, FlightSchool } from '../game/FlightSchool.js';
import { SortieRecorder, ReplayPlayer, replayAdvice } from '../game/Replay.js';
import { sensorContacts, threatMarkup, threatState } from './ThreatDisplay.js';
import { getMission } from '../game/Missions.js';
import { currentActivity, activitySummary, activityResultsMarkup } from './ActivityDisplay.js';

const stamp=s=>`${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`;
const bound=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
function download(name,blob){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const DEFAULT_TOUCH={stick:{x:.16,y:.76},throttle:{x:.28,y:.73},fire:{x:.83,y:.70},missile:{x:.92,y:.70},flare:{x:.83,y:.82},boost:{x:.92,y:.82},brake:{x:.75,y:.90},gear:{x:.83,y:.93},camera:{x:.92,y:.93},pause:{x:.95,y:.15}};
export function constrainTouchPosition(x,y){return {x:bound(x,.07,.93),y:bound(y,.1,.9)};}
export const experienceMethods={
  initExperience(){
    this.previewKeys=new Set();
    const key=event=>{if(this.modalType!=='settings'||this.settingsSection!=='controls'||event.target?.matches?.('input,select,textarea'))return;const action=actionForCode(chordFromEvent(event),this.settings);if(['pitchUp','pitchDown','rollLeft','rollRight'].includes(action)){event.preventDefault();if(event.type==='keydown')this.previewKeys.add(action);else this.previewKeys.delete(action);}};
    window.addEventListener('keydown',key);window.addEventListener('keyup',key);window.addEventListener('blur',()=>this.previewKeys.clear());
    this.refreshContinue();
  },
  refreshContinue(){const button=this.root.querySelector('[data-action="continue"]');if(!button)return;const id=this.settings.lastMissionId;button.disabled=!this.settings.lastSoloPlayed;button.textContent=this.settings.lastSoloPlayed?`Continue · ${getMission(id).name}`:'Continue · fly a sortie first';},
  experienceAction(action){
    if(action==='continue'){this.selected=getMission(this.settings.lastMissionId).id;this.game.selectedMission=this.selected;this.action('play');return true;}
    if(action==='solo'){this.showSolo();return true;}
    if(action==='training'){this.showTraining();return true;}
    if(action==='local-coop'){this.showLocalCoop();return true;}
    if(action==='hud-detail'){this.settings.hudDetail=this.settings.hudDetail==='compact'?'full':'compact';this.saveSettings();return true;}
    if(action==='training-repeat'){this.flightSchool?.reset(this.game);this.inGame();return true;}
    if(action==='training-next'){this.flightSchool?.skip(this.game);this.inGame();return true;}
    if(action==='training-exit'){this.flightSchool?.stop();this.dom['flight-school'].hidden=true;this.game.start(3);return true;}
    if(action==='replay-library'){this.showReplayLibrary();return true;}
    if(action==='replay'){this.showReplay();return true;}
    if(action==='replay-close'){this.replayPlayer=null;if(this.replayReturnMode==='library'){this.showReplayLibrary();return true;}if(this.replayReturnMode==='multiplayer'){this.showMultiplayerResult(this.game.multiplayer.lastResult);return true;}this.showResult(this.replayReturn?.success || false,this.replayReturn?.reason || '');return true;}
    if(action==='touch-layout'){this.showTouchLayout();return true;}
    if(action==='mission-generator'){this.showMissionGenerator();return true;}
    if(action==='campaign'){this.showCampaign();return true;}
    if(action==='activities'){this.showActivities();return true;}
    return false;
  },
  showSolo(){
    this.modalType='solo';this.panel('CHOOSE YOUR SORTIE','Solo operations',`<p>Fly at your own pace, lead your squadron or create a mission.</p><div class="stack-buttons"><button class="primary" data-action="missions">Choose a flight or combat operation</button><button data-action="campaign">Continue sector campaign</button><button data-action="mission-generator">Mission generator &amp; shared presets</button><button data-action="activities">Races, formation &amp; landing challenges</button><button data-action="training">Interactive flight school</button><button data-action="replay-library">Recorded sorties &amp; replay files</button><button data-action="close">Back</button></div>`);
  },
  showLocalCoop(){
    this.modalType='local-coop';this.panel('TWO PILOTS · ONE COMPUTER','Local co-op',`<p>Connect a standard controller and press any button. Each pilot gets their own view and instruments.</p><div class="settings-list"><label class="setting"><span>Sortie</span><select id="local-mode"><option value="free_flight">Free Flight</option><option value="open_skies">Open Skies co-op</option></select></label><label class="setting"><span>Input ownership</span><select id="local-input"><option value="keyboard-controller">Player 1 keyboard · Player 2 controller</option><option value="two-controllers">Two controllers</option></select></label></div><p id="local-status" role="status">Keyboard: ${bindingLabel('pitchUp',this.settings)} nose up · ${bindingLabel('pitchDown',this.settings)} nose down.</p><button id="local-start" class="primary">Start split-screen</button><p class="panel-footnote">Local co-op shares rendering resources. Lower graphics quality if needed. Use a standard-mapping controller for each controller seat.</p>`);
    this.modal.querySelector('#local-start').addEventListener('click',()=>{const status=this.modal.querySelector('#local-status');if(!this.game.startLocalCoop){status.textContent='Local co-op could not initialize. Reload this release and try again.';return;}const result=this.game.startLocalCoop({mode:this.modal.querySelector('#local-mode').value,inputMode:this.modal.querySelector('#local-input').value});if(result?.ok===false)status.textContent=result.error;});
  },
  showTraining(){
    this.modalType='training';const completed=this.flightSchool?.progress?.completed || (()=>{try{return JSON.parse(localStorage.getItem('skybreak-flight-school-v1'))?.completed || [];}catch{return [];}})();
    this.panel('PLAYABLE FLIGHT SCHOOL','Learn by flying',`<p>Each lesson checks your aircraft and actual actions. Lessons save independently from combat rewards.</p><div class="lesson-list">${FLIGHT_LESSONS.map((lesson,i)=>`<button data-lesson="${lesson.id}"><b>${completed.includes(lesson.id)?'✓':String(i+1).padStart(2,'0')} · ${lesson.name}</b><span>${lesson.description}</span></button>`).join('')}</div><p class="panel-footnote">Repeat or skip any lesson. Your current control bindings are shown during the exercise.</p>`);
    this.modal.querySelectorAll('[data-lesson]').forEach(button=>button.addEventListener('click',()=>this.startLesson(button.dataset.lesson)));
  },
  startLesson(id){
    this.flightSchool ||= new FlightSchool({onSetup:(lesson,g)=>g.prepareTrainingLesson?.(lesson) || {ok:false,error:'Training could not initialize. Reload and try again.'},onCleanup:()=>this.game.clearTrainingLesson?.(),onFeedback:text=>this.message(text,3)});
    const result=this.flightSchool.start(id,this.game);this.game.flightSchool=this.flightSchool;
    if(result.ok){this.inGame();this.updateSchool();}else this.message(result.error,5);
  },
  updateSchool(){const node=this.dom['flight-school'],state=this.flightSchool?.snapshot(this.settings);if(!node)return;node.hidden=!state?.active;if(node.hidden)return;const key=JSON.stringify([state.name,state.feedback,state.completed,state.controls,Math.floor(state.progress*20)]);if(this.schoolKey===key)return;this.schoolKey=key;node.innerHTML=`<b>${state.completed?'✓ COMPLETE':'FLIGHT SCHOOL'} · ${escapeHTML(state.name)}</b><p>${escapeHTML(state.feedback)}</p><progress max="1" value="${state.progress}"></progress><small>${state.controls.map(c=>`${escapeHTML(c.label)} · ${escapeHTML(c.action.replace(/([A-Z])/g,' $1'))}`).join(' / ')}</small><div><button data-action="training-repeat">Reset</button><button data-action="training-next">${state.completed?'Next lesson':'Skip'}</button><button data-action="training-exit">Free Flight</button></div>`;},
  beginExperienceFlight(){
    const g=this.game;this.hudEl.dataset.detail=this.settings.hudDetail || 'full';
    if(g.mission && !g.multiplayer?.active && !g.training){this.settings.lastMissionId=g.mission.id;this.settings.lastSoloPlayed=true;try{localStorage.setItem('skybreak-settings',JSON.stringify(this.settings));}catch{}this.refreshContinue();}
    const sortieId=g.multiplayer?.active?g.multiplayer.matchEpoch:g.sortieId;
    if(!this.recorder || this.recordingSortieId!==sortieId || (g.elapsed || 0)<this.recorder.lastTime){this.recorder=new SortieRecorder();this.recorder.reset({mission:g.mission?.name || 'Sortie',seed:g.openSkies?.seed,sortieId,recordingScope:'Own aircraft, friendlies and sensor-detected contacts only'});this.recordingSortieId=sortieId;}
  },
  captureReplayFrame(g){
    if(!this.recorder?.active || !g.player?.position)return;
    const localId=String(g.multiplayer?.localId && g.mission?.id==='multiplayer'?g.multiplayer.localId:g.player.id);
    const contacts=sensorContacts(g),seen=new Set([localId]),entities=[{entity:g.player,relation:'player',id:localId}];
    for(const c of contacts){const entity=c.entity || g.multiplayer?.remotePlayers?.get(String(c.entityId ?? c.id)) || [...(g.allies || []),...(g.enemies || [])].find(e=>String(e.id)===String(c.entityId ?? c.id)) || c;if(!entity.position && !entity.p)continue;if(seen.has(String(entity.id)))continue;seen.add(String(entity.id));entities.push({entity,relation:c.relation || 'unknown'});}
    this.recorder.capture(g.elapsed || 0,entities,{phase:g.multiplayer?.missionState?.objective || g.openSkies?.snapshot?.().objective || g.operation?.snapshot?.().objective || '',score:g.score,lock:g.lock});
  },
  recordReplayEvent(type,text,id=''){
    if(!this.recorder?.active)return;const g=this.game,known=id==='' || String(id)===String(g.multiplayer?.localId || g.player?.id) || g.allies?.some(e=>String(e.id)===String(id)) || sensorContacts(g).some(c=>String(c.entityId ?? c.id)===String(id)) || this.recorder.previous.has(String(id));if(known)this.recorder.event(g.elapsed || 0,type,text,id);
  },
  finalizeReplay(success,reason=''){
    this.captureReplayFrame(this.game);if(this.recorder?.frames.length)this.lastReplay=this.recorder.finish({success,reason,stats:this.game.stats});this.replayReturn={success,reason};
  },
  replayDebriefMarkup(){
    if(!this.lastReplay?.frames.length)return '';
    const events=this.lastReplay.events.slice(-8);return `<section class="sortie-timeline"><h3>Sortie timeline</h3><ol>${events.map(e=>`<li><time>${stamp(e.t)}</time><span>${escapeHTML(e.text)}</span></li>`).join('')}</ol><p>${escapeHTML(replayAdvice(this.lastReplay))}</p><button class="primary" data-action="replay">Watch recorded sortie &amp; export highlight</button><small>Last ${Math.round(this.lastReplay.recordingLimitSeconds/60)} minutes maximum · recorded state · sensor-limited contacts</small></section>`;
  },
  showReplayLibrary(){
    this.modalType='replay-library';this.replayReturnMode='library';this.panel('RECORDED SORTIES','Replay library',`<p>Recorded state is local to this session. Export a replay to keep or share it. Imported replay playback cannot change live gameplay or award XP.</p><div class="stack-buttons"><button data-action="replay" ${this.lastReplay?.frames.length?'':'disabled'}>Watch latest recording</button><label class="replay-import">Open a replay file<input id="replay-import" type="file" accept=".json,.skyreplay.json,application/json"></label><button data-action="solo">Back to Solo</button></div><p id="replay-import-status" role="status"></p>`);
    this.modal.querySelector('#replay-import').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;const status=this.modal.querySelector('#replay-import-status');try{if(file.size>24*1024*1024)throw new Error('Replay file exceeds 24 MB.');const parsed=JSON.parse(await file.text());const player=new ReplayPlayer(parsed);this.lastReplay=player.recording;this.showReplay();}catch(error){status.textContent=`Could not open replay: ${error.message}`;}};
  },
  showReplay(){
    if(!this.lastReplay?.frames.length){this.message('Complete a sortie to record a replay.');return;}
    if(this.game.multiplayer?.active && ['playing','intro','dying'].includes(this.game.state)){this.message('Replay is available after the shared match ends.');return;}
    if(this.modalType==='result')this.replayReturnMode='result';
    if(this.modalType==='mp_result')this.replayReturnMode='multiplayer';
    this.modalType='replay';this.replayPlayer=new ReplayPlayer(this.lastReplay);
    this.panel('RECORDED STATE · NO LIVE REWARDS','Sortie replay',`<canvas class="replay-canvas" width="900" height="480" aria-label="Recorded tactical flight replay"></canvas><div class="replay-toolbar"><button id="replay-play">Play</button><button id="replay-highlight">Best 20 seconds</button><label>Playback speed <select id="replay-rate"><option value=".5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label></div><label class="replay-seek">Timeline <input id="replay-seek" type="range" min="${this.replayPlayer.start}" max="${this.replayPlayer.end}" value="${this.replayPlayer.start}" step=".1"><output id="replay-time"></output></label><p id="replay-event" role="status"></p><div class="replay-toolbar"><button id="replay-export">Export replay JSON</button><button id="replay-screenshot">Save image PNG</button><button data-action="replay-close">Back to debrief</button></div><p class="panel-footnote">Tactical replay uses recorded positions and aircraft identity. Hidden contacts were never recorded. Video export is unavailable here; JSON and PNG are supported.</p>`);
    this.modal.querySelector('#replay-play').onclick=()=>{if(this.replayPlayer.time>=this.replayPlayer.end)this.replayPlayer.seek(this.replayPlayer.start);this.replayPlayer.playing=!this.replayPlayer.playing;};
    this.modal.querySelector('#replay-seek').oninput=e=>{this.replayPlayer.seek(Number(e.target.value));this.drawReplay();};
    this.modal.querySelector('#replay-rate').onchange=e=>{this.replayPlayer.rate=Number(e.target.value);};
    this.modal.querySelector('#replay-highlight').onclick=()=>{this.replayHighlight=this.replayPlayer.highlight();this.replayPlayer.seek(this.replayHighlight.start);this.replayPlayer.playing=true;};
    this.modal.querySelector('#replay-export').onclick=()=>download('skybreak-sortie.skyreplay.json',new Blob([JSON.stringify(this.lastReplay)],{type:'application/json'}));
    this.modal.querySelector('#replay-screenshot').onclick=()=>{const canvas=this.modal.querySelector('.replay-canvas');try{canvas.toBlob(blob=>blob?download('skybreak-highlight.png',blob):this.message('Image export unavailable in this browser.'),'image/png');}catch{this.message('Image export unavailable in this browser.');}};
    this.drawReplay();
  },
  drawReplay(){
    const canvas=this.modal.querySelector('.replay-canvas'),r=this.replayPlayer;if(!canvas||!r)return;const ctx=canvas.getContext('2d');if(!ctx)return;
    const frame=r.frame(),own=frame.entities.find(e=>e.relation==='player') || frame.entities[0],centre=own?.position || [0,0,0],scale=.035,w=canvas.width,h=canvas.height;
    ctx.fillStyle='#061923';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#1b3c48';ctx.lineWidth=1;for(let x=0;x<w;x+=50){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}for(let y=0;y<h;y+=50){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
    ctx.strokeStyle='#77ded4';ctx.beginPath();let first=true;for(const sample of r.recording.frames){if(sample.t>r.time || sample.t<r.time-25)continue;const p=sample.entities.find(e=>e.id===own?.id)?.position;if(p){const x=w/2+(p[0]-centre[0])*scale,y=h/2+(p[2]-centre[2])*scale;if(first){ctx.moveTo(x,y);first=false;}else ctx.lineTo(x,y);}}ctx.stroke();
    ctx.font='13px ui-monospace, monospace';for(const e of frame.entities){const x=bound(w/2+(e.position[0]-centre[0])*scale,18,w-18),y=bound(h/2+(e.position[2]-centre[2])*scale,40,h-28);ctx.fillStyle=e.alive===false?'#819096':e.relation==='enemy'?'#ffae98':e.relation==='unknown'?'#ffe0a2':'#9dedec';ctx.beginPath();ctx.moveTo(x,y-8);ctx.lineTo(x+6,y+6);ctx.lineTo(x,y+3);ctx.lineTo(x-6,y+6);ctx.closePath();ctx.strokeStyle=ctx.fillStyle;ctx.stroke();ctx.fillText(`${e.callsign} · ${Math.round(e.position[1])} M`,x+10,y-10);}
    ctx.fillStyle='#e9f7f6';ctx.fillText(`${r.recording.meta.mission} · ${stamp(r.time)} · RECORDED TACTICAL VIEW`,20,25);ctx.fillText('Aircraft orientation/altitude are recorded; map trail shows actual movement.',20,h-14);
    this.modal.querySelector('#replay-seek').value=r.time;this.modal.querySelector('#replay-time').textContent=`${stamp(r.time)} / ${stamp(r.end)}`;this.modal.querySelector('#replay-play').textContent=r.playing?'Pause':'Play';this.modal.querySelector('#replay-event').textContent=frame.events.map(e=>e.text).join(' · ') || frame.phase || 'Recorded sortie';
  },
  attachControlStudio(){
    const root=this.modal;if(!root.querySelector('#control-preview'))return;const preview=root.querySelector('#control-preview');
    preview.addEventListener('pointermove',event=>{if(this.settings.device!=='mouse')return;const r=preview.getBoundingClientRect();this.previewMouse={x:bound((event.clientX-r.left)/r.width*2-1,-1,1),y:bound((event.clientY-r.top)/r.height*2-1,-1,1)};});preview.addEventListener('pointerleave',()=>{this.previewMouse={x:0,y:0};});
    const status=text=>{const el=root.querySelector('#profile-status');if(el)el.textContent=text;};
    root.querySelector('#save-profile').onclick=()=>{const name=root.querySelector('#profile-name').value.trim();if(!name){status('Enter a profile name.');return;}const result=this.game.saveControlProfile?.(name);if(result?.ok===false){status(result.error || result.reason || 'Action could not finish.');return;}this.showSettings('controls');};
    root.querySelector('#load-profile').onclick=()=>{const id=root.querySelector('#control-profiles').value;if(!id)return;const result=this.game.loadControlProfile?.(id);if(result?.ok===false){status(result.error || result.reason || 'Action could not finish.');return;}this.saveSettings();this.showSettings('controls');};
    root.querySelector('#remove-profile').onclick=()=>{const id=root.querySelector('#control-profiles').value;this.game.removeControlProfile?.(id);this.showSettings('controls');};
    root.querySelector('#calibrate-pad').onclick=()=>{this.calibrationSamples=[];this.calibrationRemaining=3;status('Release both controller sticks. Measuring drift for three seconds…');};
  },
  updateControlStudio(dt){
    const root=this.modal,craft=root.querySelector('#control-aircraft');if(!craft)return;
    let data=this.game.getControlPreview?.() || {},pad=null;try{pad=[...(navigator.getGamepads?.() || [])].find(p=>p?.connected!==false && p?.mapping==='standard');}catch{}
    const raw=pad?.axes || data.rawAxes || [],axes=data.axes || this.game.input.padPreview?.axes || {};
    const previewPad=readGamepad(pad,this.settings.gamepadDeadzone);
    let pitch=(pad?previewPad.axes.pitch:axes.pitch || 0)*(this.settings.gamepadInvert?-1:1),roll=pad?previewPad.axes.roll:axes.roll || 0;
    if(this.settings.device==='mouse'){const m=this.previewMouse || {x:0,y:0};pitch=curveAxis(-m.y,this.settings.mouseDeadzone,this.settings.mouseCurve)*(this.settings.mouseInvert?-1:1);roll=curveAxis(m.x,this.settings.mouseDeadzone,this.settings.mouseCurve);}
    else if(this.settings.device==='keyboard'){pitch=(this.previewKeys.has('pitchUp')?1:0)-(this.previewKeys.has('pitchDown')?1:0);roll=(this.previewKeys.has('rollRight')?1:0)-(this.previewKeys.has('rollLeft')?1:0);if(this.settings.keyboardInvert)pitch*=-1;}
    pitch=bound(pitch*(this.settings.pitchSensitivity || 1),-1.6,1.6);roll=bound(roll*(this.settings.rollSensitivity || 1),-1.6,1.6);
    craft.style.transform=`translateY(${-pitch*18}px) rotate(${roll*32}deg) scaleY(${1-Math.abs(pitch)*.15})`;
    root.querySelector('#control-preview-values').textContent=`Pitch ${pitch.toFixed(2)} · Roll ${roll.toFixed(2)} · pitch ×${this.settings.pitchSensitivity} / roll ×${this.settings.rollSensitivity}`;
    const inspect=root.querySelector('#raw-pad-values');inspect.textContent=pad?`Axes: ${raw.map(n=>Number(n).toFixed(3)).join(' · ')} | Buttons: ${pad.buttons.map((b,i)=>b.pressed?i:null).filter(i=>i!==null).join(', ') || 'none'}`:'Connect a standard controller and press any button to inspect raw axes.';
    if(this.calibrationRemaining>0){if(pad)this.calibrationSamples.push(raw.slice(0,4));this.calibrationRemaining-=dt;if(this.calibrationRemaining<=0){const status=root.querySelector('#profile-status');if(this.calibrationSamples.length<20){status.textContent='No reliable controller sample. Connect a controller, release its sticks and retry.';return;}const result=this.game.calibrateController?.(this.calibrationSamples);status.textContent=result?.ok===false?result.error:`Drift measured. Deadzone ${Math.round((this.settings.gamepadDeadzone || .14)*100)}%. Saved for this device.`;this.saveSettings();const slider=root.querySelector('[data-setting="gamepadDeadzone"]');if(slider)slider.value=this.settings.gamepadDeadzone;}}
  },
  showTouchLayout(){
    this.modalType='touch-layout';this.touchDraft=structuredClone(this.settings.touchLayout || {handedness:'right',scale:1,positions:DEFAULT_TOUCH});this.touchDraft.positions={...structuredClone(DEFAULT_TOUCH),...this.touchDraft.positions};
    this.panel('TOUCH ERGONOMICS','Arrange your controls',`<p>Drag controls inside the preview. Positions stay within safe edges. Save applies the layout; Cancel keeps your previous layout.</p><div class="touch-editor" aria-label="Touch control layout preview">${Object.keys(DEFAULT_TOUCH).map(key=>`<button data-layout-control="${key}" aria-label="Move ${key}">${key.toUpperCase()}</button>`).join('')}</div><div class="settings-list"><label class="setting"><span>Handedness</span><select id="touch-hand"><option value="right">Right hand actions</option><option value="left">Left hand actions</option></select></label><label class="setting"><span>Button size</span><input id="touch-size" type="range" min=".8" max="1.4" step=".05" value="${this.touchDraft.scale || 1}"></label></div><div class="replay-toolbar"><button id="touch-save" class="primary">Save layout</button><button id="touch-reset">Reset preview</button><button id="touch-cancel">Cancel</button></div>`);
    const stage=this.modal.querySelector('.touch-editor'),paint=()=>{for(const el of stage.querySelectorAll('[data-layout-control]')){const p=this.touchDraft.positions[el.dataset.layoutControl];el.style.left=`${p.x*100}%`;el.style.top=`${p.y*100}%`;el.style.transform=`translate(-50%,-50%) scale(${this.touchDraft.scale || 1})`;}};paint();
    this.modal.querySelector('#touch-hand').value=this.touchDraft.handedness || 'right';
    for(const el of stage.querySelectorAll('[data-layout-control]')){let pointer=null;el.onpointerdown=e=>{pointer=e.pointerId;el.setPointerCapture?.(pointer);e.preventDefault();};el.onpointermove=e=>{if(pointer!==e.pointerId)return;const r=stage.getBoundingClientRect();this.touchDraft.positions[el.dataset.layoutControl]=constrainTouchPosition((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);paint();};for(const event of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(event,()=>{pointer=null;});el.onkeydown=e=>{const movement={ArrowUp:[0,-.02],ArrowDown:[0,.02],ArrowLeft:[-.02,0],ArrowRight:[.02,0]}[e.code];if(!movement)return;e.preventDefault();const p=this.touchDraft.positions[el.dataset.layoutControl];this.touchDraft.positions[el.dataset.layoutControl]=constrainTouchPosition(p.x+movement[0],p.y+movement[1]);paint();};}
    this.modal.querySelector('#touch-hand').onchange=e=>{if(this.touchDraft.handedness!==e.target.value){for(const key of Object.keys(this.touchDraft.positions))this.touchDraft.positions[key].x=1-this.touchDraft.positions[key].x;this.touchDraft.handedness=e.target.value;paint();}};
    this.modal.querySelector('#touch-size').oninput=e=>{this.touchDraft.scale=Number(e.target.value);paint();};
    this.modal.querySelector('#touch-save').onclick=()=>{this.settings.touchLayout=this.touchDraft;this.saveSettings();this.showSettings('controls');};
    this.modal.querySelector('#touch-cancel').onclick=()=>{this.touchDraft=null;this.showSettings('controls');};
    this.modal.querySelector('#touch-reset').onclick=()=>{this.touchDraft={handedness:'right',scale:1,positions:structuredClone(DEFAULT_TOUCH)};this.modal.querySelector('#touch-hand').value='right';this.modal.querySelector('#touch-size').value=1;paint();};
  },
  updateExperience(g,dt){
    if(this.modalType==='activities')this.updateActivityPanel();
    if(this.modalType==='replay'&&this.replayPlayer){this.replayPlayer.update(dt);if(this.replayHighlight&&this.replayPlayer.time>=this.replayHighlight.end){this.replayPlayer.playing=false;this.replayHighlight=null;}this.drawReplay();}
    if(this.modalType==='settings'&&this.settingsSection==='controls')this.updateControlStudio(dt);
    if(g.state==='playing'){this.flightSchool?.update(g,dt);this.captureReplayFrame(g);}
    this.updateSchool();
    if(this.hudEl.hidden)return;this.hudEl.dataset.detail=this.settings.hudDetail || 'full';this.hudEl.dataset.camera=g.cam?.mode || 'chase';
    this.experienceTimer=(this.experienceTimer || 0)+dt;if(this.experienceTimer<.125)return;this.experienceTimer=0;
    this.html('threat-awareness',threatMarkup(g));this.dom['threat-awareness'].hidden=!this.dom['threat-awareness'].textContent;
    const urgent=threatState(g).find(c=>c.urgency>=3);if(urgent)g.audio?.alert?.(`${urgent.kind==='missile'?'MISSILE INCOMING':'HOSTILE LOCK'} · ${urgent.direction} ${urgent.altitude} · ${urgent.kind==='missile'?bindingLabel('flare',this.settings)+' FLARES':'BREAK TRACK'}`);
    const radio=g.notifications?.[0];if(radio && radio!==this.lastRadio){this.lastRadio=radio;g.audio?.radio?.(radio.who,radio.text,{ttl:radio.ttl || 4});}
    const subtitle=g.audio?.currentSubtitle?.();this.text('audio-subtitle',this.settings.subtitles===false?'':subtitle?.text || '');this.dom['audio-subtitle'].hidden=!this.dom['audio-subtitle'].textContent;
    this.hudEl.classList.toggle('radio-subtitled',!!radio && this.dom['audio-subtitle'].textContent===`${radio.who}: ${radio.text}`);
    if(g.operation?.snapshot){const op=g.operation.snapshot();this.text('mission-objective',op.objective || op.description || op.state || '');}
    const activity=currentActivity(g);if(activity)this.text('mission-objective',activitySummary(activity,g.multiplayer?.active?g.multiplayer.localId:g.player.id));
  },
  showMissionGenerator(){
    this.modalType='mission-generator';this.panel('SHAREABLE OPERATIONS','Mission generator',`<div class="settings-list">${[['template','Template','escort:Escort|intercept:Interception|base-defence:Base defence|strike-support:Strike support'],['location','Location','aegis:Aegis Strait|ridge:Talon Ridge|coast:Sable Coast'],['difficulty','Difficulty','easy:Easy|medium:Medium|hard:Hard'],['weather','Weather','clear:Clear|cloudy:Cloudy|storm:Storm']].map(([id,label,options])=>`<label class="setting"><span>${label}</span><select data-generator="${id}">${options.split('|').map(item=>{const [key,text]=item.split(':');return `<option value="${key}">${text}</option>`;}).join('')}</select></label>`).join('')}<label class="setting"><span>Enemy budget</span><input data-generator="enemyBudget" type="number" min="2" max="12" value="4"></label><label class="setting"><span>Seed</span><input data-generator="seed" type="number" min="1" max="4294967295" value="${Math.floor(Math.random()*1000000)+1}"></label></div><label class="preset-field">Shared preset<textarea id="mission-preset" rows="3" maxlength="8192" placeholder="Generate or paste a versioned mission preset"></textarea></label><p id="generator-status" role="status">Custom missions use separate records.</p><div class="replay-toolbar"><button id="mission-generate">Generate preset</button><button id="mission-import">Validate pasted preset</button><button id="mission-copy">Copy preset</button><button id="mission-launch" class="primary" disabled>Launch custom mission</button></div>`);
    this.modal.querySelector('[data-generator=template]').addEventListener('change',e=>{if(e.target.value==='base-defence')this.modal.querySelector('[data-generator=location]').value='coast';});
    const status=text=>this.modal.querySelector('#generator-status').textContent=text,store=result=>{if(result?.ok===false){status(result.error || result.reason || 'Action could not finish.');return;}this.generatedMission=result?.preset || result?.mission || result;const serialized=this.game.exportMissionPreset?.(this.generatedMission) || JSON.stringify(this.generatedMission);this.modal.querySelector('#mission-preset').value=typeof serialized==='string'?serialized:JSON.stringify(serialized);this.modal.querySelector('#mission-launch').disabled=false;status('Preset validated. Share it or launch your sortie.');};
    this.modal.querySelector('#mission-generate').onclick=()=>{try{const values=Object.fromEntries([...this.modal.querySelectorAll('[data-generator]')].map(e=>[e.dataset.generator,e.type==='number'?Number(e.value):e.value]));if(!this.game.generateMission)throw new Error('Mission generator unavailable. Reload and try again.');store(this.game.generateMission(values));}catch(e){status(e.message);}};
    this.modal.querySelector('#mission-import').onclick=()=>{try{const text=this.modal.querySelector('#mission-preset').value;if(!this.game.importMissionPreset)throw new Error('Preset importer unavailable.');store(this.game.importMissionPreset(text));}catch(e){status(e.message);}};
    this.modal.querySelector('#mission-copy').onclick=async()=>{try{await navigator.clipboard.writeText(this.modal.querySelector('#mission-preset').value);status('Preset copied.');}catch{this.modal.querySelector('#mission-preset').select();status('Copy the selected preset text. Clipboard access was unavailable.');}};
    this.modal.querySelector('#mission-launch').onclick=()=>{if(this.generatedMission){const result=this.game.startOperation?.(this.generatedMission.template,{preset:this.generatedMission});if(result?.ok===false)status(result.error);}};
  },
  showCampaign(){
    this.modalType='campaign';const campaign=this.game.getCampaign?.();const sectors=campaign?.sectors || [];
    this.panel('CONNECTED SECTOR CAMPAIGN','Secure the strait',`<p>Sector outcomes change the next route and enemy budget. Solo campaign is saved on this device; party missions keep their own results.</p><svg class="campaign-map" viewBox="0 0 100 100" role="img" aria-label="Aegis Strait leads to Talon Ridge, then Sable Harbour"><path d="M24 75L47 23L78 62" fill="none" stroke="#74afc3" stroke-width="1"/>${sectors.map(s=>`<circle cx="${s.x}" cy="${s.y}" r="5" fill="${s.completed?'#77dca6':s.locked?'#485e6c':'#9adcf7'}"/>`).join('')}</svg><div class="stack-buttons">${sectors.map(s=>`<button data-sector="${s.id}" ${s.locked?'disabled':''}><b>${escapeHTML(s.name)}</b><span>${escapeHTML(s.status)}</span><small>${escapeHTML(s.consequence)}</small></button>`).join('')}</div><p id="campaign-status" role="status">${campaign?.storageAvailable===false?'Storage unavailable: progress lasts for this session.':''}</p><div class="replay-toolbar"><button id="campaign-new">New campaign</button><button id="campaign-reset">Reset same seed</button></div>`);
    this.modal.querySelectorAll('[data-sector]').forEach(b=>b.onclick=()=>{const result=this.game.startCampaignSector?.(b.dataset.sector);if(result?.ok===false)this.modal.querySelector('#campaign-status').textContent=result.error;});
    for(const [id,method] of [['campaign-new','newCampaign'],['campaign-reset','resetCampaign']])this.modal.querySelector('#'+id).onclick=()=>{if(window.confirm('Replace this local campaign progress?')){this.game[method]();this.showCampaign();}};
  },
  showActivities(){
    const online=this.game.multiplayer?.active,canStart=!online||this.game.multiplayer.isHost;
    this.modalType='activities';this.panel('FREE FLIGHT ACTIVITIES','Fly together, compete gently',`<p>${online?'The room host starts a shared activity. Everyone sees the same countdown and results. Flight continues while this panel is open.':'Practise solo, or start these activities in a Free Flight friends room. Results stay separate from combat XP.'}</p><p id="activity-live" role="status"></p><div id="activity-results"></div><div class="stack-buttons">${[['formation','Formation challenge'],['race','Checkpoint race'],['landing','Landing accuracy']].map(([id,name])=>`<button data-activity="${id}" ${canStart?'':'disabled'}>${name}</button>`).join('')}<button id="activity-cancel" ${canStart?'':'disabled'}>Cancel current activity</button><button data-action="close">Back to flight</button>${online?'':'<button data-action="multiplayer">Play with Friends</button>'}</div><p id="activity-status" role="status"></p>`);
    this.modal.querySelectorAll('[data-activity]').forEach(b=>b.onclick=()=>{const result=this.game.startActivity?.(b.dataset.activity);if(result?.ok===false)this.modal.querySelector('#activity-status').textContent=result.error;});
    this.modal.querySelector('#activity-cancel').onclick=()=>{this.game.cancelActivity?.();this.updateActivityPanel();};this.activityPanelKey=null;this.updateActivityPanel();
  },
  updateActivityPanel(){
    const g=this.game,a=currentActivity(g),online=g.multiplayer?.active,localId=online?g.multiplayer.localId:g.player.id;
    const live=this.modal.querySelector('#activity-live');if(!live)return;live.textContent=activitySummary(a,localId);
    const key=JSON.stringify(a?.results || null);if(key!==this.activityPanelKey){const names=new Map([[String(localId),online?g.multiplayer.localName:'You']]);for(const p of g.multiplayer?.publicRoster || [])names.set(p.id,p.name);for(const p of g.localCoop?.players || [])names.set(String(p.id),p.callsign || 'Local pilot');this.modal.querySelector('#activity-results').innerHTML=activityResultsMarkup(a,names);this.activityPanelKey=key;}
  },
};
