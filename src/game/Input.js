import { ACTIONS, actionForCode, chordFromEvent, readGamepad } from './InputActions.js';
import * as T from 'three';
class Input {
  constructor(canvas, action, isPlaying, getSettings = () => ({})) {
    this.canvas = canvas; this.action = action; this.isPlaying = isPlaying; this.getSettings = getSettings;
    this.keys = new Set(); this.heldActions = new Set(); this.keyCodes = new Map();
    this.physicalKeys=new Set();this.blockedKeys=new Set();this.blockedPadActions=new Set();
    this.mouse = { x: 0, y: 0 }; this.look = { x: 0, y: 0 };
    this.pointAim = null; this._aimVector = new T.Vector3(); this.padIndexOverride = null;
    this.axes = { pitch: 0, roll: 0, lookX: 0, lookY: 0, brake: 0 };
    this.fire = false; this.boost = false; this.touchActive = false; this.freeLook = false; this.levelTimer = 0;
    this.padHeld = new Set(); this.padStatus = 'No controller connected'; this.padConnected = false;
    this.listeners = [];
    const on = (target, type, fn) => { target.addEventListener(type, fn); this.listeners.push(() => target.removeEventListener(type, fn)); };
    on(window, 'keydown', event => {
      const alreadyDown = this.physicalKeys.has(event.code);
      this.physicalKeys.add(event.code);
      if (event.code === 'Escape') { if (!event.repeat) { this.clear(); action('pause'); } return; }
      if(this.keyboardDisabled || this.blockedKeys.has(event.code))return;
      if (!isPlaying() || event.target?.closest?.('input,textarea,select,button,a,[contenteditable]:not([contenteditable="false"])')) return;
      const chord = chordFromEvent(event);
      const code = actionForCode(chord, getSettings()) ? chord : (!event.ctrlKey && !event.altKey && !event.metaKey ? event.code : chord);
      const name = actionForCode(code, getSettings());
      if (!name) return;
      event.preventDefault(); this.keys.add(code); this.keyCodes.set(event.code, code);
      if (!event.repeat && !alreadyDown) this.dispatch(name);
    });
    on(window, 'keyup', event => {
      this.physicalKeys.delete(event.code);this.blockedKeys.delete(event.code);
      this.keys.delete(this.keyCodes.get(event.code) || event.code); this.keyCodes.delete(event.code);
      if (/^(Shift|Control|Alt|Meta)/.test(event.code)) for (const code of this.keys) if (code.includes('+')) this.keys.delete(code);
    });
    on(window, 'blur', () => { this.clear();this.physicalKeys.clear();this.blockedKeys.clear();action('Blur'); });
    on(document, 'focusin', event => {
      if (event.target?.closest?.('input,textarea,select,button,a,[contenteditable]:not([contenteditable="false"])')) this.clear();
    });
    on(document, 'visibilitychange', () => { if (document.hidden) { this.clear(); action('Blur'); } });
    on(document, 'pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      if (this.pointerLocked && !locked) { this.clear(); action('Blur'); }
      this.pointerLocked = locked;
    });
    on(document, 'pointerlockerror', () => { this.lockError = 'Pointer lock unavailable. Unlocked mouse steering is active.'; });
    on(window, 'mousemove', event => {
      if (!isPlaying() || this.touchActive) return;
      if (this.freeLook) {
        this.look.x = Math.max(-1, Math.min(1, this.look.x + (event.movementX || 0) / 350));
        this.look.y = Math.max(-1, Math.min(1, this.look.y + (event.movementY || 0) / 350));
        return;
      }
      if ((getSettings().device || getSettings().input) !== 'mouse') return;
      if (document.pointerLockElement === canvas) {
        this.mouse.x = Math.max(-1, Math.min(1, this.mouse.x + (event.movementX || 0) / 320));
        this.mouse.y = Math.max(-1, Math.min(1, this.mouse.y + (event.movementY || 0) / 320));
      } else {
        const rect = canvas.getBoundingClientRect();
        this.mouse.x = Math.max(-1, Math.min(1, (event.clientX - rect.left) / (rect.width || innerWidth) * 2 - 1));
        this.mouse.y = Math.max(-1, Math.min(1, (event.clientY - rect.top) / (rect.height || innerHeight) * 2 - 1));
      }
      if(getSettings().mouseMode==='point-to-fly' && this.aimCamera) {
        this._aimVector.set(this.mouse.x,this.mouse.y*(getSettings().mouseInvert?1:-1),.5).unproject(this.aimCamera).sub(this.aimCamera.position).normalize();
        this.pointAim ||= {x:0,y:0,z:-1};Object.assign(this.pointAim,{x:this._aimVector.x,y:this._aimVector.y,z:this._aimVector.z});
      }
    });
    on(window, 'mouseleave', () => { if (!this.pointerLocked) this.recenter(); });
    on(canvas, 'mousedown', event => {
      this.physicalKeys.add(`Mouse${event.button}`);
      if(this.keyboardDisabled || this.blockedKeys.has(`Mouse${event.button}`))return;
      if (!isPlaying()) return;
      event.preventDefault();
      if (event.button === 0 && getSettings().device === 'mouse' && getSettings().mouseLock && !this.pointerLocked && !this.lockError) { this.requestPointerLock(); return; }
      const code = `Mouse${event.button}`, name = actionForCode(code, getSettings());
      if (!name) return;
      this.keys.add(code);
      if (name === 'freeLook') { this.freeLook = true; this.recenter(); }
      else if (!['held','axis'].includes(ACTIONS[name].kind)) this.dispatch(name);
    });
    on(window, 'mouseup', event => {
      this.physicalKeys.delete(`Mouse${event.button}`);this.blockedKeys.delete(`Mouse${event.button}`);
      this.keys.delete(`Mouse${event.button}`);
      if (event.button === 1) this.freeLook = false;
      if (event.button === 0) this.fire = false;
    });
    on(canvas, 'contextmenu', event => event.preventDefault());
    let lookPointer=null,lookX=0,lookY=0;
    this.clearTouchLook=()=>{const id=lookPointer;lookPointer=null;if(id!==null && canvas.hasPointerCapture?.(id))canvas.releasePointerCapture?.(id);};
    on(canvas,'pointerdown',event=>{
      if(event.pointerType!=='touch'||!isPlaying()||lookPointer!==null)return;
      lookPointer=event.pointerId;lookX=event.clientX;lookY=event.clientY;
      canvas.setPointerCapture?.(lookPointer);
    });
    on(canvas,'pointermove',event=>{
      if(event.pointerId!==lookPointer||!isPlaying())return;
      const gain=(getSettings().touchCameraSensitivity??1)/250;
      this.look.x=Math.max(-1,Math.min(1,this.look.x+(event.clientX-lookX)*gain));
      this.look.y=Math.max(-1,Math.min(1,this.look.y+(event.clientY-lookY)*gain));
      lookX=event.clientX;lookY=event.clientY;this.touchLooking=true;this.freeLook=true;
    });
    const stopLook=event=>{if(event.pointerId!==lookPointer)return;lookPointer=null;this.touchLooking=false;this.freeLook=false;};
    for(const type of ['pointerup','pointercancel','lostpointercapture'])on(canvas,type,stopLook);
  }
  dispatch(name) {
    if (name === 'recenter') this.recenter();
    else if (name === 'levelFlight') this.levelTimer = 3;
    else this.action(name);
  }
  requestPointerLock() {
    this.recenter();
    if (!this.canvas.requestPointerLock) { this.lockError = 'Pointer lock is not supported. Unlocked mouse steering is active.'; return; }
    try { this.canvas.requestPointerLock()?.catch?.(() => { this.lockError = 'Pointer lock was denied. Unlocked mouse steering is active.'; }); }
    catch { this.lockError = 'Pointer lock is unavailable. Unlocked mouse steering is active.'; }
  }
  poll(dt, pads) {
    if(!pads){try{pads=globalThis.navigator?.getGamepads?.() || [];}catch{pads=[];this.padStatus='Controller access unavailable';}}
    const settings = this.getSettings();
    const selected=this.padIndexOverride??settings.gamepadIndex??-1;
    const pad = selected>=0?Array.from(pads).find(value=>value?.index===selected&&value.connected!==false):Array.from(pads).find(value => value?.connected !== false && value);
    const state = readGamepad(pad, settings.gamepadDeadzone ?? .14);
    for(const name of this.blockedPadActions)if(!state.held.has(name))this.blockedPadActions.delete(name);
    this.padStatus = !pad ? 'No controller connected' : state.supported ? 'Standard controller connected' : 'Unsupported mapping: use keyboard or mouse';
    this.padPreview = state;this.padRawAxes=pad?.axes?Array.from(pad.axes):[];this.padId=pad?.id || '';this.padIndex=pad?.index??-1;
    const playing=this.isPlaying();
    if(settings.device==='gamepad'){
      if(this.padConnected && !pad && playing){this.clear();this.action('Blur');}
      if (this.menuMode === 'squadron') {
        const buttons = new Set(Object.entries({ 0:'uiConfirm', 1:'pause', 8:'teamComms', 9:'pause', 12:'uiPrevious', 13:'uiNext' }).filter(([i]) => pad?.buttons?.[i]?.pressed).map(([, name]) => name));
        for (const name of buttons) if (!this.menuButtons?.has(name)) this.action(name);
        this.menuButtons = buttons;
      } else if(playing){
        this.menuButtons = null;
        this.axes=state.axes;this.heldActions=new Set([...state.held].filter(name=>!this.blockedPadActions.has(name)));
        const edges=[...this.heldActions].filter(name=>!this.padHeld.has(name));
        const menuEdge=['pause','teamComms','tacticalMap'].find(name=>edges.includes(name));
        if(menuEdge)this.dispatch(menuEdge);
        if(!menuEdge)for(const name of edges)if(!['held','axis'].includes(ACTIONS[name].kind))this.dispatch(name);
        this.freeLook=Math.abs(state.axes.lookX)+Math.abs(state.axes.lookY)>.03;
        if(this.freeLook){this.look.x=state.axes.lookX;this.look.y=state.axes.lookY;}
      }else{
        for(const name of ['pause','tacticalMap'])if(state.held.has(name) && !this.padHeld.has(name))this.action(name);
        for(const name of state.held)if(name!=='pause')this.blockedPadActions.add(name);
      }
      this.padHeld=new Set(state.held);
    }else this.padHeld.clear();
    if(settings.device!=='gamepad' || !this.isPlaying()){
      this.heldActions.clear();this.axes={pitch:0,roll:0,lookX:0,lookY:0,brake:0};
    }
    this.padConnected = !!pad;
    if (!this.freeLook) { this.look.x *= Math.exp(-5 * dt); this.look.y *= Math.exp(-5 * dt); }
    if (this.pointerLocked && !this.freeLook && settings.mouseMode!=='point-to-fly' && settings.mouseRecenter !== 'hold') { this.mouse.x *= Math.exp(-2.8 * dt); this.mouse.y *= Math.exp(-2.8 * dt); }
  }
  recenter() { this.mouse.x = 0; this.mouse.y = 0; this.pointAim=null; }
  clear() {
    for(const code of this.physicalKeys)this.blockedKeys.add(code);
    for(const action of this.padHeld)this.blockedPadActions.add(action);
    this.clearTouchLook?.();
    this.keys.clear(); this.keyCodes.clear(); this.heldActions.clear(); this.padHeld.clear();
    this.fire = false; this.boost = false; this.touchActive = false; this.freeLook = false; this.levelTimer = 0;
    this.touchThrottle=null;this.touchBrake=false;
    this.touchLooking=false;
    this.recenter(); this.look.x = 0; this.look.y = 0;
    for (const key of Object.keys(this.axes)) this.axes[key] = 0;
  }
  dispose() { for (const remove of this.listeners) remove(); this.listeners.length = 0; this.clear(); }
}
export { Input };
