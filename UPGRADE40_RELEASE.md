# Skybreak 2.0.0-rc.1 — release gates and operations

Protocol **2**. This is a release candidate, not a verified production release. Existing production `skybreak-iota.vercel.app` remains on deployment `dpl_t1vnXgFBprQXXBnd4Kkm3RAeGZAu`. The approved project is `skybreak`, team `team_xDpOqkSlmQt7VSM3F5XKYKya`; reuse it after the required gates pass.

## Concrete external requirements

1. A WebGL-capable browser on representative hardware, plus real keyboard/touch/controllers for the acceptance procedures in `UPGRADE40_QA.md`.
2. One authorized continuous Node match worker with HTTPS/WSS termination and a public endpoint. Start with one room / eight clients, one worker, no load-balanced replicas. The scripted capacity report covers one room, not a fleet.
3. For cross-network voice: an authorized STUN/TURN service with coturn-compatible REST credentials (HMAC-SHA1 shared secret), TLS certificate and public relay ports. No relay credentials are bundled.
4. Four people across two actual networks for shared mission/voice testing, plus two physical devices for disconnected-internet LAN and two local controllers for split-screen.

No new paid resource has been purchased. An existing suitable VM can be reused. A concrete starter option is a DigitalOcean Basic 1-vCPU / 1-GiB / 25-GiB VM, listed at **US$6/month with 1,000 GiB transfer** on 2026-09-28. This is an initial capacity candidate, not a measured performance guarantee. Taxes, domains, backups and transfer overages are additional; provider access and spending scope must be authorized before provisioning. Source: https://www.digitalocean.com/pricing/droplets . Voice relay and continuous room traffic consume transfer; use measured bytes/second from the QA report when setting alerts and usage limits.

Vercel Functions currently support WebSockets in beta, but connections have duration limits and new connections need not land on the same instance. This in-memory authoritative server must not be deployed there as if every client were guaranteed the same persistent room owner. A distributed store/room router would be a further architecture change; the prepared deployment uses a continuous single worker. Source checked 2026-09-28: https://vercel.com/docs/functions/websockets .

## Prepared worker configuration

`Dockerfile.match` is provided; its container build has not been run here. The Node entry point itself is exercised by the real-socket soak and LAN package checks.

```sh
docker build -f Dockerfile.match -t skybreak-match:2.0.0-rc.1 .
docker run --name skybreak-match --restart unless-stopped \
  --env-file /secure/skybreak-match.env -p 127.0.0.1:8080:8080 \
  skybreak-match:2.0.0-rc.1
```

The env file is created through the authorized host's secret facility, outside the repository. Example placeholders are in `.env.example`:

```dotenv
SKYBREAK_ALLOWED_ORIGINS=https://skybreak-iota.vercel.app
SKYBREAK_MAX_CLIENTS=8
SKYBREAK_MAX_ROOMS=1
HOST=0.0.0.0
PORT=8080
SKYBREAK_STUN_URLS=stun:relay.YOUR_DOMAIN:3478
SKYBREAK_TURN_URLS=turn:relay.YOUR_DOMAIN:3478,turns:relay.YOUR_DOMAIN:5349
SKYBREAK_TURN_SECRET=SET_ONLY_IN_SERVER_SECRET_STORAGE
```

The TURN server must use the same shared secret and issue/accept expiring REST credentials; clients receive 10-minute credentials after authorized party membership. Enable a real relay-required test before claiming voice delivery. Do not put secrets in any `VITE_` variable.

The Vercel frontend needs public `VITE_SKYBREAK_WS_URL=wss://match.YOUR_DOMAIN/ws`. Rebuild after changing it: CSP is generated for that explicit origin. Only add actual preview origins to the worker allowlist when authorized. Keep existing deployment protection; do not loosen it for verification.

## Limits, monitoring and lifecycle

- 60 Hz shared simulation, 20 Hz filtered snapshots. Own full state supports reconciliation; remote state is compact and sensor-filtered.
- Eight humans maximum in supported competitive rooms; Open Skies supports two to four. Fixed equal multiplayer aircraft budget. One process owns all current rooms; a process restart loses them.
- Maximum message 16 KiB, socket queue budget 512 KiB, input/room/chat/signalling rate limits; private unguessable resume tokens are rotated. Resume grace 45 seconds. Tokens are bearer credentials, not a full account identity system; never log/share them.
- `/health` and `/ready` report version/protocol, connections, rooms, reservations, rejects, byte counters and room tick/snapshot costs. No token, TURN secret or callsign is included. Poll actual health and alert on repeated failures, high tick cost, dropped snapshots, reconnect churn and capacity saturation. Configure provider resource/transfer alerts before increasing limits.
- The eight-client soak is a scripted one-host test. CPU/RSS includes the worker plus eight prediction clients. It is not a physical GPU benchmark or a claim that 100 rooms can be hosted.
- Keep a single replica until an explicit room router/owner design is added. Do not share in-memory sessions across arbitrary replicas or promise process-failure recovery.
- SIGTERM/SIGINT closes room timers and sockets with shutdown status. Schedule worker replacement between matches; tell players to finish first. No zero-downtime migration claim.

## Promotion checklist

1. Confirm intended GitHub branch commit; run `npm ci`, `npm test`, `npm run build`, `npm run audit:secrets`, `npm run verify:site`.
2. Deploy the matching protocol-2 worker to the authorized host, verify public WSS and health/version. Run real create/join, steering, lock/fire, objectives, 10-second reconnect and shared result from the candidate frontend.
3. Collect the graphical/device/human acceptance in `UPGRADE40_QA.md`. Confirm four-person co-op on two networks, voice relay, eight-client capacity, physical LAN and split-screen. Retain failures with fixes; update the matrix.
4. Only after those required gates pass, review/merge the feature branch via the permitted GitHub workflow. No force push or bypass of repository protections. Promote the exact tested Vercel build to the existing project.
5. Recheck `https://skybreak-iota.vercel.app/`, Help/storage routes, asset headers, default pitch mapping, room join, objective/debrief and reconnect against the matching backend. Record deployment ID, commit and endpoint version.

## Rollback

Retain production deployment `dpl_t1vnXgFBprQXXBnd4Kkm3RAeGZAu` until the candidate passes. If a released upgrade regresses, restore that frontend through Vercel rollback and restore its compatible previous backend/endpoint configuration together. Protocol-1 and protocol-2 clients/servers cannot be mixed. Before worker replacement, end/drain matches; volatile room state cannot survive a process restart. Local settings migration preserves legacy bindings; avoid deleting local data during rollback. Campaign/training storage is separate from legacy progression.
