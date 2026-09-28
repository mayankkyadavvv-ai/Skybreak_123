# Observed data flows — 28 September 2026

Scope: current source, local production output and prior project configuration. Live provider logs/cookies and the separate production multiplayer service were not inspected during this upgrade; deployment was deferred.

| Data / technology | Purpose | Destination / recipients | Retention observed | User control |
|---|---|---|---|---|
| `skybreak-settings` localStorage | Preferences and bindings | Same browser/origin | No programmed expiry | Settings; `/storage` reset |
| `skybreak_jet_config_v1` localStorage | Model, livery, mods | Same browser/origin | No programmed expiry | Hangar; reset |
| `skybreak_pilot_profile_v1` localStorage | Callsign, XP, rank, unlocks, totals | Same browser/origin | No programmed expiry | Dossier; reset |
| `skybreak_pilot_name` localStorage | Multiplayer display name | Stored locally; transmitted when using multiplayer | No programmed expiry locally | Edit callsign; reset |
| `skybreak_server_url` localStorage | Selected server endpoint | Stored locally; used as connection destination | No programmed expiry locally | Browser data/reset; endpoint validation applies |
| WebSocket messages | Matchmaking, room choices, aircraft/loadout, flight/combat, names and quick commands | Selected server; relevant state relayed to players | Active server state in memory; no persistent player database in this code | Stay in single player; leave/disconnect |
| Node operational logs | Connect/disconnect IDs and errors | Server process/provider logging | Provider-dependent; unverified | Operator contact/retention pending |
| Hosting/CDN request data | Deliver pages/assets and security | Site hosting provider | Provider-dependent; unverified | Browser/site connection choices |
| IP address / request metadata | Ordinary network connection information | Host and multiplayer server | Unverified provider retention | Local reset cannot erase these logs |
| Application cookies/sessionStorage/IndexedDB | No implementation identified | None identified | N/A | No invented consent categories |
| Analytics/advertising/error SDKs/tracking pixels | None identified in source | None identified | N/A | Provider-side configuration still needs checking |
| Third-party fonts/images/model downloads | None active; assets are local/procedural | Site origin | Browser caching | Future licensed GLB must use approved local path |

No cookie acceptance wall was added. The storage settings page explains the actual five entries and requires confirmation before deleting them; unrelated origin data is preserved. This does not decide the legal exemption status of each preference for an unknown jurisdiction/audience. Optional tracking, if later added, requires a fresh purpose/applicability review and implementation before it starts.

## Owner facts still needed

Operator/entity name, public contact route, intended audience and relevant jurisdictions, hosting and multiplayer providers/regions, verified log retention, rights request process, international transfers if applicable, and moderation ownership. The Privacy/Terms pages remain labelled drafts and noindex until resolved. Set site.config.js values and finalize the shared page copy; no fictional contacts or blanket compliance assertions have been inserted.
