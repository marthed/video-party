// Runs in the extension's offscreen document (MV3 service workers can't use
// RTCPeerConnection). Owns the Trystero room: peers find each other through
// public Nostr relays (signaling only, encrypted), then talk directly over
// WebRTC data channels.
import { joinRoom, selfId, getRelaySockets } from 'trystero';

const APP_ID = 'video-party-extension-v1';
const PING_INTERVAL_MS = 10_000;
const RELAY_REPORT_MS = 2_000;

let room = null;
let sync = null;
let hello = null;
let want = null;
let joinedAt = 0;
let pingTimer = null;
let relayTimer = null;
const rtt = new Map(); // peerId -> round-trip ms

const toBg = (msg) => chrome.runtime.sendMessage({ target: 'background', ...msg }).catch(() => {});
const log = (...args) => console.log('[video-party]', ...args);
const logPopup = (text) => toBg({ type: 'log', text });
const peerIds = () => (room ? Object.keys(room.getPeers()) : []);
const reportPeers = () => toBg({ type: 'peers', count: peerIds().length });

// Signaling health: how many Nostr relay websockets are open (readyState 1).
function reportRelays() {
  const sockets = Object.entries(getRelaySockets());
  const open = sockets.filter(([, s]) => s.readyState === 1).length;
  toBg({ type: 'relays', open, total: sockets.length });
}

async function measure(peerId) {
  try {
    const ms = await room.ping(peerId);
    if (!rtt.has(peerId)) logPopup(`   ping ${Math.round(ms)} ms`);
    rtt.set(peerId, ms);
  } catch {
    /* peer may have left */
  }
}

function join(roomId) {
  leave();
  joinedAt = Date.now();
  log('joining room', roomId, 'as', selfId);
  room = joinRoom({
    appId: APP_ID,
    // Public relays routinely rate-limit or reject; only one needs to work.
    // Relay health is shown in the popup instead of console warnings.
    relayConfig: { warnOnRelayFailure: false },
  }, roomId, {
    onJoinError: (d) => {
      log('join error', d);
      logPopup(`⚠ Connection error: ${d?.error ?? 'unknown'}`);
      toBg({ type: 'error', message: String(d?.error ?? 'Could not connect to peer') });
    },
  });

  // Playback events: {kind: 'play'|'pause'|'seek'|'state', time, playing}
  sync = room.makeAction('sync');
  sync.onMessage = (event, { peerId }) => {
    log('received', event, 'from', peerId);
    toBg({ type: 'remote-event', event, latency: (rtt.get(peerId) ?? 0) / 2 });
  };

  // On connect, peers exchange join times; the peer that was in the room
  // first sends its current playback state to the newcomer.
  hello = room.makeAction('hello');
  hello.onMessage = (data, { peerId }) => {
    if (data?.joinedAt > joinedAt) toBg({ type: 'need-state', peerId });
  };

  // Explicit "send me your state", used after we navigated to the host's page.
  want = room.makeAction('want');
  want.onMessage = (_data, { peerId }) => toBg({ type: 'need-state', peerId });

  room.onPeerJoin = (peerId) => {
    log('peer joined', peerId);
    logPopup(`👋 Friend connected (${peerId.slice(0, 6)})`);
    hello.send({ joinedAt }, { target: peerId });
    measure(peerId);
    reportPeers();
  };
  room.onPeerLeave = (peerId) => {
    log('peer left', peerId);
    logPopup(`👋 Friend disconnected (${peerId.slice(0, 6)})`);
    rtt.delete(peerId);
    reportPeers();
  };

  pingTimer = setInterval(() => peerIds().forEach(measure), PING_INTERVAL_MS);
  relayTimer = setInterval(reportRelays, RELAY_REPORT_MS);
  reportPeers();
}

function leave() {
  clearInterval(pingTimer);
  clearInterval(relayTimer);
  rtt.clear();
  room?.leave();
  room = sync = hello = want = null;
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== 'offscreen') return false;
  switch (msg.type) {
    case 'join':
      join(msg.roomId);
      break;
    case 'leave':
      leave();
      break;
    case 'broadcast':
      log('sending', msg.event, 'to', peerIds().length, 'peer(s)');
      sync?.send(msg.event);
      break;
    case 'request-state':
      want?.send(true);
      break;
    case 'send-state':
      sync?.send({ ...msg.state, kind: 'state' }, { target: msg.peerId });
      break;
  }
  return false;
});
