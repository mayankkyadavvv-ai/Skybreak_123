**SKYBREAK — COMPLETE 40-FEATURE IMPLEMENTATION MASTER PROMPT**
Prepared for Mayank Yadav · 28 September 2026

Execution target: ChatGPT 6 Astra in an environment with access to the project source and the available coding, browser, testing and deployment tools. Use only capabilities actually available in that environment.

Use the complete contents of this file as one implementation assignment. This is the specification for work to execute, not a request to write another plan or generate another prompt.

You are the lead engineer responsible for taking Skybreak from its current working source to a polished, playable, tested release. Apply your strongest available reasoning, coding, debugging, game design, rendering, networking and verification capabilities. Make careful engineering decisions, explain the decisions that matter, and use available tools to produce and verify the actual implementation.

My product goal is a cinematic, accessible fighter-jet game that I can enjoy alone and with friends: online private rooms, Open Skies cooperative missions, same-network play on separate devices, and two-player play on one computer. Graphics, UI, controls and multiplayer reliability must improve together.

Implement ALL requirements F01–F40 below. Every feature must have a working user journey, integrated behaviour, appropriate persistence or lifecycle handling, and evidence for its acceptance criteria. Keep the feature IDs throughout implementation. Existing features count only after you inspect them and implement or verify the requested enhancement.

**How to work with me.**

- Progress updates, questions, player-facing help explanations and your final report must be in clear Hinglish. Source identifiers can remain English. Use consistent, concise English labels in the game, with a complete Hinglish playing guide.
- Execute the full assignment in dependency order. A milestone is a checkpoint inside this assignment, not permission to stop after an MVP.
- Make routine reversible implementation decisions yourself. Do not repeatedly ask whether to continue.
- Follow applicable system instructions, repository instructions and tool permissions. This prompt does not override them.
- Use existing authorized project resources. Before a genuinely new paid service, subscription, asset purchase or material spend, prepare the concrete option, cost/limits and required configuration, then request the necessary approval. Continue unrelated implementation while external access is pending.
- Never invent access, deployment success, screenshots, user testing, benchmark results, credentials, working multiplayer sessions or completed features.
- If specialist agents are available and permitted, delegate bounded tasks such as rendering, networking, UI and independent verification. Give each agent explicit ownership and acceptance criteria. Keep shared protocol, simulation and player-state changes coordinated by one integration owner. Review and integrate their work yourself. If agents are unavailable, execute the same work sequentially.
- Share a short update about once a minute during active work: completed work, actual findings, the next verification step and any concrete blocker. Keep private reasoning private; report decisions and evidence.

**Project context to verify before editing.**

The project is Skybreak, currently built with Three.js and Vite, with a Node/WebSocket multiplayer backend. The known repository is https://github.com/mayankkyadavvv-ai/Skybreak_123 and the existing public game URL is https://skybreak-iota.vercel.app/ . Discover and verify the current branch, latest source, deployment project, runtime and permissions before relying on this context. Do not revert newer work to an older snapshot.

The last inspected code contained these foundations:
- Assisted/manual flight, fixed-step simulation, rendering interpolation, keyboard/mouse/controller/touch input and configurable controls.
- Procedural aircraft, aircraft materials, environment lighting, ocean, terrain LOD, clouds, weather, bloom, quality settings and resource pools.
- Open Skies with three phases, two wingmen, wingman orders, role-based enemies, VIPER ace, seeded encounter setup, medals, XP and local personal bests.
- Separate Free Flight mode.
- WebSocket rooms, team selection, readiness, chat/quick comms, remote-player interpolation, respawning, teammate spectating and rematch.
- Server-side combat handling and bounded client telemetry validation, with room/match state primarily in memory.
- A reconnect flow that previously required starting/rejoining a match instead of fully restoring the previous player session.
- An existing cockpit interior whose player-model visibility needed inspection.
- Existing legal/help/public pages and validation scripts that must remain functional.

Treat those as inspection leads, not proof that a capability is complete or unchanged. Inspect package scripts, dependencies, actual call paths, existing tests, current UI and deployed behaviour. Do not count comments or unused functions as implemented functionality.

Useful last-known areas include src/game/Game.js, FlightPhysics.js, Input.js, InputActions.js, Settings.js, Camera.js, Jet.js, JetAsset.js, World.js, Atmosphere.js, Quality.js, OpenSkies.js, SquadronAI.js, OpenSkiesProgress.js, src/ui, src/multiplayer, server and tests. Resolve their current paths rather than assuming them.

Use Ace Combat 7 for cloud/battlefield presentation, DCS World for convincing cockpit information and aircraft feedback, and Nuclear Option for dynamic missions and cooperative/competitive play. Adapt the design principles to Skybreak. Create original presentation and use assets whose licences permit the intended use. Do not copy another game's proprietary assets, audio, UI artwork or branding.

Primary reference starting points, to verify as needed:
- https://www.bandainamcostudios.com/en/behind-the-game/205
- https://www.digitalcombatsimulator.com/en/products/world/
- https://store.steampowered.com/app/2168680/Nuclear_Option/
- https://threejs.org/docs/
- https://vercel.com/docs/functions/websockets
- https://webrtc.org/getting-started/turn-server/

**Requirements that apply to every feature.**

1. Default and beginner keyboard controls must remain: Arrow Up = nose up; Arrow Down = nose down. Verify physical pitch direction, not just labels. Never silently flip these defaults during migration, controller work, mouse work or refactoring. Preserve intentional existing custom bindings through a validated migration; show any explicit inversion choice accurately.
2. Default flight must be smooth, responsive and beginner-friendly. Preserve an intentional manual mode. Keep aircraft simulation, input shaping and camera smoothing separate.
3. Maintain one authoritative action/binding definition for help, tooltips, tutorial prompts, settings and gameplay. Device-specific labels must describe what the active device actually does.
4. Preserve existing working missions, aircraft, liveries, profile data, settings, legal/help routes and single-player availability. Back up or version data before migration. Do not erase saves to make new code pass.
5. No silent engine/framework rewrite, destructive reset, force push, deletion of unrelated work or replacement of the existing game with a disconnected demo.
6. Functional controls must be reachable through the actual shipped UI. No permanent placeholders, fake multiplayer bots labelled as humans, cosmetic-only controls, dead menu items, silent fallback from multiplayer to single-player, or TODOs in required gameplay paths.
7. Input focus must be explicit: flight, menu, chat, tutorial, spectator, reconnect and split-screen contexts must not consume one another's actions accidentally.
8. Visual quality presets must not change authoritative visibility, sensor rules, hitboxes, flight capability, damage, rewards or competitive fairness.
9. Keep secrets server-side. Public endpoint URLs may be client configuration; service credentials, long-lived TURN credentials and signing keys may not. Validate network messages and user-generated mission settings.
10. Optimize from measurements. Preserve or improve existing pooling, LOD, shared resources and cleanup. Avoid new per-frame allocation-heavy loops and unbounded caches.
11. Use browser APIs with their actual permissions and secure-context requirements. Do not require disabled browser security, certificate warnings to be ignored, or invasive browser flags.
12. A prompt cannot supply unavailable access, hardware, paid assets or a running external service. When one is genuinely required, record the exact dependency and keep its feature honestly blocked rather than calling it complete.

**Start by establishing a recoverable baseline.**

Inspect the current repository and applicable instructions. Record the source commit or source snapshot identity, working-tree changes, toolchain and existing deployment linkage. Create an isolated branch/worktree when available; preserve user work. Read the relevant specification and upgrade reports already in the project, resolving contradictions against this specification and the current user instructions.

Discover the actual test/build/audit scripts. Where present, run npm ci from the lockfile, npm test, npm run build, npm run audit:secrets and npm run verify:site. Separate pre-existing failures from introduced failures. Inspect both frontend and multiplayer startup. Exercise the current game in a real WebGL-capable browser when available.

Capture a reproducible baseline scene/seed, resolution, graphics preset, browser/hardware, frame-time percentiles, draw calls, geometry/texture counts, loading behaviour and restart memory behaviour. Save representative desktop/mobile screenshots and a short control check. If GPU or device access is absent, record that specific gap. Passing Node tests is not evidence of rendered quality or input feel.

Create a traceability matrix with EXACTLY one top-level row for each F01–F40. Include existing behaviour, requested delta, dependencies, user entry point, affected modules, implementation status, acceptance evidence, commit/version and any blocker. Keep subrequirements under their owning feature. Use distinct states such as pending, in progress, implemented/unverified, verified, released and blocked. Never collapse them into an unsupported “done”.

Maintain a readable progress file and a resumable checkpoint containing the branch/commit, changed files, test evidence, current servers/processes, known failures, next concrete step and remaining feature IDs. Update it at each integration milestone.

The full feature contract follows.

**F01 — Consistent lighting and colour direction.**

Build: Tune sky, sun, ambient/environment lighting, water, terrain, aircraft materials, exposure and bloom as a coherent scene. Establish a restrained Skybreak palette and representative midday, sunset and cloudy conditions. Preserve daylight combat readability and working settings restoration. Use the appropriate colour spaces and tone-mapping pipeline for the installed renderer version.

Acceptance: Review matched screenshots in all three conditions, with bright sky, terrain and ocean behind the jet. Aircraft silhouettes, reticle, warnings and target markers remain distinguishable. Switching presets or entering/leaving a mission does not leave stale exposure or weather state. Retain a documented before/after visual comparison.

**F02 — A flagship aircraft with convincing detail and efficient distance models.**

Build: Select one existing aircraft as the visual benchmark. Improve its silhouette, canopy, intakes, engine nozzle, landing gear, panel treatment, markings and paint/metal separation. Refine the current procedural model or use a properly licensed locally bundled model. Provide appropriate distance representations and texture budgets. Preserve attachment anchors, weapons, gear animation, collision scale and existing aircraft selection.

Acceptance: Hangar close-ups and gameplay views both look consistent. Weapons/effects originate from correct attachment points. At least eight visible aircraft are benchmarked. Asset loading errors have a working fallback. Record asset origin/licence and resource sizes. Repeated aircraft changes do not leak models, materials or textures.

**F03 — A visible and functional cockpit.**

Build: Separate exterior and cockpit visibility/layers so the cockpit is actually rendered. Provide canopy frame, dashboard, readable attitude, heading, speed, altitude and weapon/target information. Bind instruments to the same simulation state used by flight/HUD. Define sensible field of view, near clipping and free-look limits, with a lighter cockpit option if needed.

Acceptance: Transition among chase, cockpit and cinematic views in flight and while landed. No unwanted exterior clipping, missing interior, double HUD, black panel or false instrument reading. Test critical views at common desktop sizes. The working cockpit remains available after respawn, restart and aircraft change.

**F04 — Aegis Strait terrain, coastline and navigation landmarks.**

Build: Improve shoreline foam, shallows, cliff/shore material transitions and terrain detail around the existing coastal battlefield. Add a small set of meaningful landmarks such as lighthouse, harbour and bridge. Integrate their collision/occlusion behaviour deliberately. Use shared terrain data, bounded placement and distance-aware rendering.

Acceptance: Fly the coastline at low altitude and inspect approach routes from several directions. Landmarks appear where map/briefing information says they are. Rendered terrain and collision agree; no floating objects, impossible bridge passages or invisible obstacles. Verify landmark LOD and streaming transitions.

**F05 — Clouds with depth, atmospheric transitions and consistent visibility.**

Build: Improve layered cloud banks, soft edges, altitude haze, light response and lightweight cloud shadows. Use a viable low-cost representation on Low/Medium and advanced rendering only where measured budgets permit. Keep gameplay cloud density/visibility volumes independent of cosmetic detail. Define entry/exit transitions and interaction with existing weather settings.

Acceptance: Fly above, through and below clouds. Check popping, sorting, silhouettes, horizon continuity and transition stability. Compare Low and High at identical positions; sensor/visibility outcomes must remain equivalent. Measure GPU cost before enabling more expensive effects by default.

**F06 — Distinct combat VFX and tinted jet contrails.**

Build: Give cannon tracers, missile exhaust, missile trails, flares, damage smoke and explosions distinct forms and timing. Use subtle blue-grey/teal-tinted jet contrails instead of pure-white default contrails, with clear separation from missile trails. Drive afterburner/nozzle intensity from actual throttle/boost. Keep reduced-motion and effect-intensity settings respected, with pooled finite-lifetime effects.

Acceptance: In a busy fight, identify incoming missiles, friendly aircraft trails and flares without relying only on colour. Test daylight/cloud backdrops and Low quality. Repeated firing, explosions and restarts must not cause unbounded particles, references or frame spikes.

**F07 — Airbases that feel active and support landing.**

Build: Improve runway/taxiway markings, approach lights, signs, windsock, parked aircraft and limited service-vehicle activity. Keep runway approach/landing cues readable. Background vehicle paths must not accidentally block core takeoff/landing unless intentional gameplay explicitly handles it. Use instancing, distance updates and lightweight animation where appropriate.

Acceptance: Complete takeoff, circuit, approach, landing and taxi in daylight and low light. Windsock matches represented wind if wind affects gameplay. Collision and visible vehicle behaviour agree. Benchmark a populated base and confirm distant activity is inexpensive.

**F08 — Adaptive graphics and disciplined resource management.**

Build: Add an optional adaptive-quality mode above existing presets. Use measured sustained frame-time trends and hysteresis to adjust internal render resolution, cosmetic particle limits, shadows and cloud detail gradually. Keep HUD sharp and simulation/sensors invariant. Budget texture/model loading, prewarm necessary assets and dispose/refcount shared resources correctly.

Acceptance: Measure a representative ten-to-fifteen-minute sortie and repeated restarts. Report median/p95/p99 frame times, memory/resource counts, load time and quality changes. Target a useful 60 FPS laptop experience and 30 FPS mobile experience on documented hardware; report actual results. Avoid frequent quality oscillation, surprise settings overwrites and changing gameplay advantage.

**F09 — A clear play flow, especially with friends.**

Build: Restructure entry around Continue, Solo, Play with Friends and Training, while keeping Hangar/Settings easy to reach. Play with Friends must lead directly to create/join/invite choices. Remember valid last-used preferences. Show actual loading, server and connection states with recovery actions.

Acceptance: A new user can start solo or create/join a private party without searching through unrelated menus. Back/cancel works throughout. A failed connection is explained accurately. Mode cards, descriptions and buttons correspond to real playable modes.

**F10 — Contextual, responsive HUD.**

Build: Provide Compact and Full HUD with clear safe layout zones. Promote relevant information for flight, combat, landing, squad orders and spectator states. Keep the central aiming area usable. Resolve conflicts between wingman cards, radio, warnings, telemetry, weapons and touch controls. Preserve HUD scaling, opacity, high contrast and reduced motion.

Acceptance: Inspect 1366x768, 1920x1080, a smaller desktop viewport, 390x844 and 844x390 or equivalent supported mobile sizes. Exercise long callsigns, dense warnings, orders, chat and co-op. Essential information must not overlap or leave the screen. Support keyboard focus and usable touch targets.

**F11 — Threat-awareness display that communicates direction and urgency.**

Build: Integrate radar, directional warnings, relative altitude and target status. Distinguish a detected contact, hostile tracking/lock and launched missile using different icon/text/sound states. Clearly identify friends, enemies and unknowns using shape as well as colour. Display only information allowed by actual sensor rules.

Acceptance: Controlled scenarios from front, rear, above and below produce correct cues and prioritization. Destroyed or stale contacts disappear appropriately. Test colour-independent comprehension. Never show a harmless decorative warning or conceal a real threat because another panel is open.

**F12 — Meaningful aircraft and loadout comparison.**

Build: Improve hangar material/livery preview under consistent lighting. Show understandable aircraft strengths and loadout stat differences, including trade-offs. Explain locked options and cosmetic-only choices. Use actual aircraft/loadout configuration as the source of displayed numbers and enforce multiplayer budgets on the server.

Acceptance: Preview, equip, launch, respawn and rejoin preserve the intended valid configuration. Displayed stat changes agree with gameplay configuration. Invalid or unavailable selections have a clear recovery path. New visual equipment does not silently alter hitboxes or competitive strength.

**F13 — Interactive flight school.**

Build: Extend help into short playable lessons for climb, turn, throttle, targeting/lock, flare timing and landing. Use ghost paths/demonstrations where useful and evaluate actual player actions. Offer repeat, skip, reset and return to game. Instructions read current bindings and active device. Track completion without blocking experienced players.

Acceptance: A first-time player can complete the lessons and then fly a basic mission. Rebound keys work, wrong actions give useful feedback, and resets clean up lesson entities/timers. Test keyboard and at least one controller/touch path where hardware permits.

**F14 — Informative audio, radio and accessibility feedback.**

Build: Refine engine-load audio, flybys, spatial threat cues and radio acknowledgement. Define audio priority/ducking so urgent warnings remain audible. Provide independent music/effects/radio levels, subtitles and equivalent visual cues. Respect browser audio activation and reduced-effects preferences. Avoid repeated or duplicate radio messages.

Acceptance: Test a dense combat mix, muted audio and device output changes. Urgent warnings remain understandable. Mission transitions/restarts stop old audio loops. Sound direction, timing and subtitle content correspond to actual game events.

**F15 — Useful debrief, recorded replay and shareable highlights.**

Build: Extend existing medals with a sortie timeline, damage/wingman-loss events, best moments and an actionable improvement. Record bounded state/event data sufficient for an actual replay; do not claim seed-only determinism. Provide playback controls, a short highlight and screenshot export; video export may use supported browser APIs with an honest compatibility fallback. Keep playback separate from live gameplay and rewards.

Acceptance: Compare replay events against the recorded sortie. Seeking/replaying cannot award XP or change live match state. Playback preserves aircraft/event identity. Respect competitive information limits; do not expose hidden enemy information through live spectator/replay tools. Exported artifacts open successfully.

**F16 — Responsive beginner flight with correct pitch direction.**

Build: Tune the existing Assisted mode across low, cruise and high speeds, with bounded angular response, sensible settling and clear stall/landing behaviour. Keep manual flight intentional and separate. Validate default Arrow Up nose-up and Arrow Down nose-down across all relevant migrations and modes. Avoid double-smoothing or camera motion masquerading as aircraft response.

Acceptance: Check the first simulation response to taps, held input, reversal, release, throttle-only and boost/fire-only input. Compare equivalent flight at 30/60/144 render FPS. Verify no unintended rotation while stationary/taxiing. Perform a beginner flight and record control-feel issues that require real playtesting.

**F17 — Calibration and saved control profiles with live preview.**

Build: Add a live aircraft/input preview to sensitivity, curve and deadzone settings. Support measured controller drift calibration, axis/button inspection, binding-conflict detection, safe defaults and named device profiles. Preserve valid custom bindings and per-device inversion choices with explicit display.

Acceptance: Changes are understandable before launching a mission. Cancel/reset behaves predictably. Reconnect or change devices without corrupting profiles or reversing keyboard defaults. Tutorial/help labels reflect the active bindings immediately.

**F18 — Optional mouse point-to-fly.**

Build: Add a separately selectable mouse point-to-fly mode alongside the existing virtual-stick approach. Convert cursor intention into bounded aircraft commands using the normal flight model. Indicate aim/command position and provide recenter/free-look behaviour. Keep keyboard default available and transitions explicit.

Acceptance: No orientation teleporting, unlimited turn rates or surprise oscillation. Switching modes preserves aircraft state and clears obsolete input. Menu focus, pointer-lock changes and window exit do not produce stuck steering or accidental shots. Test comparable turn limits against other input methods.

**F19 — Customizable touch and controller ergonomics.**

Build: Provide adjustable touch positions/sizes, left-handed layout, camera sensitivity and reliable multi-touch. Improve controller routing, reconnect recovery and device ownership. Keep steering, throttle, firing and defensive actions usable simultaneously. Save profiles and offer a recoverable layout reset.

Acceptance: Test steer+fire+flare combinations, touch cancellation, screen rotation, gamepad unplug/replug and focus loss. Released inputs must clear. Buttons stay in reachable safe areas and cannot be dragged permanently off-screen. Actual device limitations must be documented honestly.

**F20 — Terrain-aware recovery and assisted cruise.**

Build: Improve the existing recovery action using nearby terrain, altitude, speed and feasible climb/turn limits. Provide explicit assistance status and immediate manual override. Integrate assisted cruise without unexpected throttle changes or interference with landing. Assistance must use actual flight forces/commands.

Acceptance: Recover from banked, descending and low-altitude situations without teleporting or commanding a level path into a mountain. Test cases where recovery is physically impossible and provide a clear warning. Manual input reliably returns control. Multiplayer rules explicitly determine permitted assistance.

**F21 — Target-aware chase camera.**

Build: Add an optional target-look/track function with bounded camera rotation, damping and predictable return to neutral. Keep aircraft orientation understandable. Respect free look, landing view, reduced motion and cockpit mode. Decouple camera tracking from steering and weapon lock.

Acceptance: Fly past and around targets, destroy/switch targets and respawn while tracking. Avoid sudden flips, terrain clipping or hidden aircraft orientation. Camera assistance must not grant steering/target-lock advantages. Verify comfort with motion effects disabled.

**F22 — Intentional targeting and safe combat input.**

Build: Improve target selection using deliberate cycling and optional nearest-threat/centre-of-view selection. Preserve target identity until a deliberate switch or defined invalidation. Give clear lock/range/cooldown feedback. Enforce one activation per missile press, continuous cannon semantics and contextual menu/input consumption.

Acceptance: Switching devices, closing orders/chat, restoring focus and reconnecting cannot trigger accidental firing. Target selection does not jump unpredictably. Client visual firing and authoritative ammunition/events reconcile without duplicate projectiles or rewards. Help text matches actual behaviour.

**F23 — Several complete combat mission templates.**

Build: Add playable escort, bomber interception, airbase defence and strike-support templates alongside the existing Open Skies sortie. Each needs briefing, objectives, spawn/route rules, success/failure states, recovery/retry and sensible squad roles. Reuse shared mission primitives rather than cloning entire game loops.

Acceptance: Complete and fail each template through actual objectives. Missing/dead/disconnected targets cannot soft-lock progression. Each template requires meaningfully different decisions. Check single-player and cooperative eligibility explicitly, with server control for enabled co-op missions.

**F24 — A connected three-sector campaign.**

Build: Implement a small campaign with at least three meaningful sectors. Capturing/protecting a sector changes a later route, repair opportunity, enemy reinforcement or mission availability. Save a versioned campaign state, present consequences on a map and provide continue/new-campaign/reset controls. Define party ownership and authoritative campaign progression when used in co-op.

Acceptance: Finish a sector, leave, return and observe the same valid progress and next-mission consequences. Test failure and alternate outcomes. Simultaneous co-op completion cannot apply progress twice. Preserve existing profiles and handle corrupted/older save data safely.

**F25 — A bounded battle pacing director.**

Build: Extend fixed waves with configurable pacing based on encounter intensity, distances, squad condition and objective progress. Bound active enemies, travel time and recovery gaps. Telegraph reinforcements and avoid unavoidable immediate attacks. Store seed/config/version for reproducibility. Keep competitive comparisons in fixed-rule playlists or clearly labelled adaptive categories.

Acceptance: Observe complete Easy and harder sorties. Verify the mission neither stalls with unreachable enemies nor stacks unmanageable attacks. Use recorded timing and player feedback to tune it. The director must not silently cheat aircraft physics or invalidate objective counts.

**F26 — Wingmen with useful tactical roles.**

Build: Extend Cover/Attack/Regroup with coordinated pairs, escort protection and damaged-teammate cover. Add target reservations, separation, feasible routes, order acknowledgements and understandable status. Preserve existing command bindings/context and support replacing eligible AI slots with human squad members.

Acceptance: Demonstrate each order changes behaviour. Wingmen do not endlessly circle, collide, attack invalid targets or ignore terrain/sensor limits. Order state survives appropriate phase transitions and clears on restart. Human players receive requests/pings instead of being remotely controlled by AI commands.

**F27 — Shared terrain and visibility rules.**

Build: Define separate visual, infrared and radar detection rules. Implement terrain line-of-sight/sensor occlusion where applicable and analytic cloud visibility behaviour. AI and players use the same rules, with remembered/lost contacts handled explicitly. Keep cosmetic cloud/terrain quality independent of authoritative detection.

Acceptance: Run controlled clear-view, mountain-blocked and cloud-entry scenarios for both AI and players. Test acquiring, losing and reacquiring contact and lock. A Low-quality player must not receive extra authoritative visibility. Use bounded spatial queries and verify their performance.

**F28 — Functional damage and a meaningful repair loop.**

Build: Add a manageable set of engine, wing/control and sensor damage states with corresponding handling changes, smoke/instrument feedback and clear player explanation. Integrate existing landing/rearm/repair into restoring specific systems. Tune Easy to retain recoverability where reasonable; make effects server-owned in multiplayer.

Acceptance: Damage the specific systems, observe the correct effect and repair them through the real base interaction. Prevent remote/airborne forged repairs and repeated repair/reward exploits. Damage, respawn and replay state remain consistent across clients and mode transitions.

**F29 — Shared non-combat activities.**

Build: Add formation challenges, checkpoint races and landing-accuracy competitions to Free Flight as optional activities. Define shared starts, validated progress, finish conditions, understandable scoring and replay/rematch. Preserve ordinary relaxed Free Flight. Keep activity results distinct from combat progression where needed.

Acceptance: At least two friends can join and complete each activity. Enforce checkpoint order, landing validity and simultaneous finish handling. Disconnect/cancel does not leave an activity stuck. Results on all participants agree, with no duplicate rewards.

**F30 — Mission generator with shareable validated presets.**

Build: Provide a usable generator for mission template, location, difficulty, weather and bounded enemy budget. Serialize mission schema/version, seed and necessary configuration into a shareable preset/link or file. Validate imports on both client and server. Bound route/spawn search, entity counts and request sizes.

Acceptance: Open the same preset/version on separate devices and obtain the same mission setup and objectives. Reject malformed, unsupported or excessive settings with useful errors. Generated missions have feasible spawns/routes and can complete. Custom scores must be distinguishable from standardized records.

**F31 — A deployed, monitored multiplayer match service.**

Build: Productionize the existing WebSocket backend with secure endpoint configuration, health/readiness, client/server protocol compatibility, room lifecycle limits, connection/message rate limits and recoverable error reporting. Use a measured hosting design for continuous simulation. Start with one owner/worker per room; define routing if scaling. Support four-person co-op and retain the existing supported competitive capacity up to eight players.

Acceptance: Run an external four-player session across at least two real networks, plus an eight-client capacity/soak scenario. Record connection success, server tick performance, bandwidth, room cleanup and errors. Frontend and backend release versions must be compatible. Never infer multiplayer health from the static website loading.

**F32 — Authoritative movement, weapons and mission state.**

Build: Replace trust in client final movement telemetry with sequenced intentions processed through shared, testable simulation. Server authority covers movement bounds, collision-relevant state, cooldowns, ammunition, lock acquisition, repairs, objectives and rewards. Preserve immediate local response through prediction. Extract pure simulation/state from rendering and browser globals. Define deterministic seeds and versioned protocol messages.

Acceptance: Test legitimate fast manoeuvres and attempts to submit teleporting positions, impossible turns, repeated fire/repair, invalid targets and forged damage/rewards. The server rejects invalid actions without destabilizing honest clients. Local predicted state can be reconciled from a full authoritative state, including velocity and angular/system state.

**F33 — Complete prediction, reconciliation and network interpolation.**

Build: Wire actual input sequence acknowledgements, server time/ticks, unacknowledged-input replay, adaptive remote interpolation and bounded extrapolation. Add conservative, bounded lag compensation where appropriate. Handle stale epochs after reconnect, backpressure and excessive outbound queues. Choose simulation and snapshot rates from evidence; keep rendering independent. Account for WebSocket/TCP stalls rather than assuming UDP-style message loss semantics.

Acceptance: Test 50/100/180 ms latency, jitter, brief interruption and network-level loss/TCP stalls. Measure correction frequency/distance, responsiveness and hit consistency. Verify respawn transitions and full-state reconciliation. Comments, unused prediction buffers or smooth remote sprites alone do not satisfy this feature.

**F34 — Invite links and a persistent friends party.**

Build: Extend existing room codes with copyable invite links/QR, guest callsigns, a clear roster and party continuity across matches. Add mode/map voting, readiness/loading state and proper cancel/back flow. Handle full, expired, incompatible or locked rooms. Validate guest names and room access; preserve host-only actions where appropriate.

Acceptance: A friend opens an invite on another device, identifies themselves, joins the correct party and enters the same mission. After a match, everyone can vote/rematch without another invite. Late clicks or roster changes during countdown do not strand players or start an invalid team configuration.

**F35 — Resume the same match after disconnection.**

Build: Use unguessable short-lived resume credentials, a defined reservation/grace period and server-owned player identity. Restore the same seat, score, aircraft, loadout and current match state. Define the aircraft's behaviour while disconnected and ensure PvP disconnection provides no invulnerability or reset advantage. Preserve/reassign lobby leadership and make expiry understandable.

Acceptance: Interrupt connectivity for ten seconds, recover and resume the same valid player without duplicate entities or rewards. Test grace expiry, stolen/invalid token attempts, repeated reconnect and lobby leader departure. Test returning during a phase transition, while damaged and after death. A “connection restored; start a new match” message is not completion.

**F36 — Genuine two-to-four-player Open Skies co-op.**

Build: Move cooperative encounter state, AI decisions, damage, phases, objectives and rewards under one server authority. Replace appropriate squad slots with human players and use AI for eligible empty slots. Scale objectives/enemy budgets within declared limits. Include synchronized briefing, orders/pings, mission progress, shared debrief and rematch. A player's menu must not pause the shared simulation.

Acceptance: Two, three and four players complete a real mission with matching world state and outcomes. Test late joining/resuming, empty AI slots, wingman loss, leader departure, player death and simultaneous final kills. Rewards are applied once. Mission state and AI are not separately simulated into contradictory outcomes by each browser.

**F37 — Objective-based competitive Air Superiority.**

Build: Add one complete zone-control mode to the existing competitive modes. Define contested/captured state, scoring intervals, match duration, tie-break and visible objective feedback. Enforce balanced aircraft/loadout rules. Improve spawn selection using enemy proximity/line of sight and existing protection rules; remove protection when attacking as intended.

Acceptance: Play balanced team matches and edge cases with uneven/disconnected teams. Objective control meaningfully affects victory. All clients agree on scores/results. Test spawn-camping scenarios, protected-target scoring and malicious zone/progression claims. Preserve existing duel/team modes.

**F38 — Meaningful team pings and optional voice.**

Build: Extend quick comms with validated target/location pings, team visibility, expiry, acknowledgement and anti-spam behaviour. Add opt-in voice with push-to-talk, mute/deafen, per-user volume, microphone state and appropriate echo/noise handling. Implement authenticated signalling and STUN/TURN support or a permitted managed equivalent; use short-lived server-issued relay credentials. Reuse party membership for channel authorization.

Acceptance: Pings refer to the correct live object/location and remain useful without voice. Test voice across different networks, microphone denial, device changes, muting, leaving and reconnecting. Leaving a room tears down its audio tracks and peer connections. Verify a relay-required path. If required relay provisioning is unavailable, voice remains explicitly blocked and cannot be counted as fully delivered.

**F39 — Packaged same-Wi-Fi/LAN play.**

Build: Provide a straightforward Windows-friendly local launcher plus documented developer commands. Serve the built game and compatible multiplayer backend locally, advertise an actual LAN address/QR, bundle needed offline assets and provide connection diagnostics. Use correct bind addresses and endpoint selection. Clearly distinguish localhost from an address another device can reach. Respect secure-context requirements for optional browser capabilities.

Acceptance: After initial package setup, disable internet and join a real match from two separate devices on a permitted local network. Verify all essential assets load locally, state stays synchronized and closing the launcher stops the service cleanly. Explain needed firewall/network steps without requiring public port forwarding or disabled security. Do not count two localhost tabs as the two-device LAN test.

**F40 — Playable two-player split-screen on one computer.**

Build: Implement independent local player/seat state, input ownership, cameras, HUDs and per-player menus over the shared world. Support keyboard plus controller and two controllers. Start with complete Free Flight and Open Skies co-op. Use suitable viewport/scissor rendering or another measured approach, sensible lower-cost effects and correct shared-resource ownership. Eliminate assumptions that all gameplay must address one global player or one set of HUD IDs.

Acceptance: Two humans can independently steer, aim, fire, use defensive actions and read their own objectives/HUD. Test controller unplug/replug, focus changes, resizing, one player dying, restart and entering/leaving local co-op. One player's menu/action must not accidentally control the other. Benchmark actual split-screen rendering and document supported hardware/input requirements.

**Architecture and dependency execution order.**

Before broad edits, write a concise architecture decision record based on inspection. Cover the simulation/render split, input action model, entity/player/seat identity, world/sensor data, mission ownership, multiplayer protocol, persistence and resource ownership. Make the smallest coherent refactor that enables all required modes. Avoid late discoveries that local multiplayer or authoritative AI requires replacing the whole game.

Use this order, adjusting only when code evidence demonstrates a better dependency ordering:

- Phase 0: baseline, source/access verification, feature matrix and reproducible evidence setup.
- Phase 1: shared simulation/input/state foundations for F16, F22, F32 and future F40; versioned configuration, IDs, profile migration and resource ownership.
- Phase 2: F31, F32, F33 and the session foundations of F35. Verify real two-client combat before building larger networked modes.
- Phase 3: F34, F35, F36 with usable minimum F09/F10 flows. Deliver the four-friend shared sortie checkpoint internally, then continue the assignment.
- Phase 4: complete F09–F22 and team-ping parts of F38. Integrate tutorials, cockpit/camera interfaces, replay event hooks and all supported input routes.
- Phase 5: complete F01–F08 and shared world/sensor groundwork for F27. Benchmark visuals against the baseline and tune quality budgets.
- Phase 6: complete F23–F30 and F37, including authoritative co-op integration, campaign/generator validation and progression rules.
- Phase 7: complete F38 voice, F39 LAN packaging and F40 split-screen. Resolve secure-context, device-routing and deployment needs.
- Phase 8: full integration verification, regression fixes, real playtests, production deployment and release audit for every F01–F40.

Earlier phases may prepare structures for later features; that does not count those features complete. Commit coherent checkpoints. Keep current production playable while working. Preview/feature flags may isolate unfinished work, but the final required feature cannot remain a hidden flag, disconnected prototype or disabled menu item.

Prefer a frontend retained on the existing Vercel project and a match-service architecture suited to sustained simulation. Verify current Vercel/WebSocket capabilities, duration/state constraints and project configuration from current official sources. Do not rely on old assumptions that a platform always supports or never supports a particular transport. If using distributed function instances, explicitly solve room ownership, routing, continuity and durable state; external pub/sub by itself is not the physics simulation.

Do not introduce a database simply to relay every aircraft frame. Distinguish transient simulation state, resumable session state, durable campaign/profile data and exported replays. Use the simplest authorized persistence that correctly meets each requirement. Never treat client-supplied competitive progress as trusted server results.

**Verification contract for the complete upgrade.**

Run meaningful tests at the level where each risk exists. Preserve existing tests and extend them for real new behaviours. Do not lower assertions, delete failing tests or substitute unrelated smoke checks to make the dashboard green. Do not spend excessive time adding superficial tests for cosmetic edits; use visual evidence for visual requirements.

Required verification includes:

- Flight/input: correct pitch direction, first-step response, equivalence across render rates, focus lifecycle, rebinding, device changes, touch cancellation, assisted/manual switching, landing and recovery.
- Missions/AI: success, failure, cancellation, missing targets, simultaneous final events, phase transitions, bounded spawning, terrain/sensor behaviour and realistic complete sorties.
- Multiplayer: real socket integration, authoritative validation, consistent snapshots/results, prediction reconciliation, late join/resume, leader departure, invalid messages, team routing and room cleanup.
- Progression: once-only rewards, existing-save migrations, corrupt/unavailable storage, campaign continuation and custom/standard score separation.
- User journeys: menus, joining, cancelling, invitations, tutorial, hangar, cockpit, orders, chat, replay, post-match voting/rematch, voice and error recovery.
- Rendering: actual WebGL screenshots/video at supported desktop and mobile sizes, readable silhouettes/HUD, cloud/coast transitions, no missing assets or console/shader errors.
- Performance: baseline versus candidate on matched hardware/scene/seed/settings; frame percentiles, loading, draw calls, resource counts, long-session behaviour and network/server metrics.
- Cleanup: at least ten representative start/restart/exit cycles and relevant aircraft/scene changes. Distinguish a bounded cache from a continuing leak.
- Sessions: four-person co-op, supported eight-client competitive load, network impairment, real two-network play, real two-device LAN and physical two-player split-screen.
- Audio/voice: actual audible/recordable output where available, microphone permissions, team isolation, device changes, muting, relay path and connection teardown.
- Product regressions: legal/help/public pages, asset paths, existing controls, missions, settings and deploy validation remain functional.

For benchmarks, record device, GPU when accessible, OS/browser, viewport, DPR, preset, mission seed/version, warm-up/sample length and whether data came from real hardware or emulation. Browser emulation is useful but is not a claim that a physical phone/controller was tested.

Automated bots and scripted state transitions are useful evidence for networking and lifecycle coverage. Label them accurately. They are not a substitute for all human control-feel, visual-readability or multiplayer playtesting. Do not claim “four friends tested” from four headless tabs.

If an environment lacks a WebGL browser, required device or external network, implement a runnable acceptance harness and exact handoff instructions, record the missing gate, and continue all other feasible work. Keep unverified features labelled implemented/unverified. Collect the minimum specific external evidence needed when the environment can no longer progress.

**Persistence, context limits and honest continuation.**

This is one complete backlog executed over as many internal phases as required. Do not silently reduce the scope because it is large.

Before context exhaustion or a forced stop, save the current source state and update the feature matrix, progress file, evidence index and checkpoint. Include precise next commands/actions and real blockers. On continuation, read that checkpoint, inspect current repository status and resume the next unfinished dependency. Do not restart from scratch or repeat a completed milestone without a reason.

You cannot keep working after a turn ends unless the environment actually supports it. Do not promise background completion. If continuation input is required, give me one short Hinglish continuation instruction and the exact saved checkpoint to resume. A partial implementation must be reported as partial with the remaining feature IDs.

**Release and final deliverables.**

Complete all authorized local implementation and verification before asking for a deployment decision or new access. Reuse the existing GitHub repository and Vercel project. Push coherent changes through the permitted branch/review workflow, preserve other commits and deploy only after the required release gates pass. Do not force a merge or bypass repository protections. Provision/connect the match service and voice dependencies only through authorized resources and an approved spending scope.

Verify production source/version identity, deployment readiness, static asset responses, frontend-to-backend protocol compatibility, secure sockets, room create/join, actual mission interaction, reconnect and completed debrief. A successful HTTP 200 for the homepage is not proof that the game or multiplayer works. Keep a documented rollback path for compatible frontend/backend/data versions.

Provide:
- Updated integrated source with all required assets/configuration and clear setup commands.
- Completed F01–F40 traceability matrix with per-feature evidence and honest remaining blockers, if any.
- Architecture/protocol/persistence notes sufficient to continue development.
- Automated test/build results and reproducible browser/network acceptance commands.
- Before/after visual evidence and measured performance/network findings.
- Usable Windows/LAN launcher package and clear LAN instructions.
- Hinglish playing guide covering keyboard defaults, mouse/controller/touch, cockpit, wingmen, missions, invitations, co-op, PvP, reconnect, voice, LAN and split-screen.
- Deployment configuration examples with placeholders rather than secrets, operational limits/costs where relevant, monitoring and rollback instructions.
- Final working game link and appropriate downloadable artifacts after their actual availability is verified.

Your final Hinglish report must state: what changed, how to play the new modes, what was tested on which environment, which F01–F40 are verified/released, any exact blocked gates and the live version/link. Do not state “40/40 complete” unless every feature's implementation and required acceptance evidence genuinely support it.

Begin now by inspecting the available current source, creating the F01–F40 matrix and running the baseline checks. Then execute the dependency-ordered implementation, testing and authorized release. Do not stop after presenting a plan.
