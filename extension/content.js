// Content script, injected into every frame. Only does anything when the
// background says this tab is the synced one. Watches the page's main <video>
// for play/pause/seek, sends them out, and applies events coming from peers.
(() => {
  // If an older copy is in this frame (e.g. orphaned after an extension
  // reload), tear it down so this one takes over.
  window.__videoPartyCleanup?.();
  window.__videoPartyCleanup = () => deactivate();

  const ECHO_WINDOW_MS = 4000; // how long after applying a remote action we watch for its echo
  const ECHO_SEEK_TOLERANCE_S = 1.5;
  const SEEK_THRESHOLD_S = 0.75; // don't seek for tiny drifts
  const SCAN_INTERVAL_MS = 1000; // SPAs (YouTube etc.) swap <video> elements

  let active = false;
  let video = null;
  let scanTimer = null;
  // State we just put the video into because of a peer. Local events that
  // merely confirm this state are echoes and must not be sent back.
  // {playing, time, at, until}
  let expected = null;
  // A remote event that arrived before the page had a video; applied on attach.
  let pending = null; // {event, latency, at}
  const PENDING_MAX_AGE_MS = 30_000;
  // After following the host to a new page: don't broadcast (e.g. the site's
  // own autoplay) until we've been synced to the host's position.
  let holdUntil = 0;
  const HOLD_MAX_MS = 15_000;

  const log = (...args) => console.log('%c[video-party]', 'color:#4f46e5;font-weight:bold', ...args);

  // ---------- video detection ----------

  function pickVideo() {
    let best = null;
    let bestArea = 0;
    for (const v of document.querySelectorAll('video')) {
      const r = v.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea) {
        best = v;
        bestArea = area;
      }
    }
    return best;
  }

  function attach(v) {
    if (v === video) return;
    detach();
    video = v;
    if (!video) return;
    log('watching video', video);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeked', onSeeked);
    applyPending();
  }

  function detach() {
    if (!video) return;
    video.removeEventListener('play', onPlay);
    video.removeEventListener('pause', onPause);
    video.removeEventListener('seeked', onSeeked);
    video = null;
  }

  // ---------- outgoing ----------

  function send(kind) {
    if (!active || !video) return;
    if (Date.now() < holdUntil) return log('not sending', kind, '(waiting to sync with friend)');
    const event = { kind, time: video.currentTime, playing: !video.paused };
    log('sending', kind, 'at', formatTime(event.time));
    try {
      chrome.runtime.sendMessage({ type: 'local-event', event }).catch(() => {});
    } catch {
      // Extension was reloaded; this copy of the script is orphaned.
      deactivate();
    }
  }

  function isEcho(kind) {
    if (!expected || Date.now() > expected.until) return false;
    if (kind === 'play') return expected.playing;
    if (kind === 'pause') return !expected.playing;
    // seek: echo if we landed where the peer told us to be
    const elapsed = expected.playing ? (Date.now() - expected.at) / 1000 : 0;
    return Math.abs(video.currentTime - (expected.time + elapsed)) < ECHO_SEEK_TOLERANCE_S;
  }

  function onLocal(kind) {
    if (isEcho(kind)) return log('ignoring echo of remote', kind);
    // Right after the join sync, the site itself (autoplay) may fight the
    // state we were told to be in. Put it back instead of broadcasting it.
    if (expected?.enforce && Date.now() < expected.until && (kind === 'play' || kind === 'pause')) {
      log('site changed playback right after sync; restoring');
      if (expected.playing) video.play().catch(() => {});
      else video.pause();
      return;
    }
    expected = null; // a genuine local action ends the echo window
    send(kind);
  }

  const onPlay = () => onLocal('play');
  // A video reaching its end also fires 'pause'; no need to broadcast that.
  const onPause = () => !video.ended && onLocal('pause');
  const onSeeked = () => onLocal('seek');

  // ---------- incoming ----------

  // Returns a short description of what was done (shown in the popup log),
  // or null if this frame has no video.
  function apply(event, latencyMs = 0) {
    if (event.kind === 'state') holdUntil = 0;
    const v = video || pickVideo();
    if (!v) {
      pending = { event, latency: latencyMs, at: Date.now() };
      return 'waiting for the video to load';
    }
    pending = null;
    attach(v);

    // If the peer is playing, they've moved on by ~one-way latency since sending.
    const target = event.playing ? event.time + latencyMs / 1000 : event.time;
    const now = Date.now();
    expected = {
      playing: event.playing,
      time: target,
      at: now,
      until: now + ECHO_WINDOW_MS,
      enforce: event.kind === 'state',
    };

    const did = [];
    if (Math.abs(v.currentTime - target) > SEEK_THRESHOLD_S) {
      v.currentTime = target;
      did.push(`seeked to ${formatTime(target)}`);
    }
    if (event.playing && v.paused) {
      v.play().catch((e) => {
        log('play() rejected', e);
        toast('Your friend pressed play. Click play to catch up (the browser blocked autoplay).');
      });
      did.push('played');
    } else if (!event.playing && !v.paused) {
      v.pause();
      did.push('paused');
    }

    log('applied remote', event, '→', did.join(', ') || 'already in sync');
    const labels = { play: 'played', pause: 'paused', seek: 'jumped to', state: 'synced to' };
    toast(`Friend ${labels[event.kind] ?? 'synced to'} ${formatTime(event.time)}`);
    return did.join(', ') || 'already in sync';
  }

  function applyPending() {
    if (!pending) return;
    const { event, latency, at } = pending;
    pending = null;
    const age = Date.now() - at;
    if (age > PENDING_MAX_AGE_MS) return;
    // If the friend was playing, they've moved on since the event arrived.
    apply({ ...event, time: event.playing ? event.time + age / 1000 : event.time }, latency);
  }

  // ---------- UI ----------

  let toastEl = null;
  let toastTimer = null;
  function toast(text) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      Object.assign(toastEl.style, {
        position: 'fixed',
        top: '16px',
        right: '16px',
        zIndex: 2147483647,
        padding: '8px 12px',
        borderRadius: '8px',
        background: 'rgba(17, 24, 39, 0.9)',
        color: '#fff',
        font: '13px/1.4 system-ui, sans-serif',
        pointerEvents: 'none',
        transition: 'opacity .2s',
        maxWidth: '320px',
      });
    }
    // Append inside the fullscreen element so the toast shows in fullscreen too.
    (document.fullscreenElement || document.body).appendChild(toastEl);
    toastEl.textContent = `🎬 ${text}`;
    toastEl.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.style.opacity = '0'), 2500);
  }

  function formatTime(s) {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  }

  // ---------- lifecycle ----------

  function activate() {
    if (active) return;
    active = true;
    attach(pickVideo());
    scanTimer = setInterval(() => {
      const v = pickVideo();
      if (v !== video) attach(v);
    }, SCAN_INTERVAL_MS);
  }

  function deactivate() {
    active = false;
    clearInterval(scanTimer);
    detach();
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg.type) {
      case 'activate':
        activate();
        sendResponse({ ok: true });
        break;
      case 'deactivate':
        deactivate();
        break;
      case 'apply': {
        // Only frames that have a video answer, so "no answer" means no video found.
        const result = active ? apply(msg.event, msg.latency) : null;
        if (result) sendResponse(result);
        break;
      }
      case 'get-state': {
        // Only the frame that actually has a video answers.
        const v = video || pickVideo();
        if (active && v) sendResponse({ time: v.currentTime, playing: !v.paused });
        break;
      }
    }
    return false;
  });

  chrome.runtime
    .sendMessage({ type: 'content-hello' })
    .then((res) => {
      if (!res?.active) return;
      if (res.hold) holdUntil = Date.now() + HOLD_MAX_MS;
      activate();
    })
    .catch(() => {});
})();
