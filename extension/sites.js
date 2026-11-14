// Supported sites. The single source of truth is `host_permissions` in
// manifest.json; this file only matches URLs against it and names the sites.
// Loaded by the background service worker (importScripts) and the popup.

const SITE_NAMES = {
  'svtplay.se': 'SVT Play',
  'youtube.com': 'YouTube',
  'netflix.com': 'Netflix',
  'disneyplus.com': 'Disney+',
  'primevideo.com': 'Prime Video',
  'hbomax.com': 'HBO Max',
  'max.com': 'HBO Max',
  'spotify.com': 'Spotify',
};

function supportedPatterns() {
  return chrome.runtime.getManifest().host_permissions ?? [];
}

// Chrome match pattern ("https://*.example.com/*") -> RegExp.
function patternToRegExp(pattern) {
  const m = pattern.match(/^(\*|https?):\/\/([^/]+)(\/.*)$/);
  if (!m) return null;
  const [, scheme, host, path] = m;
  const esc = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const schemeRe = scheme === '*' ? 'https?' : scheme;
  const hostRe = host.startsWith('*.') ? `(?:[^/]+\\.)?${esc(host.slice(2))}` : esc(host);
  const pathRe = esc(path).replace(/\*/g, '.*');
  return new RegExp(`^${schemeRe}://${hostRe}${pathRe}$`);
}

function isSupportedUrl(url) {
  if (!url) return false;
  return supportedPatterns().some((p) => patternToRegExp(p)?.test(url));
}

function supportedSiteNames() {
  const names = supportedPatterns().map((p) => {
    const host = p.match(/^[^:]+:\/\/(?:\*\.)?([^/]+)/)?.[1] ?? p;
    const key = Object.keys(SITE_NAMES).find((d) => host === d || host.endsWith(`.${d}`));
    return key ? SITE_NAMES[key] : host;
  });
  return [...new Set(names)];
}
