# Watch-Party — Chrome extension

Prebuilt MV3 extension, loadable as an unpacked extension. Points at the production relay at `wss://avious-party-relay.avibenabram.workers.dev`.

## Install

1. Download this folder (`extension-build/`) — either clone the repo or download just this folder as a zip from GitHub.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (toggle, top right).
4. Click **Load unpacked** and select this folder.
5. Pin the extension from the puzzle-piece menu so you can see it.

## Use

1. Go to any site with a `<video>` player (Netflix, YouTube, Cineby, your own server, anywhere).
2. The Watch-Party panel appears on the right edge of the page.
3. Enter a display name → click **Join chat**.
4. Click **Copy room link** and send it to a friend. They open the link in their browser with the extension installed and land in the same room.

The first person in a room becomes admin (play/pause/seek controls). The admin can flip on **Free-for-all** to let anyone control playback.

## Updating

Unpacked extensions don't auto-update. To get a new version:

1. Pull the latest `extension-build/` from GitHub (or re-download the zip).
2. Go to `chrome://extensions`, find Watch-Party, click the circular reload icon.

## Privacy

The relay is open — anyone who guesses or is sent your room link can join. Don't share room links publicly. No chat or video data is logged on the server.

## Rebuilding from source

```bash
WS_URL=wss://your-relay.workers.dev npm run build:ext
cp dist/extension/* extension-build/
```
