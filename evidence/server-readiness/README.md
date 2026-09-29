# Public-worker preparation — 29 September 2026

Previous verified runtime and all browser evidence remain in `evidence/pending-completion/`. This follow-up addresses F31/F38 deployment preparation; public hosting and real voice are still blocked.

- Fixed production startup accepting empty/wildcard/insecure origins and silently tolerating partial TURN configuration. Exact origins normalize, public health reports only safe configuration status and optional full revision, and production defaults are the measured one room/eight clients. Invalid config fails before listening.
- Added a pinned Caddy HTTPS/WSS gateway and Compose worker configuration (non-root/read-only worker, internal 8080, healthcheck, memory/CPU/process/log bounds).
- Added `npm run verify:server`: only an authorized idle endpoint, version/revision, create/join/ready/start, acknowledged input, ten-second real socket interruption/resume, token rotation, duplicate-pilot check and leave/cleanup. No private tokens or TURN credentials are written. Requiring relay verifies credential issuance, never actual media.
- Added nine regressions, including busy-server refusal without opening QA sockets or disconnecting its existing player.
- Local **226/226 tests pass**, production build/static validation and credential-pattern scan pass. **58 fresh LAN package checks pass**. Unit smoke tests use 30 ms disconnect for a short regression; the CI production-container command uses the normal ten-second interruption.
- New source digest: `e14a22154104fb997f15d17473464031d4828220132c9ab3f911c2ef0976f879`. Frontend asset digest is unchanged from the previous verified runtime: `2e1661bdd8dce9fe563c02107c1b7b260abbe5691347cc6eae0baeae52301650`. Source manifest records actual public working inputs; ops files and tests are identified by the published Git tree.
- Workflow now validates Compose/Caddy and runs the built production container with an exact revision and real endpoint smoke. Remote CI result is pending at this source checkpoint; do not count configuration preparation as a deployment.

Operator guide: `ops/README_HINGLISH.md`. Required external inputs remain authorized VPS access, DNS, actual TURN service/shared secret, four humans on two networks, physical offline LAN/controllers/touch and representative GPU/beginner testing. No paid resource was provisioned. Production remains unchanged. F32 automated-verified, F31/F38 blocked, other 37 implemented/unverified; released 0/40.
