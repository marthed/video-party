# Chrome Web Store submission kit

Copy and paste these into the [Developer Dashboard](https://chrome.google.com/webstore/devconsole).
Upload `dist/video-party-<version>.zip` (create it with `npm run package`).

---

## Store listing tab

**Name:** Video Party

**Summary** (from manifest, max 132 chars):
> Watch videos together with friends: play, pause and seeking stay in sync between browsers, peer-to-peer.

**Category:** Social & Communication (alternative: Entertainment)

**Language:** English

**Description:**

> Watch videos together with friends who aren't in the same room.
>
> When anyone in the party presses play, pauses or jumps to another point in the video, it happens for everyone else too, wherever they are.
>
> HOW IT WORKS
> 1. Open a video (YouTube, SVT Play and most sites with a regular HTML5 video player).
> 2. Click the Video Party icon and press "Start a new party".
> 3. Send the room code to your friends.
> 4. Your friends click the icon, paste the code and press "Join". Their tab opens the same video at the same position.
>
> PRIVATE BY DESIGN
> • No account or sign-up.
> • Peer-to-peer: playback sync goes directly between your browsers over an encrypted WebRTC connection, not through our servers. We don't run any.
> • Only the tab you start or join a party in is synced. The extension does nothing on other pages.
> • No analytics, no tracking, no ads.
>
> GOOD TO KNOW
> • Everyone needs their own access to the video (e.g. their own streaming subscription). Video Party syncs playback; it doesn't stream the video.
> • A few streaming sites with custom players may not support seeking.
> • On some strict corporate or mobile networks a direct peer-to-peer connection isn't possible.

**Graphic assets:**
- Store icon (128×128): `extension/icons/icon128.png`
- Screenshots (required, at least 1; 1280×800 or 640×400 PNG/JPEG). Suggested shots:
  1. A video page with the popup open, showing "Connected to 1 friend".
  2. Two windows side by side, both on the same video, with the "Friend paused at 12:34" toast visible.
- Small promo tile (440×280): optional.

---

## Privacy tab

**Single purpose description:**
> Video Party syncs video playback (play, pause and seek position) between friends who join the same room, so they can watch the same video together from different computers.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `offscreen` | Extension service workers cannot create WebRTC connections. An offscreen document (reason: WEB_RTC) holds the peer-to-peer connection that sends playback events between party members. |
| `storage` | Stores the current party's state (room code, synced tab ID, connection status) in session storage so it survives the service worker being suspended. Cleared when the user leaves the party. |
| `tabs` | Reads the URL and title of the tab the user chose to sync. The URL is sent to friends joining the party so their tab opens the same video, and the title is shown in the popup. Also used to open the host's video page in a joiner's tab, and to end the party when the synced tab is closed. |
| `scripting` | Injects the content script into the chosen tab when it was already open before the extension was installed or updated, so the user doesn't need to reload the page to start a party. |
| Host permission `<all_urls>` (content script) | Videos can be on any website, so the extension can't know the domains in advance. The content script stays inactive unless its tab is the one the user started or joined a party in. It then only listens to the page's `<video>` element for play, pause and seek and applies friends' actions. It also has to run on any site because a joining friend's tab is automatically opened on the host's video page, which can be any domain. |

**Remote code:** No, I am not using remote code. (All JavaScript, including the Trystero library, is bundled in the package.)

**Data usage: what user data do you collect?**
Check **Web history** (the URL of the synced tab is sent to other party members). Leave everything else unchecked.

> The URL is only transmitted directly, peer-to-peer, to the friends in the user's own party and is never collected by the developer. If you'd rather be conservative, checking "Website content" as well is harmless.

**Certify all three:**
- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases
- ☑ I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** public URL to `PRIVACY.md`, for example the file on GitHub (`https://github.com/<you>/video-party/blob/main/PRIVACY.md`) or a GitHub Pages / Gist link. Fill in the contact email first.

---

## Distribution tab

**Visibility:** **Unlisted** (only people with the link can install it), or Public.
**Regions:** All regions.
**Pricing:** Free.

---

## Submitting updates

1. Bump `"version"` in `extension/manifest.json`. Every upload must have a higher version.
2. `npm run package`
3. Dashboard → Package → **Upload new package** → Submit for review.
