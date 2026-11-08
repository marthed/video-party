// Service worker: routes messages between the popup, the synced tab's
// content script(s), and the offscreen document that owns the WebRTC room.
//
// Message routing convention: every chrome.runtime.sendMessage reaches ALL
// extension contexts (background, offscreen, popup), so messages carry a
// `target` field and each context ignores what isn't meant for it.

const OFFSCREEN_URL = 'offscreen.html';
const DEFAULT_STATE = { roomId: null, tabId: null, peers: 0, error: null, relaysOpen: 0, relaysTotal: 0, log: [], syncPending: false };
const MAX_LOG = 40;

const getState = () => chrome.storage.session.get(DEFAULT_STATE);
const setState = (patch) => chrome.storage.session.set(patch);

// Event log shown in the popup. Writes are chained so concurrent appends don't
// clobber each other.
let logChain = Promise.resolve();
function addLog(text) {
  console.log('[video-party]', text);
  logChain = logChain.then(async () => {
    const { log } = await getState();
    const time = new Date().toLocaleTimeString([], { hour12: false });
    await setState({ log: [...log, `${time}  ${text}`].slice(-MAX_LOG) });
  });
  return logChain;
}

const fmt = (s) => {
  s = Math.max(0, Math.floor(s ?? 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
// Same video? Ignore the hash and timestamp params (YouTube's t=, start=),
// which differ between peers but point at the same video.
function sameVideoUrl(a, b) {
  try {
    const norm = (u) => {
      const url = new URL(u);
      url.hash = '';
      ['t', 'start', 'time_continue'].forEach((p) => url.searchParams.delete(p));
      url.searchParams.sort();
      return url.href;
    };
    return norm(a) === norm(b);
  } catch {
    return false;
  }
}
const isWebUrl = (u) => /^https?:\/\//i.test(u ?? '');

const describe = (e) => `${e.kind} at ${fmt(e.time)} (${e.playing ? 'playing' : 'paused'})`;

let creatingOffscreen = null;
async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_URL,
        reasons: ['WEB_RTC'],
        justification: 'Peer-to-peer connection used to sync video playback between friends.',
      })
      .finally(() => (creatingOffscreen = null));
  }
  await creatingOffscreen;
}

async function closeOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length) await chrome.offscreen.closeDocument();
}

const toOffscreen = (msg) => chrome.runtime.sendMessage({ target: 'offscreen', ...msg }).catch(() => {});
const toTab = (tabId, msg) => chrome.tabs.sendMessage(tabId, msg).catch(() => undefined);

async function setBadge(peers, inRoom) {
  await chrome.action.setBadgeText({ text: inRoom ? String(peers + 1) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: peers > 0 ? '#16a34a' : '#6b7280' });
}

async function join(roomId, tabId) {
  const prev = await getState();
  if (prev.tabId && prev.tabId !== tabId) toTab(prev.tabId, { type: 'deactivate' });

  await ensureOffscreen();
  if (prev.roomId !== roomId) {
    await setState({ peers: 0 });
    await toOffscreen({ type: 'join', roomId });
  }
  await setState({ roomId, tabId, error: null });
  if (prev.roomId !== roomId) addLog(`Joined room ${roomId}`);
  const res = await toTab(tabId, { type: 'activate' });
  if (!res) {
    // Tab was opened before the extension was installed/reloaded: inject now.
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] }).catch(() => {});
    await toTab(tabId, { type: 'activate' });
  }
  const { peers } = await getState();
  await setBadge(peers, true);
}

async function leave() {
  const { tabId } = await getState();
  if (tabId) toTab(tabId, { type: 'deactivate' });
  await toOffscreen({ type: 'leave' });
  await closeOffscreen();
  await setState(DEFAULT_STATE);
  await setBadge(0, false);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target === 'offscreen') return false;

  // --- From the offscreen document ---
  if (msg.target === 'background') {
    (async () => {
      const state = await getState();
      switch (msg.type) {
        case 'remote-event': {
          const ev = msg.event;
          addLog(ev.time == null ? `⬇ Friend is on ${ev.url}` : `⬇ Friend: ${describe(ev)}`);
          if (!state.tabId) break;

          // Joining: follow the host to the page they're watching.
          if (ev.kind === 'state' && isWebUrl(ev.url)) {
            const tab = await chrome.tabs.get(state.tabId).catch(() => null);
            if (tab && !sameVideoUrl(tab.url, ev.url)) {
              addLog(`🔗 Opening friend's page…`);
              await setState({ syncPending: true });
              await chrome.tabs.update(state.tabId, { url: ev.url });
              break; // once loaded, we ask for the position again (tabs.onUpdated)
            }
          }
          if (ev.kind === 'state') await setState({ syncPending: false });
          if (ev.time == null) break; // friend has no video playing yet

          const result = await toTab(state.tabId, { type: 'apply', event: msg.event, latency: msg.latency });
          addLog(result ? `   → here: ${result}` : '   → no video found in the synced tab!');
          break;
        }
        case 'log':
          addLog(msg.text);
          break;
        case 'peers':
          await setState({ peers: msg.count });
          await setBadge(msg.count, !!state.roomId);
          break;
        case 'need-state': {
          // A newer peer joined (or asked); send them our page and position.
          if (!state.tabId) break;
          const [videoState, tab] = await Promise.all([
            toTab(state.tabId, { type: 'get-state' }),
            chrome.tabs.get(state.tabId).catch(() => null),
          ]);
          const payload = { time: null, playing: false, ...videoState, url: tab?.url };
          toOffscreen({ type: 'send-state', peerId: msg.peerId, state: payload });
          break;
        }
        case 'relays':
          if (state.relaysOpen !== msg.open || state.relaysTotal !== msg.total)
            await setState({ relaysOpen: msg.open, relaysTotal: msg.total });
          break;
        case 'error':
          await setState({ error: msg.message });
          break;
      }
    })();
    return false;
  }

  // --- From content scripts ---
  if (sender.tab) {
    if (msg.type === 'content-hello') {
      getState().then((s) => {
        const active = s.tabId === sender.tab.id;
        // While we're still navigating to the host's page, the content script
        // must not broadcast (e.g. the site's autoplay) until it gets synced.
        sendResponse({ active, hold: active && s.syncPending });
      });
      return true;
    }
    if (msg.type === 'local-event') {
      getState().then((s) => {
        if (s.roomId && s.tabId === sender.tab.id) {
          addLog(`⬆ You: ${describe(msg.event)} → ${s.peers} friend(s)`);
          toOffscreen({ type: 'broadcast', event: msg.event });
        }
      });
    }
    return false;
  }

  // --- From the popup ---
  switch (msg.type) {
    case 'get-status':
      getState().then(sendResponse);
      return true;
    case 'join':
      join(msg.roomId, msg.tabId).then(
        () => sendResponse({ ok: true }),
        (e) => sendResponse({ ok: false, error: String(e) })
      );
      return true;
    case 'leave':
      leave().then(() => sendResponse({ ok: true }));
      return true;
  }
  return false;
});

// After following the host to their page, ask for the position again now that
// the video page has loaded.
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== 'complete') return;
  const s = await getState();
  if (s.tabId !== tabId || !s.syncPending || !s.roomId) return;
  addLog('Page loaded, asking friend for current position');
  toOffscreen({ type: 'request-state' });
});

// Leave the room if the synced tab is closed.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { tabId: synced } = await getState();
  if (synced === tabId) leave();
});
