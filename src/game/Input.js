class Input {
  constructor(canvas, action, isPlaying) {
    this.keys = /* @__PURE__ */ new Set();
    this.mouse = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };
    this.fire = false;
    this.boost = false;
    this.touchActive = false;
    this.freeLook = false;
    this.levelTimer = 0;
    const blocked = ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab", "ControlLeft", "ControlRight", "PageUp", "PageDown"];
    window.addEventListener("keydown", (e) => {
      if (e.code !== "Escape" && e.target?.closest?.("input,select,textarea,[contenteditable=true]")) return;
      if ((e.code === "Space" || e.code === "Enter") && e.target?.closest?.("button")) return;
      if (isPlaying() && (blocked.includes(e.code) || /^Key[WASDQEBRFCHXVGLZ]$/.test(e.code) || /^Numpad[0-9]$/.test(e.code))) e.preventDefault();
      this.keys.add(e.code);
      if (!e.repeat) action(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => {
      this.clear();
      action("Blur");
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.clear();
        action("Blur");
      }
    });
    window.addEventListener("mousemove", (e) => {
      this.mouse.x = (e.clientX / innerWidth - 0.5) * 2;
      this.mouse.y = (e.clientY / innerHeight - 0.5) * 2;
      this.look.x = this.mouse.x;
      this.look.y = this.mouse.y;
    });
    window.addEventListener("mouseleave", () => {
      this.mouse.x = 0;
      this.mouse.y = 0;
    });
    canvas.addEventListener("mousedown", (e) => {
      if (!isPlaying()) return;
      if (e.button === 0) this.fire = true;
      if (e.button === 2) action("Missile");
    });
    window.addEventListener("mouseup", () => this.fire = false);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  clear() {
    this.keys.clear();
    this.fire = false;
    this.boost = false;
    this.mouse.x = 0;
    this.mouse.y = 0;
    this.levelTimer = 0;
    this.touchActive = false;
    this.look.x = this.look.y = 0;
  }
}
export {
  Input
};
