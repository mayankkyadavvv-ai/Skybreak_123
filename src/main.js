import "./style.css";
import "./upgrade.css";
import { Game } from "./game/Game.js";
import { UI } from "./ui/UI.js";
import { normalizeSettings } from './game/Settings.js';
let saved = {};
try { saved = JSON.parse(localStorage.getItem('skybreak-settings') || '{}'); } catch {}
const { settings, notices } = normalizeSettings(saved, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const ui = new UI(document.getElementById("app"), settings);
try {
  const game = new Game(document.getElementById("world"), ui, settings);
  window.game = game;
  window.addEventListener("pagehide",event=>{if(!event.persisted)game.dispose();});
  ui.attach(game);
  if (notices.length) { ui.settingsNotices = notices; ui.message(notices[0], 10); }
  ui.saveSettings(true);
  const bootLoader = document.getElementById("preflight-boot-loader");
  if (bootLoader) {
    bootLoader.classList.add("boot-complete");
    setTimeout(() => bootLoader.remove(), 650);
  }
} catch (error) {
  console.error(error);
  const bootLoader = document.getElementById("preflight-boot-loader");
  if (bootLoader) bootLoader.remove();
  document.getElementById("app").innerHTML = '<div class="unsupported"><h1>Graphics could not start.</h1><p>Skybreak needs WebGL 2 and browser graphics acceleration. Check the console for the startup error.</p><button id="retry-graphics">Try again</button><a href="/help">Controls &amp; help</a></div>';
  document.getElementById('retry-graphics').addEventListener('click', () => location.reload());
}
