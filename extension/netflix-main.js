// Runs in Netflix's own page context (world: MAIN). Netflix's player crashes
// (error M7375) if video.currentTime is set directly, so seeks requested by
// content.js are done through Netflix's player API instead.
(() => {
  if (window.__videoPartyNetflix) return;
  window.__videoPartyNetflix = true;

  function player() {
    const vp = window.netflix?.appContext?.state?.playerApp?.getAPI?.()?.videoPlayer;
    const ids = vp?.getAllPlayerSessionIds?.() ?? [];
    const id = ids.find((s) => s.startsWith('watch')) ?? ids[0];
    return id ? vp.getVideoPlayerBySessionId(id) : null;
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.source !== 'video-party-netflix') return;
    const p = player();
    if (!p) return console.warn('[video-party] Netflix player API not found');
    if (e.data.type === 'seek') p.seek(Math.round(e.data.time * 1000));
  });
})();
