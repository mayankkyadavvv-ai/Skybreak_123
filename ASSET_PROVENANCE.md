# Asset provenance

| Asset | Source / authorship | Licence/status | Notes |
|---|---|---|---|
| Existing aircraft geometry and panel texture | Supplied Skybreak project, procedural code | Existing project ownership; owner to confirm overall distribution rights | Original five IDs/stat tables preserved |
| X-17 service panels/intake lips/material adjustments | Original code added in this upgrade | Part of the modified project | No copied external aircraft model |
| Terrain/sky/water/cloud textures and base props | Existing procedural project plus this upgrade | Project-generated; no downloaded satellite imagery | Stylized relief, not a survey or navigation dataset |
| Social SVG/PNG | Original vector composition created in this upgrade | Project artwork | 1200×630; explicitly marked artwork, not gameplay |
| Favicon SVG/PNG/ICO and apple icon | Original project-local geometric mark | Project artwork | SVG source retained; PNG exports and 16/32/48 ICO |
| Interface line icons | Original local SVG paths in Icons.js | Project artwork | No icon CDN or remote font |
| Three.js and bundled addons | Installed Three.js 0.180.0 | MIT; see THIRD_PARTY_NOTICES.md | Includes GLTFLoader, postprocessing and geometry utilities |
| External GLB aircraft | None supplied or downloaded | Not used; procedural option selected | No external-model claim |

## Future aircraft asset contract

`JetAsset.js` exports a deliberately empty `FLAGSHIP_ASSET`. `Jet.loadVisual(descriptor)` retains the procedural model on errors and guards stale async loads. It accepts a local `/assets/...glb` path, named author/source/licence, explicit `-Z` forward / `Y` up axes and a metre length between 10 and 40.

Required named pivots/anchors: `wingtip_left`, `wingtip_right`, `exhaust`, `gear`, `elevator_left`, `elevator_right`, `aileron_left`, `aileron_right`, `rudder`. Scale/origin are normalized; the physics/stats remain on the existing Jet. Confirm attachment positions, animation orientation, licence, triangle/texture budgets, LOD, load failure and all five aircraft in a real browser before enabling an asset. The current upgrade adds merged middle-distance geometry and a simplified far silhouette, with hysteresis. LOD changes keep physics and weapon attachment anchors on the original Jet. Real eight-aircraft render cost remains unverified.

The sky is an artistic shader and clouds are layered sprites. `exhaustGlow` is cosmetic luminous particles, not heat-refraction distortion. No unsupported volumetric-cloud or real-aircraft accuracy claim is made.

Follow-up interface fixes: the descriptor now connects to X-17 construction/customization, nested wingtip/exhaust anchors use authoritative simulation transforms, and gear animation retains a model pivot’s original position/scale. These are regression-tested with synthetic transforms; they do not establish a rendered external-model import. The local game-dev/Blender toolchain is unavailable, so no third-party asset was admitted.

## F01–F08 candidate additions

Cockpit geometry/instrument canvas, X-17 trim, airfield/harbour/lighthouse/bridge props, coastal depth data and cloud shadow maps are project-local procedural code. No paid or copied game assets were used. `WorldDetailMaps.js` creates 192×192 and 96×96 single-channel data maps (46,080 source bytes combined, excluding runtime overhead). `Cockpit.js` uses actual flight state; canvas/GPU readability is a pending browser gate.

`evidence/upgrade40/qa-model-inventory.json` counts eight procedural X-17 models without a WebGL renderer: 2,435,872 geometry-buffer bytes and 832 mesh nodes including hidden LODs. These are CPU scene resource counts, not visible draw calls, texture residency or GPU timings. Exact visual before/after evidence remains blocked by the missing browser executable.

The LAN archive includes dependency licences for Three.js, ws, qrcode and bundled QR transitive packages. No remote assets are required after initial setup.
