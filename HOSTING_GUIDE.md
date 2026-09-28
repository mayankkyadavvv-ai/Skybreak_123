# Hosting Skybreak

Deployment is now requested, but the connected deploy action is unavailable in this workspace. The intended existing origin is `https://skybreak-iota.vercel.app`. No access-protection settings were changed.

## Static game

Build with `npm ci` then `npm run build`; publish `dist`. The package includes Vercel configuration, generated `_headers` for compatible static hosts, and a branded `404.html`. There is no catch-all rewrite to the game. Clean public paths resolve to their matching HTML pages.

The separate `skybreak-deploy-ready.zip` contains the clean prebuilt output and its own static-only `vercel.json`: installation/build are skipped and the output directory is `.`. Extract it first. The source archive retains the normal Vite build configuration. Neither archive constitutes a live deployment or a completed release acceptance gate.

HTML and ordinary public files should revalidate. Vite-generated hashed JS/CSS under `/assets/` use immutable caching. Keep future model assets versioned/fingerprinted if placed under this cached directory. Do not cache policy or HTML files as immutable.

## Separate multiplayer server

A static site does not run `server/index.js`. Host that Node/WebSocket service separately or route a WebSocket-capable service on the same origin.

If using a separate server, set the public build variable `VITE_SKYBREAK_WS_URL` to its `wss://` address. Run `npm run headers` and `npm run build` with that value **before uploading the source**, so `vercel.json` contains the same explicit connection origin that the client permits. Vercel reads its configuration before the remote build; editing headers only during that build is not sufficient for a new origin.

`.env.example` documents the public variable. `.env*`, `.vercel`, account files, dependency caches and credentials are excluded from exports. No server secret belongs in client code or a VITE variable.

## Verify after a future release

- Confirm the intended Vercel team/project and existing protection settings.
- Check HTTPS certificate, HTTP-to-HTTPS redirect, CSP, MIME types and the platform's actual HSTS response. This pass did not verify live TLS/HSTS and does not claim preload/subdomain coverage.
- Test clean routes and direct reloads. A missing JS/GLB must return a 404, not the game HTML.
- Check that the WSS connection and server origin work with the deployed CSP.
- Check actual provider cookies, logs, analytics and retention against the draft privacy notice.
- Keep preview deployments protected. Preview builds (`VERCEL_ENV=preview` or `SKYBREAK_PREVIEW=1`) contain `noindex` metadata; that is not an access-control mechanism.

## Local acceptance

`npm run preview` uses `scripts/preview.mjs`, with strict paths, status codes, MIME and cache headers. It is a local test server, not a production service. The optional browser script in QA.md can run against it.

Configuration reference: [Vercel vercel.json documentation](https://vercel.com/docs/project-configuration/vercel-json).
