Updated 2026-09-28

# Privacy notice.

**Draft — owner review pending.** The operator identity, contact route, applicable jurisdiction and provider retention details have not been supplied. This notice is not a completed legal policy.


## Local game data

This build stores the following data locally on your device. These entries are not an account or cloud backup and have no programmed expiry. Browser clearing, private browsing and device changes can remove them.


| Entry | Contents | Purpose |
|---|---|---|
| skybreak-settings | Controls, graphics, camera, HUD and audio preferences | Remember your chosen settings |
| skybreak_jet_config_v1 | Selected aircraft, livery and modifications | Restore your hangar selection |
| skybreak_pilot_profile_v1 | Pilot callsign, XP, rank, unlocks and career totals | Keep local progression |
| skybreak_pilot_name | Multiplayer display name | Reuse your chosen callsign |
| skybreak_server_url | Selected multiplayer WebSocket endpoint | Remember the selected server |

## Multiplayer

When you choose multiplayer, the client opens a WebSocket connection to the selected server. It sends your display name, room and matchmaking choices, aircraft/loadout information, flight state and combat actions. The server relays relevant state, names, scores and quick commands to other players.

The supplied server keeps active clients, rooms and matches in memory. It logs connection/disconnection events using temporary client IDs and operational errors. This build does not add a persistent player database. Provider access logs and retention have not been verified. Other server operators may use different settings.


## Hosting & connections

The website host receives ordinary request information such as IP address, browser request headers and requested paths. The multiplayer host receives connection information too. Local reset does not erase provider logs or copies already received by other players.


## Analytics, ads & cookies

No analytics, advertising SDK, tracking pixel, third-party font or application cookie writer was found in the reviewed source. The game uses localStorage for the features listed above. Provider-level cookies or analytics must be checked on the deployed site. No optional tracking categories are presented as active.


## Your choices

Play single-player without opening a multiplayer session. Choose a non-identifying callsign. Use [Storage settings](https://skybreak-iota.vercel.app/storage) to remove the five local entries, or clear site data in your browser. Close other Skybreak tabs before resetting so they do not save their current state again.


## Operator & requests

The operator's identity and contact details are pending confirmation. Applicable rights, lawful bases, international transfers and provider retention periods require owner review before this becomes a final privacy policy. No GDPR, COPPA or other compliance certification is claimed.
