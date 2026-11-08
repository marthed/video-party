const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

function randomCode() {
  // No ambiguous characters (0/O, 1/I/L).
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function join(roomId) {
  roomId = roomId.trim().toUpperCase();
  if (!roomId) return showError('Enter a room code first.');
  showError(null);
  try {
    const tab = await activeTab();
    const res = await send({ type: 'join', roomId, tabId: tab.id });
    if (!res?.ok) return showError(res?.error ?? 'Could not start the party');
  } catch (e) {
    return showError(`Join failed: ${e?.message ?? e}`);
  }
  render();
}

function showError(text) {
  $('error').hidden = !text;
  $('error').textContent = text ?? '';
}

async function render() {
  const state = await send({ type: 'get-status' });
  const inRoom = !!state.roomId;
  $('out').hidden = inRoom;
  $('in').hidden = !inRoom;
  showError(state.error);
  if (!inRoom) return;

  $('room').textContent = state.roomId;
  $('dot').classList.toggle('ok', state.peers > 0);
  $('peers').textContent =
    state.peers === 0
      ? 'Waiting for your friend to join…'
      : `Connected to ${state.peers} ${state.peers === 1 ? 'friend' : 'friends'}`;

  $('relays').textContent = !state.relaysTotal
    ? 'Signaling: connecting to relays…'
    : state.relaysOpen === 0
      ? `Signaling: 0/${state.relaysTotal} relays reachable. Something (firewall, VPN, ad blocker) is blocking them.`
      : `Signaling: ${state.relaysOpen}/${state.relaysTotal} relays connected`;

  const logEl = $('log');
  logEl.textContent = state.log.length ? state.log.join('\n') : 'Nothing yet.';
  logEl.scrollTop = logEl.scrollHeight;

  const current = await activeTab();
  const synced = state.tabId ? await chrome.tabs.get(state.tabId).catch(() => null) : null;
  $('tabinfo').textContent = synced ? `Syncing: ${synced.title}` : '';
  $('move').hidden = !synced || synced.id === current.id;
}

$('create').onclick = () => join(randomCode());
$('join').onclick = () => join($('code').value);
$('code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') join($('code').value);
});
$('leave').onclick = async () => {
  await send({ type: 'leave' });
  render();
};
$('move').onclick = async () => join($('room').textContent);
$('copy').onclick = async () => {
  await navigator.clipboard.writeText($('room').textContent);
  $('copy').textContent = 'Copied';
  setTimeout(() => ($('copy').textContent = 'Copy'), 1200);
};

$('copylog').onclick = async () => {
  await navigator.clipboard.writeText($('log').textContent);
  $('copylog').textContent = 'Copied';
  setTimeout(() => ($('copylog').textContent = 'Copy log'), 1200);
};

// Live-update the peer count while the popup is open.
chrome.storage.onChanged.addListener((_changes, area) => area === 'session' && render());

render();
