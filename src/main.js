import "./style.css";
import { Game } from "./game/Game.js";
import { UI } from "./ui/UI.js";
import { AUDIO_DEFAULTS, normalizeAudioSettings } from "./game/SoundDesign.js";
const defaults = { quality: "clear", difficulty: "easy", input: "keyboard", sensitivity: 0.8, ...AUDIO_DEFAULTS, invert: false, shake: true, guideSeen: false, controlsVersion: 2 };
let saved = {};
try {
  saved = JSON.parse(localStorage.getItem("skybreak-settings") || "{}");
} catch {
}
if (!saved || typeof saved !== 'object') saved = {};
const settings = normalizeAudioSettings({ ...defaults, ...saved });
if (saved.controlsVersion !== 2) {
  settings.input = "keyboard";
  settings.guideSeen = false;
  settings.controlsVersion = 2;
}
for (const [key, allowed] of Object.entries({ quality: ["low", "clear", "medium", "high"], difficulty: ["easy", "medium", "hard"], input: ["mouse", "keyboard", "advanced"] })) if (!allowed.includes(settings[key])) settings[key] = defaults[key];
if (!Number.isFinite(settings.sensitivity)) settings.sensitivity = defaults.sensitivity;
const ui = new UI(document.getElementById("app"), settings);
try {
  const game = new Game(document.getElementById("world"), ui, settings);
  ui.attach(game);
} catch (error) {
  console.error(error);
  document.getElementById("app").innerHTML = '<div class="unsupported"><h1>WebGL 2 is required.</h1><p>Enable graphics acceleration in your browser settings, then reload this page.</p><button onclick="location.reload()">Try again</button></div>';
}
