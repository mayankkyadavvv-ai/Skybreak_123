import { ACTIONS, actionForCode, chordFromEvent, readGamepad } from './InputActions.js';
class Input {
  constructor(canvas, action, isPlaying, getSettings = () => ({})) {
    this.canvas = canvas; this.action = action; this.isPlaying = isPlaying; this.getSettings = getSettings;
    this.keys = new Set(); this.heldActions = new Set(); this.keyCodes = new Map();
    this.mouse = { x: 0, y: 0 }; this.look = { x: 0, y: 0 };
    this.axes = { pitch: 0, roll: 0, lookX: 0, lookY: 0, brake: 0 };
    this.fire = false; this.boost = false; this.touchActive = false; this.freeLook = false; this.levelTimer = 0;
    this.padHeld = new Set(); this.padStatus = 'No controller connected'; this.padConnected = false;
    this.listeners = [];
    const on = (target, type, fn) => { target.addEventListener(type, fn); this.listeners.push(() => target.removeEventListener(type, fn)); };
    on(window, 'keydown', event => {
      if (event.code === 'Escape') { if (!event.repeat) { this.clear(); action('pause'); } return; }
      if (!isPlaying() || event.target?.closest?.('input,textarea,select,button,a,[contenteditable]:not([contenteditable="false"])')) return;
      const chord = chordFromEvent(event);
      const code = actionForCode(chord, getSettings()) ? chord : (!event.ctrlKey && !event.altKey && !event.metaKey ? event.code : chord);
      const name = actionForCode(code, getSettings());
      if (!name) return;
      event.preventDefault(); this.keys.add(code); this.keyCodes.set(event.code, code);
      if (!event.repeat) this.dispatch(name);
    });
    on(window, 'keyup', event => {
      this.keys.delete(this.keyCodes.get(event.code) || event.code); this.keyCodes.delete(event.code);
      if (/^(Shift|Control|Alt|Meta)/.test(event.code)) for (const code of this.keys) if (code.includes('+')) this.keys.delete(code);
    });
    on(window, 'blur', () => { this.clear(); action('Blur'); });
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
    });
    on(window, 'mouseleave', () => { if (!this.pointerLocked) this.recenter(); });
    on(canvas, 'mousedown', event => {
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
      this.keys.delete(`Mouse${event.button}`);
      if (event.button === 1) this.freeLook = false;
      if (event.button === 0) this.fire = false;
    });
    on(canvas, 'contextmenu', event => event.preventDefault());
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
    const pad = Array.from(pads).find(value => value?.connected !== false && value);
    const state = readGamepad(pad, settings.gamepadDeadzone ?? .14);
    this.padStatus = !pad ? 'No controller connected' : state.supported ? 'Standard controller connected' : 'Unsupported mapping: use keyboard or mouse';
    this.padPreview = state;
    const playing=this.isPlaying();
    if(settings.device==='gamepad'){
      if(this.padConnected && !pad && playing){this.clear();this.action('Blur');}
      if(playing){
        this.axes=state.axes;this.heldActions=new Set(state.held);
        for(const name of state.held)if(!this.padHeld.has(name) && !['held','axis'].includes(ACTIONS[name].kind))this.dispatch(name);
        this.freeLook=Math.abs(state.axes.lookX)+Math.abs(state.axes.lookY)>.03;
        if(this.freeLook){this.look.x=state.axes.lookX;this.look.y=state.axes.lookY;}
      }else{
        for(const name of ['pause','tacticalMap'])if(state.held.has(name) && !this.padHeld.has(name))this.action(name);
      }
      this.padHeld=new Set(state.held);
    }else this.padHeld.clear();
    if(settings.device!=='gamepad' || !this.isPlaying()){
      this.heldActions.clear();this.axes={pitch:0,roll:0,lookX:0,lookY:0,brake:0};
    }
    this.padConnected = !!pad;
    if (!this.freeLook) { this.look.x *= Math.exp(-5 * dt); this.look.y *= Math.exp(-5 * dt); }
    if (this.pointerLocked && !this.freeLook && settings.mouseRecenter !== 'hold') { this.mouse.x *= Math.exp(-2.8 * dt); this.mouse.y *= Math.exp(-2.8 * dt); }
  }
  recenter() { this.mouse.x = 0; this.mouse.y = 0; }
  clear() {
    this.keys.clear(); this.keyCodes.clear(); this.heldActions.clear(); this.padHeld.clear();
    this.fire = false; this.boost = false; this.touchActive = false; this.freeLook = false; this.levelTimer = 0;
    this.touchThrottle=null;this.touchBrake=false;
    this.recenter(); this.look.x = 0; this.look.y = 0;
    for (const key of Object.keys(this.axes)) this.axes[key] = 0;
  }
  dispose() { for (const remove of this.listeners) remove(); this.listeners.length = 0; this.clear(); }
}
export { Input };
