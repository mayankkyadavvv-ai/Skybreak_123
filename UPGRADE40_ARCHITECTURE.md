# Upgrade 40 architecture decisions

- Preserve Three.js/Vite, existing rendering/world/input and all solo modes.
- Shared fixed-step FlightCore module under src/shared; positive pitch is nose up. MP applies client intentions via server authority and predicts/reconciles full local state. Solo flight remains compatible while integration is verified.
- Protocol v2 uses match epoch, player input epoch, sequence acknowledgements, 60Hz shared simulation and 20Hz snapshots; no trust in arbitrary client positions/damage.
- One live authoritative Room/MatchState owner; secure resume credentials reserve identity. Production match-worker provisioning is a separate verified gate from frontend Vercel readiness.
- Shared mission, sensor, cloud-volume, terrain and damage modules give clients/AI/server the same rules. Cosmetic quality cannot alter detection.
- Player seats separate input, HUD and camera ownership for local two-player co-op. Shared scene/resources use explicit cleanup; no duplicate global HUD IDs.
- Versioned local solo profiles/campaigns preserve existing saves. Campaign is solo-owned; live server owns co-op mission outcomes and once-only result delivery. Guest room state is volatile and is not a durable account/progression database.
- Rendering, UI, missions, server, multiplayer client and LAN changes are integrated in the release candidate. Offline FlightPhysics remains distinct from shared multiplayer FlightCore, with default direction and comparable input behaviours covered in both paths.
- No production promotion until necessary gates pass. Missing real devices, GPU, two-network access or TURN are reported as unverified/blocked, never represented as passing.
