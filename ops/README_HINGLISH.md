# Skybreak public multiplayer — deployment handoff

Frontend Vercel par hai. Yeh setup **alag continuous match worker** chalata hai: game → secure WSS → protocol-2 worker → shared match. Ek worker, ek room aur maximum eight clients se shuru karo. Online Open Skies 2–4 players ka hai.

**Abhi kya chahiye:** authorized Linux VPS access, us VPS par point karta DNS hostname, Docker Engine/Compose, aur optional voice ke liye actual coturn-compatible TURN service. In files ko banana ya CI pass hona public service deploy hona nahi hai. Naya paid resource bina approval create nahi kiya gaya.

## 1. Host aur cost decide karo

Existing suitable VPS ho toh reuse kar sakte ho. Ek starter option DigitalOcean Basic 1 vCPU / 1 GiB RAM / 25 GiB disk / 1,000 GiB transfer, **US$6/month** hai (29 September 2026 ko official pricing check ki). Tax, domain, backups aur extra transfer alag ho sakte hain. Yeh guaranteed production capacity nahi: eight-client host benchmark aur resource/transfer alerts zaroor check karo. Caddy aur TURN bhi resources consume karte hain. Provider billing/access approval ke bina provisioning mat karo.

Source: https://www.digitalocean.com/pricing/droplets

## 2. Authorized host par source aur DNS

- DNS A record, jaise `match.your-domain.com`, VPS ke actual public IP par point kare. Naam example hai; domain khareeda/configure nahi kiya gaya.
- Docker Engine aur Compose installed hone chahiye. TCP 80/443 Caddy ke liye; SSH sirf operator ke trusted access se. Match port 8080 public expose nahi hota.
- Authorized feature branch checkout karo aur exact reviewed commit note karo. Existing files/changes ko reset mat karo.

```sh
git clone --branch feature/skybreak-40-upgrade https://github.com/mayankkyadavvv-ai/Skybreak_123.git
cd Skybreak_123
git rev-parse HEAD
```

Source ke local modifications nahi hone chahiye. Runtime commit aur report ka full SHA match karo; branch label akela sufficient nahi.

## 3. Worker configuration

```sh
umask 077
cp ops/worker.env.example ops/.env.worker
```

`ops/.env.worker` edit karo. `SKYBREAK_ALLOWED_ORIGINS` mein exact authorized frontend origins comma se separate karo: chosen preview hostname aur, jab production promotion authorized/verified ho, `https://skybreak-iota.vercel.app`. Wildcard, path, credentials aur production HTTP origins reject honge. Trailing slash normalize hota hai.

Voice provisioning nahi hai toh STUN/TURN fields blank rehne do; game explicitly unavailable relay report karega. TURN URLs aur secret mein se sirf ek set karna startup failure hai. Production secret minimum 32 characters chahiye. File Git/Docker build context se excluded hai; ise chat, PR, screenshots ya frontend mein paste mat karo.

VPS shell mein apna actual DNS hostname set karo; neeche ka example replace karna zaroori hai:

```sh
export SKYBREAK_MATCH_DOMAIN=match.your-domain.com
export SKYBREAK_DEPLOY_REVISION=$(git rev-parse HEAD)
docker compose -f ops/compose.yaml config --quiet
docker compose -f ops/compose.yaml up -d --build
docker compose -f ops/compose.yaml ps
```

Caddy automatic HTTPS aur WebSocket reverse proxy handle karta hai. DNS/ports correct hone ke baad actual valid certificate issue hona chahiye. Certificate errors ignore mat karo. Caddy data/config volumes certificate state preserve karte hain; `down -v` use mat karo. Match process restart se in-memory parties khatam hoti hain, isliye update empty server par karo.

Production validation missing origin, malformed port/capacity/revision aur incomplete TURN settings ko listener start hone se pehle reject karti hai. Default production budget 8 clients/1 room hai. Container read-only, non-root worker, bounded logs aur healthcheck use karta hai. `cpus`/memory limits availability guarantee nahi hain; actual usage monitor karo.

## 4. Actual hosted-worker check

Node 22+ aur `npm ci` wale authorized operator machine se run karo. Yeh check **sirf idle worker** par chalega, ek temporary QA room banayega aur leave/cleanup verify karega. Running players milne par stop ho jayega. Endpoint ko kisi unrelated service par point mat karo.

```sh
export SKYBREAK_VERIFY_ENDPOINT=wss://match.your-domain.com/ws
export SKYBREAK_VERIFY_ORIGIN=https://your-exact-preview.vercel.app
export SKYBREAK_VERIFY_REVISION=FULL_DEPLOYED_GIT_SHA
npm run verify:server
```

Actual values replace karo. Result `qa-artifacts/endpoint-smoke.json` mein save hota hai. Check: readiness/version/revision → authorized origin → create/join/ready/start → acknowledged input → **10-second disconnect** → same identity/epoch → cleanup. Report credentials/session tokens save nahi karta. Exit `0` pass, `1` fail, `2` endpoint/origin missing. Missing inputs par network request nahi hoti. Plain WS sirf loopback test ke liye allowed hai; public endpoint WSS hi chahiye.

GitHub CI same script ko actual production Docker container par loopback se chalata hai. Yeh public DNS/TLS, two-network gameplay ya device test ka substitute nahi hai.

## 5. Voice relay setup aur real test

Current server coturn REST shared-secret mode ke liye HMAC-SHA1 credentials issue karta hai. Party membership ke baad credential lifetime 10 minutes hai. Client expiry se ek minute pehle renew karta hai aur existing peer configuration/ICE update karta hai; renewal na aaye toh mic/peers close hote hain. Team/mode switch par existing voice membership revoke hoti hai aur pilot ko dobara opt in karna hota hai. TURN provider/server par matching shared secret, real relay hostname, public relay ports aur valid TLS configuration operator ko provide karni hogi. Permanent secret kabhi browser ko nahi bheja jaata.

Worker secret storage mein configure karo:

```dotenv
SKYBREAK_STUN_URLS=stun:relay.your-domain.com:3478
SKYBREAK_TURN_URLS=turn:relay.your-domain.com:3478?transport=udp,turns:relay.your-domain.com:5349?transport=tcp
SKYBREAK_TURN_SECRET=YOUR_SERVER_ONLY_STRONG_SHARED_SECRET
```

Placeholder deploy mat karo. Worker aur relay clock synchronized honi chahiye. Coturn `use-auth-secret`/`static-auth-secret`, realm, external IP mapping, certificate/key aur chosen relay port range actual host configuration ke according set karo. Open unauthenticated relay mat banao. Managed provider ka incompatible token API seedha is shared-secret field mein paste nahi chalega.

Worker restart ke baad `SKYBREAK_VERIFY_REQUIRE_RELAY=1 npm run verify:server` configuration aur **expiring credential issuance** check karta hai. Report intentionally `voiceRelayMediaVerified: false` rakhta hai: credentials milna actual audio relay chalne ka proof nahi.

Do real networks par mic permission/denial, PTT, mute/deafen, teammate volume, leave/rejoin aur actual relay-selected ICE path verify karo. Browser WebRTC diagnostics mein selected candidate pair ka `relay` type aur real audible audio record karo; credentials/SDP/candidate private addresses public report mein include mat karo. TURN access abhi nahi mila, isliye F38 blocked hai.

Primary references: https://github.com/coturn/coturn/blob/master/examples/etc/turnserver.conf and https://webrtc.org/getting-started/turn-server/

## 6. Vercel connect aur promotion

Existing Skybreak project ke **Preview** environment mein public `VITE_SKYBREAK_WS_URL=wss://actual-match-domain/ws` set karke rebuild karo. Yeh URL secret nahi hai; TURN secret Vercel frontend variables mein mat rakho. CSP build time par isi explicit WSS origin ko allow karta hai. Chosen preview origin worker allowlist mein bhi hona chahiye. Existing Vercel protection retain karo.

Preview mein actual room create/join, four-human/two-network shared mission, reconnect/debrief, physical touch/controllers/split-screen aur offline two-device LAN evidence collect karo. Controls: **↑ nose up, ↓ nose down, E missile**. Procedures: `UPGRADE40_QA.md`; playing instructions: `PLAYING_GUIDE_HINGLISH.md`.

Saare required gates pass hone ke baad hi review/merge/promote karo. `UPGRADE40_RELEASE.md` compatible frontend/backend rollback explain karta hai. Vercel preview READY ya local CI green hone se production gate pass nahi hota.

Official gateway references: https://caddyserver.com/docs/running and https://caddyserver.com/docs/caddyfile/directives/reverse_proxy. Image is pinned to Caddy 2.11.4; CI validates the shipped Compose/Caddy configuration.
