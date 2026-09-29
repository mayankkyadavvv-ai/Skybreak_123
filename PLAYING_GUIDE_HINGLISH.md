# Skybreak 2.0 RC — kaise khelein

Yeh guide F01–F40 candidate source ke liye hai. Existing live site ko is candidate ke saath abhi replace nahi kiya gaya. Automated checks aur actual device/playtest status `UPGRADE40_MATRIX.md` mein hain.

## Pehli flight

1. **Training → Climb** se shuru karo. Phir turn, throttle, target/lock, flares aur landing lessons try karo. Har lesson actual aircraft movement/action check karta hai; Reset aur Skip available hain.
2. **Settings → Controls:** Keyboard, Assisted, Easy rakho. Default **↑ nose up** aur **↓ nose down** hain. Keyboard inversion off rakho; custom bindings Help mein turant dikhte hain.
3. **Solo → Free Flight** kholo. W se throttle badhao, S se kam karo. Key chhodne par throttle hold hota hai. Chhote arrow inputs do; turn ke saath thoda nose-up useful hai.
4. Ground se takeoff: W dabao, Q/D se runway par seedha rakho, 55 m/s se upar ↑ dabao, airborne hone par G se gear retract karo. Space cannon hai.
5. **A** terrain-aware recovery deta hai. Steering se turant manual control wapas milta hai. Bahut low/fast descent mein recovery physically possible na ho to warning milegi.

## Keyboard defaults

| Control | Kaam |
|---|---|
| ↑ / ↓ | Nose up / nose down |
| ← / → | Bank/turn left / right |
| Q / D | Yaw; runway steering |
| W / S | Throttle increase / decrease |
| Shift | Afterburner, hold |
| B | Air/wheel brake, hold |
| Space / left mouse | Cannon, hold |
| E / right mouse | Missile; har press par ek launch, valid lock zaroori |
| X | Flares |
| R / [ | Next / previous target |
| F | Priority threat select |
| G | Landing gear |
| A | Recovery assistance |
| C / V | Camera cycle / cockpit-chase toggle |
| K | Selected-target chase camera tracking |
| Middle mouse / Z | Free look / mouse recenter |
| N / L | Tactical map / airbase approach panel |
| Y | Solo squadron orders; online team comms |
| U | Online all-player quick comms |
| P | Push to talk, voice enable karne ke baad |
| Tab | Online scoreboard, hold |
| H / Esc | Help / pause-back |

Is update mein purane settings aur saved profiles ek baar **E missile / D right-yaw** layout par migrate hote hain. Purani missile key aur E par assigned action reset hote hain; baaki valid custom bindings retain hote hain. Iske baad apni binding badal sakte ho—Help, HUD, warnings aur training current key/device dikhate hain.

## Controls ko apne hisaab se set karo

Settings → Controls ka live preview pitch/roll response dikhata hai. Controller ko neutral rakh kar **Measure controller drift** dabao; movement ke samples reject hote hain. Apne keyboard/mouse/controller settings ka named profile Save/Load karo. Touch layout mein controls drag, size aur left/right handed layout badal sakte ho. **Save** actual flight buttons ko move karta hai; overlap wale buttons paas ki khaali jagah mein fit hote hain. Cancel purana layout rakhta hai. **Reset → Save** responsive default placement wapas laata hai. Screen rotate karne par saved controls safe edges ke andar fit hote hain.

Mouse ke liye Virtual stick ya optional **Point to fly** choose karo. Pointer ki taraf aircraft normal turn limits ke andar mudta hai. Free look steering se alag hai. Camera sensitivity aur reduced motion alag settings hain. Auto-cruise optional hai; landing aur direct throttle input ko priority milti hai. Recovery aur auto-cruise online bhi normal server flight limits follow karte hain.

Standard gamepad: left stick pitch/roll, right stick look, shoulders yaw, RT cannon, LT brake, A missile, B flares, X next target, Y camera. D-pad up/down throttle, left map, right gear; left-stick click boost, Menu pause. Default left stick ko peeche kheenchne par nose up hota hai. View/Back squad controls kholta hai. Controller labels brand ke hisaab se badal sakte hain.

## Open Skies aur naye solo missions

**Solo → Open Skies** mein patrol, reinforcements aur VIPER phases complete karo. R se deliberate target select karo, reticle ke paas rakho, **LOCKED** par E dabao. Incoming missile warning par X flares aur turn use karo. Cloud/terrain IR lock ko break kar sakte hain; radar aur visual contact alag hain. Graphics Low karne se authoritative sensors improve nahi hote.

Easy setup: **Settings → Controls → Assisted + Gentler Open Skies steering ON**. Yeh default hai. Arrows se chhote climb/turn inputs do; release karne par jet level hota hai. Pitch input 18% aur bank input 20% gentler hai; normal flight limits same hain. Q/D optional yaw hai—normal turns arrows se ho jaate hain. W/S chhodne par selected throttle hold rahega. Confused ho toh **A** recovery, target choose karne ke liye **R**, fire **E**, defence **X**. E ko hold karne se repeated missiles nahi nikalti; next valid lock par dobara press karo. Original handling ke liye gentler option off karo; Manual par yeh extra scaling apply nahi hoti. Solo, local co-op aur online Open Skies co-op inputs same rule use karte hain.

**Restart / Fly again** wahi encounter seed aur difficulty, ya custom mission preset aur campaign sector preserve karta hai; har attempt alag result ID use karta hai. Training Restart lesson ka progress/timer reset karta hai. Online match ke beech Restart nahi hota; result ke baad host squadron ko lobby mein le ja sakta hai.

Y orders panel mein **1 Cover, 2 Attack target, 3 Regroup**. Damaged wingman ko regroup/cover do. Solo panel pause karta hai; online panel shared match ko pause nahi karta.

Four operation templates available hain: **escort** mein transport bachao; **interception** mein bombers ko objective tak pahunchne se roko; **base defence** mein airbase protect karo; **strike support** mein friendly strike aircraft ko route complete karne do. Briefing ka objective follow karo; sirf fighter kills hamesha victory nahi dete.

**Solo → Campaign** mein Aegis Strait, Talon Ridge aur Sable Harbour linked hain. Transport protection aur sector results agla route/enemy budget badalte hain. Progress isi browser mein save hota hai. New/Reset confirmation purani campaign replace karta hai. Campaign solo-owned hai; party missions us save ko update nahi karte.

**Mission generator** mein template, location, difficulty, weather, budget aur seed choose karo; Generate → Launch. Preset copy karke friend ko do; woh Validate pasted preset kare. Online co-op room ka host lobby mein validated preset paste kar sakta hai. Standard Open Skies records aur custom/adaptive results alag hain.

## Free Flight activities

**Solo → Races, formation & landing challenges**, ya online Free Flight mein **ACTIVITIES** kholo. Online host activity start/cancel karta hai; doosre pilots same countdown aur results dekhte hain.

- **Race:** chhe visible rings order mein cross karo. Teleport/reset se checkpoints award nahi hote. Finish time ranking hai; near-simultaneous finish tie ho sakta hai.
- **Formation:** apne guide ring ke paas 155 m/s aur sahi heading maintain karo. Aligned time se score banta hai.
- **Landing:** marked runway par gear down, gentle descent aur roughly 35–115 m/s approach. Centreline, sink rate aur heading score decide karte hain. Ground par spawn karna valid landing nahi hai.

Activities panel results dikhata hai; same activity dobara start karna rematch hai. Activity cancel ke baad ordinary Free Flight continue hota hai. Activity results combat XP nahi dete.

**Offline practice shortcut:** Play with Friends → **Ace Duel vs AI** ya **Solo Free Flight** bina online server ke chalta hai. Ace Duel mein ek hostile ace milta hai; Free Flight mein enemies nahi hain. Restart isi selected mode ko dobara shuru karta hai.

## Doston ke saath online

Compatible **protocol 2 secure match server** configured hona zaroori hai. Static Vercel page load hona multiplayer service ka proof nahi hai.

1. **Play with Friends** → callsign enter → Create/Open Skies co-op, Air Superiority ya Free Flight room.
2. Invite link/QR ya room code share karo. Friends join, aircraft choose aur Ready karein; loading complete hone par host Start kare.
3. Co-op mein 2–4 humans same authoritative mission play karte hain; available squad slots mein AI fill hota hai. Damage/objectives sabke liye server decide karta hai.
4. Air Superiority mein marked zone ke altitude band mein raho. Opposing team present ho to contested; secured zone points deta hai. Spawn shield attack karne par hat jata hai. Online airframes stock/equal budget use karte hain.
5. Y quick comms aur target/help pings use karo; teammate ping click karke acknowledge kar sakta hai.
6. Voice optional: **VOICE → Enable microphone**, permission allow, P hold karke bolo. Mute/deafen/per-pilot volume available hain. Missing TURN par cross-network voice guaranteed nahi hai. Leaving party tracks/connections stop karta hai. Relay credentials expiry se pehle automatically renew hote hain; renewal fail ho toh microphone band hota hai aur retry message aata hai. Lobby mein team ya mode badalne par voice off hoti hai—new squad ke liye Enable microphone dobara dabao.
7. Disconnect par 45-second reservation hai; aircraft world mein live rehta hai aur damage le sakta hai. Resume same player state laata hai. Worker restart ya grace expiry par purani match recover nahi hoti.
8. Debrief → Party & Vote ya host Rematch. Same party invite reuse hota hai.

## Same Wi-Fi / same computer

**LAN:** `LAN_PLAY_GUIDE.md` follow karo. Host ko Node.js 22+ pehle install chahiye. ZIP extract → `START_SKYBREAK_LAN.cmd` → printed LAN address friend ke browser mein. Initial setup ke baad assets/server offline chal sakte hain. Firewall disable ya public port forwarding mat karo. Actual two-device internet-disconnected test pending hai.

**Split-screen:** main menu **Local co-op**, Free Flight ya Open Skies, phir Keyboard + controller ya Two controllers. Controller par button press karke browser ko device detect karwao. Har seat ka camera, target, ammo HUD aur menu alag hai. Ek pilot ka menu doosre ka flight pause nahi karta. Controller disconnect par us seat ke controls clear hote hain; same controller reconnect karo aur held buttons release karo. Open Skies mein ek pilot down ho to doosra continue kar sakta hai. Restart shared sortie restart karta hai. Performance ke liye Low/Medium try karo; physical controller/GPU validation abhi pending hai.

## Damage, repair aur debrief

Engine damage thrust kam, wing damage handling kam aur sensor damage acquisition slow karta hai. HUD system percentages dikhata hai. Valid airbase runway par land karke rukne se repair/rearm milta hai; airborne ya remote repair accept nahi hota.

Debrief mein timeline/advice aur **Watch recorded sortie** hai. Replay recorded tactical state ka playback hai; seek/play se score ya XP change nahi hota. Play/pause, speed, best 20 seconds, JSON export aur PNG save available hain. Exported JSON ko Solo → Recorded sorties se import karo. Video export unavailable hai. Recording bounded hai aur hidden enemy positions save nahi hoti.

Graphics mein lighting/weather, Compact/Full HUD, contrast, subtitles aur adaptive quality available hain. Adaptive mode cosmetic budgets badalta hai; saved preset aur simulation rules ko change nahi karta. Actual laptop/mobile FPS aur visual polish ke pending checks matrix mein listed hain.
