# Skybreak release checklist — 28 September 2026

Passed = observed local check. Partial = implementation exists but an acceptance gate remains. Unverified = the required environment/fact was unavailable. Vercel publication is now requested but blocked by unavailable deployment access.

| Requirement | Result | Evidence / remaining action |
|---|---|---|
| Baseline preserved | Passed | Original 82 tests/build recorded; old snapshots retained |
| Upgraded regression suite | Passed | 111/111; evidence/test-results.txt |
| Production build | Passed with bundle warning | Vite 6.1.0; Three chunk exceeds 500 kB; warning retained, not hidden |
| Secret-free active export | Passed pattern check | Zero identified credential patterns; private env/account/cache paths excluded; export guard refuses matches |
| Old exposed credential handling | Partial | Earlier upload's expired runtime OIDC token removed from repaired code/export. No account-side revocation or history purge claimed; do not reuse old unsafe copies |
| WSS/CSP/permissions | Passed locally | HTTPS-hosted client rejects ws, credentials, fragments and unapproved origins; CSP tests; headers synchronized |
| Live HTTPS/redirect/HSTS | Partial | Existing origin returns HTTPS 200 and HSTS; current-code release and HTTP redirect/certificate audit are not verified. See evidence/access-checks.json |
| Shared controls/defaults/rebind | Passed local behavior | New controls, migration, collisions, throttle, pitch and browser shortcut tests |
| Physical controller/mouse capture feel | Unverified | Simulated mapping/edges/lifecycle pass; real hardware/browser absent |
| Camera transforms/terrain/zero effects | Passed unit behavior; visual partial | Tests cover interpolation/teleports and settings; smoothness needs viewing |
| HUD/context/warnings | Passed state tests; visual partial | Single priority warning and effective labels; overlap/target visibility needs pixels |
| Graphics quality/PMREM/AA | Partial | Configuration, weather/direction and resource tests pass; GPU paths, artifacts and long-run resource counts unverified |
| External aircraft asset | Incomplete | No approved licensed GLB; procedural model and loading contract provided |
| Terrain/airbase/particles | Partial | Border alignment, authoritative samples, particle blend/budgets, spatial clouds, CPU scene/disposal pass; real low-altitude flights pending |
| Menus/hangar/weapons | Passed DOM checks; visual partial | Broken weapons categories replaced, deltas/equip/progression preserved, keyboard cards and focus added |
| Data/Privacy/Terms | Draft | Actual flows inventoried; operator/contact/jurisdiction/providers/retention require owner confirmation |
| Optional tracking consent | No source integration found | No fake tracking banner/categories added. Deployed provider activity and legal applicability still unverified |
| Local data reset | Passed DOM behavior | Explicit confirmation, five keys only, unrelated data preserved |
| Metadata/crawl/social/icons | Passed static checks | Distinct titles/canonicals; valid local assets; PNG 1200×630; draft/error pages excluded from sitemap |
| Contrast | Six listed token pairs passed | 4.94:1 minimum; evidence/contrast.json. This is not certification of all canvas/dynamic text |
| Focus/modal/touch lifecycle | Passed DOM behavior; device partial | Trap/return, menu inertness, cancel/release and controller pause-edge regressions |
| Requested responsive sizes/200% zoom | Unverified pixels | CSS and optional capture script cover all six sizes; no actual browser captures |
| Accessibility scan/screen reader | Unverified | No axe/Lighthouse/screen-reader result; run QA.md gate |
| Current-build routes/MIME/404 | Passed local HTTP | 15 checks; missing JS/image are plain-text 404s, missing page branded 404; evidence/http-checks.json |
| Real host/adapter behavior | Unverified | Local strict preview is not a deployed Vercel test; preserve existing protection |
| Performance | Partial, structural evidence only | Static eligible meshes 716→129, total World meshes 2514→1927 at equal triangles. No GPU frame-rate conclusion |
| 60 FPS Medium on user's laptop | Unverified target | Hardware not available; record actual device, resolution, quality, average FPS and p95/1% low |
| Startup/CWV/Lighthouse | Unverified timings | Only raw/gzip bundle/page sizes measured; public pages load no game JS by construction |
| Five-minute manual flight/multiplayer | Partial | Real local sockets cover join/start/telemetry/fire/flares/comms/reconnect/shutdown; browser playthrough and hosted WSS remain unverified |
| Source/master/build handoff | Passed export/integrity checks | Source + binary assets, SHA-256 restoration, packaged output and full report |
| Live deployment | Blocked | Connected deploy action returns Tool not found; old assets still live. No upload/protection change occurred. Updated Windows launcher is prepared, not executed here |

Follow-up blockers: remote browser has no WebGL 2; local preview navigation was blocked; Game Asset Vendoring requires unavailable game-dev tooling; public operator/contact details remain missing. Expanded browser/axe and Windows release scripts passed syntax checks only, not full execution.
