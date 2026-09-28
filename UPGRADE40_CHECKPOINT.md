# Upgrade 40 checkpoint — 2026-09-28

Candidate: **2.0.0-rc.1**, multiplayer protocol **2**. Upstream baseline: `ae1fedbb9ae2a790832e0415029f2044ae77562d`. Working/review branch: `feature/skybreak-40-upgrade` in `mayankkyadavvv-ai/Skybreak_123`.

The supplied specification is retained verbatim in `spec/UPGRADE40.md`; its SHA-256 is `e3daee237bcf78d296a296ca1001c102377c303f86686cba460b428945ae0de5`. The F01–F40 matrix has exactly 40 rows: F32 automated authority acceptance verified, F31/F38 blocked by external service/acceptance needs, other 37 implemented/unverified. **Released: zero.** This is not a 40/40 completion claim.

## Saved implementation and evidence

- Integrated shared authoritative flight/combat, prediction/reconciliation, party/reconnect, co-op mission templates, activities, generator/campaign, sensors/damage, controls/training, graphics/UI, replay/audio, voice client, LAN and local two-seat mode.
- Mandatory default ↑ nose up and ↓ nose down is tested in offline and shared flight; instructions are derived from active bindings where supported.
- Baseline: 137 passing tests. Candidate: 192 passing tests, build, seven-page static validation and credential-pattern scan passed. Logs are in `evidence/upgrade40/`.
- One-host eight-scripted-client 600-second real-socket soak passed at 59.986 Hz with identical final results, reconnect and cleanup. Scope and subsequent changes are recorded in `UPGRADE40_QA.md`.
- Standalone LAN package launch/create/join/shutdown is covered by `verify:lan`. This does not count as two physical offline devices.
- Source and built asset hashes are retained in `evidence/upgrade40/source-manifest.json`. LAN ZIP includes the guides, licences, standalone server, production assets and manifest; it requires Node.js 22+ to be installed once.

## Remaining concrete gates

1. Run the supplied browser acceptance harness on a permitted WebGL browser; inspect graphics/UI screenshots and complete actual beginner/device/split-screen sessions. Normal browser-install routes failed in this workspace; zero screenshots or GPU benchmark claims are made.
2. Provision/connect an authorized continuous protocol-2 WSS worker and short-lived TURN credentials through approved resources/spending scope. No new paid resource has been purchased. Deployment files and exact configuration are in `UPGRADE40_RELEASE.md`.
3. Collect four-person/two-network co-op and relay-required voice evidence, plus two-physical-device offline LAN. Automated clients cannot replace these gates.
4. Resolve findings, update the matrix, then promote the exact tested frontend/backend pair to the existing Vercel project and run the recorded release/rollback procedures.

Existing production remains `skybreak-iota.vercel.app`, deployment `dpl_t1vnXgFBprQXXBnd4Kkm3RAeGZAu`. No production promotion has been attempted. Publishing a draft review branch does not satisfy the release gates.

## Publishing status

Earlier GitHub publication attempts were blocked by automatic approval review. On 2026-09-28 the user explicitly authorized publication of the source and test evidence to the public repository `mayankkyadavvv-ai/Skybreak_123`, branch `feature/skybreak-40-upgrade`, creation of a draft PR, and a preview deployment in the existing Skybreak Vercel project. The first source upload under that explicit authorization succeeded.

The candidate is committed locally and is being published through the approved branch/review workflow. The branch and its linked draft PR/deployment checks are the authoritative current publication status. A full-index patch against the exact upstream baseline preserves the implementation changes; the downloadable LAN package was saved separately. GitHub publication and a READY preview do not satisfy the pending production acceptance gates above.
