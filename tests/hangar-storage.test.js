import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {HangarUI} from '../src/ui/HangarUI.js';
import {DEFAULT_PLAYER_CONFIG} from '../src/game/JetConfigs.js';

test('hangar weapon tab uses real loadout options and stat deltas without missing categories',()=>{
 const {document,window}=parseHTML('<html><body><main></main></body></html>');Object.assign(globalThis,{document,window});
 const game={jetConfig:DEFAULT_PLAYER_CONFIG,equipJet(){},ui:{message(){}}};const ui=new HangarUI(document.querySelector('main'),game,()=>{});
 ui.activeTab='weapons';ui.render();const cards=[...document.querySelectorAll('[data-mod-cat="weapons"]')];assert.equal(cards.length,3);assert.ok(cards.every(card=>card.getAttribute('role')==='button'));assert.match(document.body.textContent,/\+2 missiles/);assert.doesNotMatch(document.body.textContent,/undefined|NaN/);ui.close();
});
test('storage reset needs explicit confirmation and preserves unrelated origin data',()=>{
 const {document}=parseHTML(readFileSync('public/storage.html','utf8'));
 const keys=['skybreak-settings','skybreak_jet_config_v1','skybreak_pilot_profile_v1','skybreak_pilot_name','skybreak_server_url'];const data=new Map([...keys.map(k=>[k,'stored']),['unrelated','keep']]);
 const dialog=document.getElementById('reset-confirmation');let visible=false;dialog.showModal=()=>{visible=true};dialog.close=()=>{visible=false};
 vm.runInNewContext(readFileSync('public/storage.js','utf8'),{document,localStorage:{getItem:key=>data.get(key)??null,removeItem:key=>data.delete(key)}});
 document.getElementById('reset-data').click();assert.equal(visible,true);assert.equal(data.size,6);document.getElementById('cancel-reset').click();assert.equal(data.size,6);
 document.getElementById('reset-data').click();document.getElementById('confirm-reset').click();assert.equal(data.size,1);assert.equal(data.get('unrelated'),'keep');assert.equal(visible,false);
});
