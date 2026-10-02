# Skybreak flaw fixes — 29 September 2026 (IST)

Audit base: `4ff74373ad4df2ac342a66c62c26494e3c02455d`. Candidate remains 2.0.0-rc.1 / protocol 2; controls schema is now version 5. This is a preview candidate, not a production acceptance claim.

**Audit ke saare 6 code bugs fix hue. Campaign completion handler ka ek additional bug bhi fix hua.** Desired behavior ke 14 targeted regression tests pass hain; full suite **206/206 pass**, zero skipped. Details: `tests/flaw-regressions.test.js` and `evidence/flaw-fixes/`.

| Audit item | Fix | Verified behavior |
|---|---|---|
| A01 custom/campaign Restart | Immutable launch context; seed, preset, campaign ownership/sector and Open Skies difficulty preserved | New unique attempt; restarted campaign completion secures sector once and unlocks next sector; local two-seat restart retains both seats |
| A02 online Restart | Hide solo restart in online pilot menu; guard both restart and solo start APIs | No local teleport, mission replacement, offline enemy spawn or unintended server message |
| A03 room environment | Active room time/weather take priority; temporary hangar preview restores current environment | Settings and sky-cycle key cannot replace room environment; operation exit restores personal solo preferences |
| A04 reconnect budget | Count accepted-but-unusable sockets; reset budget after ready session stays connected for 10 seconds | Seven retries with bounded 600/1200/2400/4800/6000/6000/6000 ms backoff; failure stops retries; manual retry and disposal covered |
| A05 flare hints | Shared binding/device labels for warning and local-seat intro | Custom O and gamepad B warnings match actual controls |
| A06 training repeat | Reset missile timestamp and lesson/instructor state | 30-second prior lesson → restart → initial practice threat on fresh first simulation tick |
| Additional terminal-event bug | Explicit braces in mission event routing remove dangling `else` | Both failed and successful operations reach debrief; restarted campaign result updates progression |

## Easy Open Skies controls

- **↑ = nose up, ↓ = nose down. ←/→ bank aur coordinated turn.**
- **E / right mouse = missile**, one press per launch after valid lock. **Space / left mouse = cannon**, **X = flares**, **R = next target**.
- **Q/D = optional yaw aur runway steering**, W/S throttle, Shift boost, B brake, A recovery.
- Assisted mode mein **Gentler Open Skies steering ON by default**: pitch intent 18% aur roll intent 20% softer. Existing damping, coordinated turn aur release-to-level retained; manual throttle holds. Player ko extra speed, authority ya auto-fire nahi milta.
- Solo, local second seat aur online Open Skies co-op prediction same intent scaling use karte hain. Manual aur non-Open-Skies modes unchanged. Settings → Controls se gentler option off kar sakte ho.
- Old settings/saved profiles ek baar E missile layout par migrate hote hain. Old missile mapping aur E conflicts replace hote hain; other valid choices retained. New version-5 custom rebindings persist. Help, HUD, warnings, generated public help and playing guide updated.

## Evidence scope

- Baseline: 192/192 passed; final: 206/206 passed. Fourteen new regressions cover the audited lifecycle boundaries, terminal events, key press/repeat, migration, local co-op restart and cooperative input routing.
- Gentler steering first tick par respond karti hai, sustained bank/pitch original response se smaller hain, aur release par settle karti hai. Fixed-step paths match across simulated 30/60/144 render schedules. This is simulation consistency, not a measured GPU FPS claim.
- Production build and seven-page static validation pass. Vite still warns about main/Three.js chunks above 500 kB; measured load/GPU performance requires browser/device evidence.
- Graphics, physical controllers/touch/split-screen and actual flight feel require human browser/device acceptance. The prior local browser installation blocker remains; no rendered screenshots or human gameplay are claimed.
- Public protocol-2 WSS worker and TURN credentials still need an authorized service host/configuration. Frontend preview alone does not complete Internet multiplayer/relay voice release gates. Existing production is not promoted by this fix.

Playing instructions: [PLAYING_GUIDE_HINGLISH.md](PLAYING_GUIDE_HINGLISH.md). Feature statuses remain bounded by [UPGRADE40_MATRIX.md](UPGRADE40_MATRIX.md), with the new regression evidence supplementing earlier reports.
