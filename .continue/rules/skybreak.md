# SKYBREAK repository instructions

You are working on SKYBREAK, an existing Three.js fighter-jet game. Treat repository files and tests as the source of truth.

## Working rules

- Inspect relevant code before editing. Never invent files, systems, controls, APIs, or acceptance results.
- Preserve existing architecture unless a change is necessary and justified.
- Prefer small, reviewable changes over broad rewrites.
- Keep flight smooth and beginner-friendly.
- Mandatory keyboard bindings: Arrow Up = nose up, Arrow Down = nose down, E = missile fire.
- Do not expose secrets in client code, committed files, logs, screenshots, or VITE_-prefixed variables.
- Do not edit generated output, node_modules, dist, qa-artifacts, or .vercel.
- Before changing gameplay, identify affected tests and regression risks.
- After implementation, run the relevant tests and production build. Report exactly what ran and what passed or failed.
- For browser claims, distinguish automated/emulated verification from physical hardware, controller, touch, network, and human feel testing.
- Do not claim deployment, multiplayer, hardware, or external-service verification unless it actually occurred.

## First-pass repository takeover

When asked to understand the project, inspect package.json, entry points, src, public/assets, tests, worker/server code, configuration, docs, and GitHub workflows. Produce a concise architecture map with exact paths, runtime flow, controls, dependencies, current feature status, known risks, and recommended work order. Do not modify code during that first pass unless explicitly asked.
