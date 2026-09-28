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
| External GLB aircraft | None supplied or downloaded | **Incomplete** | Do not describe this release as containing a detailed external model |

## Future aircraft asset contract

`JetAsset.js` exports a deliberately empty `FLAGSHIP_ASSET`. `Jet.loadVisual(descriptor)` retains the procedural model on errors and guards stale async loads. It accepts a local `/assets/...glb` path, named author/source/licence, explicit `-Z` forward / `Y` up axes and a metre length between 10 and 40.

Required named pivots/anchors: `wingtip_left`, `wingtip_right`, `exhaust`, `gear`, `elevator_left`, `elevator_right`, `aileron_left`, `aileron_right`, `rudder`. Scale/origin are normalized; the physics/stats remain on the existing Jet. Confirm attachment positions, animation orientation, licence, triangle/texture budgets, LOD, load failure and all five aircraft in a real browser before enabling an asset. The procedural detail group culls beyond 350 m; this is a modest detail LOD, not a full replacement airframe LOD asset set.

The sky is an artistic shader and clouds are layered sprites. `exhaustGlow` is cosmetic luminous particles, not heat-refraction distortion. No unsupported volumetric-cloud or real-aircraft accuracy claim is made.

Follow-up interface fixes: the descriptor now connects to X-17 construction/customization, nested wingtip/exhaust anchors use authoritative simulation transforms, and gear animation retains a model pivot’s original position/scale. These are regression-tested with synthetic transforms; they do not establish a rendered external-model import. The local game-dev/Blender toolchain is unavailable, so no third-party asset was admitted.
