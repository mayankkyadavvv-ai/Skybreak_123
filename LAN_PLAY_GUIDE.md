# Skybreak — same Wi-Fi play

Host laptop par **Node.js 22 ya newer** ek baar install hona chahiye. Har friend ko Node.js install karna zaroori nahi: unka browser game kholega. Windows, macOS aur Linux host supported hain; physical device results QA report mein alag record hote hain.

## Ready package se start

1. ZIP ko poora extract karo. `dist`, `skybreak-lan.cjs` aur launcher same extracted folder mein rakho.
2. Windows par `START_SKYBREAK_LAN.cmd` double-click karo. macOS/Linux par terminal mein `sh START_SKYBREAK_LAN.sh` chalao.
3. Host browser mein printed `http://localhost:4173/lan` kholo. QR aur network address wahin milenge.
4. Friends same trusted Wi-Fi/Ethernet par connect karein. Unhe **LAN address** do, jaise `http://192.168.1.20:4173/lan`. `localhost` unke device par tumhara computer nahi hai.
5. **Play on this device → Play with Friends**. Host room banaye, friend room code/invite se join kare, Ready dabaye, phir host match start kare.
6. Launcher open rakho. Band karne ke liye **Ctrl+C** dabao. Closing the host process ends active matches; a process restart does not restore the previous match.

Ready package mein frontend, match service, QR generator aur runtime dependencies bundled hain. Initial Node/package setup ke baad npm install ya internet ki zaroorat nahi. Online voice/relay services offline package ka hissa nahi hain.

## Source se developer setup

```sh
npm ci
npm run build
npm run lan
```

Build/tested distribution package:

```sh
npm run package:lan
npm run verify:lan
```

Package `qa-artifacts/skybreak-lan-release.zip` mein banta hai. Manifest har bundled file ka SHA-256 aur compatible protocol version store karta hai. Source change karne ke baad fresh build/package banao. Purana frontend aur naya server mix mat karo.

## Connection problem ho to

- `/lan` page ka **Check again** actual local server health verify karta hai.
- Windows Firewall pooche to Node.js ko apne trusted **Private networks** par allow karo. Firewall disable, Public networks allow ya router port forwarding ki zaroorat nahi.
- Guest Wi-Fi/client isolation friends ke devices ko ek dusre tak pahunchne se rok sakta hai. Trusted home Wi-Fi/Ethernet use karo.
- Multiple adapter addresses dikh rahe hon to Wi-Fi/Ethernet adapter wala address try karo; VPN/virtual adapter address doosre device se reachable nahi bhi ho sakta.
- Port busy ho to old launcher close karo. Alternate port: Windows Command Prompt mein `set SKYBREAK_LAN_PORT=4174`, phir `node skybreak-lan.cjs`; macOS/Linux mein `SKYBREAK_LAN_PORT=4174 node skybreak-lan.cjs`.
- HTTP LAN page browser ke liye secure context nahi ho sakta. Microphone aur kuch controller/fullscreen features browser policy ke hisaab se unavailable honge; permissions ko bypass mat karo. Keyboard/touch gameplay aur text/pings independently use karo. Trusted HTTPS hosting optional secure APIs ka proper route hai.

## Offline two-device acceptance

1. Host aur second device same network par connect rakho; router ka internet/WAN disconnect karo (local Wi-Fi band mat karo).
2. Dono devices par page reload karo. New private room banao aur actual mission join karo.
3. Dono players ka turn, throttle, firing, shared objective state aur completed debrief check karo.
4. Ten seconds ke liye guest connection interrupt karo; allowed grace ke andar same seat restoration check karo.
5. Host launcher Ctrl+C se close karo. Dono clients ko connection loss dikhna chahiye; server port release hona chahiye.
6. Device/browser/network details aur actual result record karo. Two localhost tabs ya scripted WebSocket clients ko two-device test mat count karo.

Mandatory flight controls: **↑ Arrow Up = nose up**, **↓ Arrow Down = nose down**. Default Assisted mode beginner-friendly hai. Full up-to-date controls in-game Help mein milenge.
