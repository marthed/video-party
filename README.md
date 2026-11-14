# Video Party

A Chrome extension for watching a video together on different computers. When one person plays, pauses or seeks, everyone else's video does the same.

## How it works

```
 Your Chrome                                         Friend's Chrome
┌───────────────────────────┐                     ┌───────────────────────────┐
│ content.js  (video page)  │                     │ content.js  (video page)  │
│  listens: play/pause/seeked│                    │  applies: play()/pause()/ │
│  applies remote events    │                     │  currentTime = t          │
│        ▲  │               │                     │        ▲  │               │
│        │  ▼               │                     │        │  ▼               │
│ background.js (router)    │                     │ background.js (router)    │
│        ▲  │               │   WebRTC data       │        ▲  │               │
│        │  ▼               │   channel (P2P)     │        │  ▼               │
│ offscreen.js (Trystero) ◄─┼─────────────────────┼─► offscreen.js (Trystero) │
└───────────────────────────┘                     └───────────────────────────┘
              └──── finds each other via public Nostr relays ────┘
                    (signaling only, encrypted with the room code)
```

- **Peer-to-peer.** Playback events go straight between the browsers over a WebRTC data channel. You don't run a server.
- **Signaling.** WebRTC needs a way for two browsers to find each other and swap connection details (SDP and ICE). [Trystero](https://github.com/dmotz/trystero) handles that over free public Nostr relays. The handshake is encrypted with a key derived from the room code. After the connection is up, the relays aren't used.
- **Offscreen document.** MV3 service workers can't create `RTCPeerConnection`s, so the room lives in an offscreen document (`offscreen.html`).
- **Echo suppression.** When a remote "pause" is applied, the local `pause` event that results is ignored for about 1s, so it isn't sent back and doesn't cause a loop.
- **Latency compensation.** Peers ping each other every 10s. A "play at t" message is applied at `t + RTT/2`.
- **Late joiners.** When a new peer connects, whoever was in the room first sends their page URL, position and play/pause state. If the joiner is on a different page, their tab opens the host's page first, then syncs.

## Setup

```sh
npm install
npm run build        # bundles src/offscreen.js -> extension/offscreen.bundle.js
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick the `extension/` folder.
3. Both people open the same video page, for example the same YouTube URL.
4. Person A clicks the extension, picks **Start a new party**, and sends the room code to person B.
5. Person B pastes the code and clicks **Join**.

The toolbar badge shows how many people are in the party. It turns green once you're connected.

To test alone, use two Chrome profiles (or one normal and one incognito window with the extension allowed in incognito), each on the same video.

## Sharing / publishing

```sh
npm run package      # builds and writes dist/video-party-<version>.zip
```

- **Friends, without the store:** send them the zip. They unzip it and use **Load unpacked** as above. There are no automatic updates.
- **Chrome Web Store:** upload the same zip. Everything you need to paste into the dashboard (description, permission justifications, privacy answers) is in [`STORE_LISTING.md`](STORE_LISTING.md), and the privacy policy is [`PRIVACY.md`](PRIVACY.md).
- **Icons:** `npm run icons` regenerates `extension/icons/*.png` from the design in `scripts/make_icons.py` (the source artwork is `assets/icon.svg`).

## Files

| File | Role |
|---|---|
| `extension/manifest.json` | MV3 manifest |
| `extension/content.js` | Finds the largest `<video>` on the page, sends its events, applies remote ones |
| `extension/background.js` | Service worker: routes messages and keeps room state in `chrome.storage.session` |
| `src/offscreen.js` | WebRTC room (Trystero). Bundled into `extension/offscreen.bundle.js` |
| `extension/popup.*` | Create/join/leave UI |

## Known limitations

- **Strict NATs.** About 10–15% of networks (some corporate networks, some mobile carriers) block direct P2P connections. Those need a TURN relay server, which isn't truly serverless. You can pass `turnConfig` to `joinRoom` in `src/offscreen.js` (Cloudflare and metered.ca have free tiers).
- **Supported sites only:** SVT Play, YouTube, Netflix, Disney+, Prime Video, HBO Max and Spotify (`host_permissions` in `extension/manifest.json`). To add a site, add its pattern to both `host_permissions` and the first `content_scripts.matches` (keep them identical), and a display name in `extension/sites.js`.
- **Netflix** crashes if `video.currentTime` is set directly, so seeks go through Netflix's player API (`extension/netflix-main.js`, which runs in the page's own context). If Netflix changes that internal API, seeking there breaks.
- **Spotify** is a poor fit: songs play from a media element that's usually not in the page at all, and the page URL doesn't identify the track. Expect it not to work for music.
- No continuous drift correction yet. If the two videos drift apart (for example after buffering), any play, pause or seek re-syncs them.
- Videos inside closed shadow DOM aren't detected.
