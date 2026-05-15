# Built Chrome extension (loadable)

Prebuilt artifact of the MV3 extension. Source lives in `client/extension/` (manifest) and `client/userscript/` (content script). Rebuild with `node build.mjs`.

## Install

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and pick this folder.

This build points at `ws://localhost:8787`. For a production relay, rebuild with:

```bash
WS_URL=wss://your-relay.workers.dev TARGET=ext node build.mjs
cp dist/extension/* extension-build/
```
