# Video Party: Privacy Policy

_Last updated: November 8, 2026_

Video Party is a browser extension that keeps video playback (play, pause and position) in sync between friends who join the same "party". It has no accounts, no analytics and no servers of its own.

## What data is handled

While you are in a party, and only for the browser tab you started or joined the party in, the extension handles:

| Data | Why | Who receives it |
|---|---|---|
| **Playback events**: play, pause, seek, and the current video time | To keep everyone's video in sync | The other people in your party |
| **The URL of the synced tab** | So friends who join open the same video page | The other people in your party, when they join |
| **The room code** | To find the other people in your party | Public signaling relays (see below), as a derived identifier |

The extension does **not** read or send page content, cookies, passwords, form data, browsing history, or anything from tabs that are not part of a party. On other pages, its content script stays inactive.

## How data is sent

- **Directly between participants.** Playback events and the page URL go straight from your browser to your friends' browsers over an encrypted WebRTC connection. They do not pass through any server operated by Video Party.
- **Public signaling relays.** To set up that direct connection, browsers have to find each other first. The extension uses public [Nostr](https://nostr.com) relays for this, through the open-source [Trystero](https://github.com/dmotz/trystero) library. The relays receive connection setup messages, encrypted with a key derived from the room code, and your IP address, as with any internet connection. They do not receive playback events or URLs.
- **STUN servers.** Google (`stun.l.google.com`) and Cloudflare (`stun.cloudflare.com`) STUN servers are contacted to discover your public IP address so a direct connection can be established. This is standard for WebRTC.
- **Your IP address is visible to the other participants**, as is normal for any peer-to-peer connection.

## Storage

The extension stores only the current party's state (room code, synced tab, connection status and a short event log) in the browser's session storage. It is erased when you leave the party or close the browser. Nothing is stored on any server.

## Sharing and selling

Video Party does not sell, rent or share data with anyone, and does not use data for advertising, profiling, credit decisions, or any purpose other than syncing video playback.

## Who can join your party

Anyone who has your room code can join your party and will see your synced tab's URL and playback position. Only share the code with people you want to watch with. Leaving the party disconnects everyone from you immediately.

## Contact

Questions about this policy: **martinhedlund@live.com**
