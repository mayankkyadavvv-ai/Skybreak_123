import {createPreviewServer} from "../scripts/preview.mjs";
createPreviewServer().listen(4173,"127.0.0.1",()=>console.log("Skybreak: http://localhost:4173 — close this window to stop."));
