/**
 * GUG Clicker Local Server
 * Serves the game with the Cross-Origin Isolation headers required
 * for Half-Life / WebXash (SharedArrayBuffer + WASM threads).
 *
 * Usage: node server.js
 * Then open: http://localhost:8080
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 8080;
const ROOT = __dirname;

const MIME = {
  '.html' : 'text/html; charset=utf-8',
  '.js'   : 'application/javascript',
  '.mjs'  : 'application/javascript',
  '.css'  : 'text/css',
  '.png'  : 'image/png',
  '.jpg'  : 'image/jpeg',
  '.jpeg' : 'image/jpeg',
  '.gif'  : 'image/gif',
  '.svg'  : 'image/svg+xml',
  '.ico'  : 'image/x-icon',
  '.cur'  : 'image/x-icon',
  '.ani'  : 'application/x-navi-animation',
  '.wasm' : 'application/wasm',
  '.pk3'  : 'application/octet-stream',
  '.zip'  : 'application/zip',
  '.mp3'  : 'audio/mpeg',
  '.mp4'  : 'video/mp4',
  '.webm' : 'video/webm',
  '.ogg'  : 'audio/ogg',
  '.wav'  : 'audio/wav',
  '.m4a'  : 'audio/mp4',
  '.flac' : 'audio/flac',
  '.webp' : 'image/webp',
  '.json' : 'application/json',
  '.ttf'  : 'font/ttf',
  '.woff' : 'font/woff',
  '.woff2': 'font/woff2',
};

// Served by the streaming branch below (Accept-Ranges + Content-Length) rather
// than read whole and sent chunked. The short one-shot sound effects are
// deliberately not in here — they're small, they're never seeked, and the
// read-whole path caches them.
const MEDIA_EXTS = new Set(['.mp4', '.webm', '.mp3', '.ogg', '.m4a', '.flac']);

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  if (urlPath === '/gugexplorer-proxy' || urlPath.startsWith('/gugexplorer-proxy/')) {
    handleGugExplorerProxy(req, res);
    return;
  }

  // Decode %20 etc. (asset filenames like "Windows Foreground.wav" contain
  // spaces) before resolving to a filesystem path.
  let decodedPath = urlPath;
  try { decodedPath = decodeURIComponent(urlPath); } catch { /* malformed escape, fall back to raw */ }

  // Directory index: /win7/ -> /win7/index.html (the embedded OS apps are
  // each their own self-contained build with an index.html at its root).
  if (decodedPath.endsWith('/')) decodedPath += 'index.html';

  // Prevent path traversal
  const filePath = path.normalize(path.join(ROOT, decodedPath));
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // Media is streamed with Range support instead of being read whole into
  // memory: without 206 responses the browser can't start playing (or seek)
  // until the entire file has downloaded.
  //
  // Audio is in here for a second reason. Everything below goes out through
  // res.end(buffer) with no Content-Length, which Node sends chunked — and a
  // chunked <audio> has `duration === Infinity` and cannot be seeked, because
  // as far as the browser is concerned it's a live stream that happens to stop.
  // Ad Smasher's radio needs neither of those to be true.
  const mediaExt = path.extname(filePath).toLowerCase();
  if (MEDIA_EXTS.has(mediaExt)) {
    fs.stat(filePath, (statErr, stat) => {
      if (statErr || !stat.isFile()) { res.writeHead(404); res.end('Not found: ' + urlPath); return; }

      const headers = buildHeaders(mediaExt);
      headers['Accept-Ranges'] = 'bytes';

      const range = req.headers.range;
      const match = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (match) {
        let start = match[1] === '' ? null : parseInt(match[1], 10);
        let end = match[2] === '' ? null : parseInt(match[2], 10);
        if (start === null) { // suffix range: last N bytes
          start = Math.max(0, stat.size - (end || 0));
          end = stat.size - 1;
        } else if (end === null || end >= stat.size) {
          end = stat.size - 1;
        }
        if (start > end || start >= stat.size) {
          res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
          res.end();
          return;
        }
        headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
        headers['Content-Length'] = end - start + 1;
        res.writeHead(206, headers);
        fs.createReadStream(filePath, { start, end }).pipe(res);
      } else {
        headers['Content-Length'] = stat.size;
        res.writeHead(200, headers);
        fs.createReadStream(filePath).pipe(res);
      }
    });
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Try index.html for SPA-style routes inside halflife/
      if (urlPath.startsWith('/halflife/') && !path.extname(urlPath)) {
        fs.readFile(path.join(ROOT, 'halflife', 'index.html'), (e2, d2) => {
          if (e2) { res.writeHead(404); res.end('Not found'); return; }
          res.writeHead(200, buildHeaders('.html'));
          res.end(d2);
        });
      } else {
        res.writeHead(404);
        res.end('Not found: ' + urlPath);
      }
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, buildHeaders(ext));
    res.end(data);
  });
});

function buildHeaders(ext) {
  return {
    'Content-Type'                        : MIME[ext] || 'application/octet-stream',
    // Required for SharedArrayBuffer / WASM threads (Half-Life WebXash).
    // 'credentialless' (rather than 'require-corp') still grants cross-origin
    // isolation but doesn't require every embedded cross-origin resource to
    // send back a Cross-Origin-Resource-Policy header — needed so the Gug
    // Explorer proxy iframe (and the third-party assets it loads) aren't
    // blocked by COEP.
    'Cross-Origin-Opener-Policy'          : 'same-origin',
    'Cross-Origin-Embedder-Policy'        : 'credentialless',
    // Allow same-origin iframes to use SharedArrayBuffer too
    'Cross-Origin-Resource-Policy'        : 'cross-origin',
    // Cache WASM/binary assets aggressively
    'Cache-Control'                       : ext === '.wasm' || ext === '.pk3' || ext === '.zip'
                                            ? 'public, max-age=86400'
                                            : 'no-cache',
  };
}

/**
 * Gug Explorer "browser" proxy.
 *
 * Most sites (Google, X, Wikipedia, etc.) send X-Frame-Options / a
 * frame-ancestors CSP that stops browsers from framing them directly.
 * That block only applies when the browser requests the page straight
 * from the target's origin — it doesn't apply to a page WE fetch
 * server-side and re-serve from our own origin, since the browser never
 * sees the target's blocking headers. So we fetch the requested URL here,
 * strip those headers, inject a <base> tag so the page's relative
 * assets/links keep resolving against the real site, and rewrite <a>/
 * <form> targets to loop back through this same proxy so in-page
 * navigation keeps working instead of breaking back out to a direct
 * (and therefore blocked) request.
 *
 * This is effectively an open proxy. That's acceptable here because the
 * server only ever binds to localhost for a single local player — do not
 * expose this on a public network without adding auth/rate-limiting.
 */
async function handleGugExplorerProxy(req, res) {
  // A proxied page on an opaque origin (see the CORS note below) preflights
  // any fetch it makes with a non-simple method or content type. Answer those
  // here rather than forwarding an OPTIONS upstream.
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
      'Access-Control-Max-Age': '600',
    });
    res.end();
    return;
  }

  const requestUrl = new URL(req.url, 'http://localhost');
  let target = requestUrl.searchParams.get('url');

  // GET <form> submissions can't use the ?url= query form — browsers discard
  // whatever query string was on the action URL and replace it with the
  // form's own serialized fields. So GET forms get rewritten (see
  // rewriteForms below) to encode the target as a path segment instead:
  // /gugexplorer-proxy/<encoded target origin+path>, with the browser's
  // own query string (the actual form fields, e.g. ?q=search+term) merged
  // onto that target here.
  if (!target && requestUrl.pathname.startsWith('/gugexplorer-proxy/')) {
    try {
      const decoded = decodeURIComponent(requestUrl.pathname.slice('/gugexplorer-proxy/'.length));
      const merged = new URL(decoded);
      requestUrl.searchParams.forEach((value, key) => merged.searchParams.set(key, value));
      target = merged.toString();
    } catch {
      target = null;
    }
  }

  if (!target) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Missing url parameter');
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Invalid URL');
    return;
  }
  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Only http:// and https:// URLs are supported');
    return;
  }

  const ownOrigin = `http://${req.headers.host}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const method = req.method || 'GET';
    const forwardHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': req.headers['accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    };
    if (req.headers['content-type']) forwardHeaders['Content-Type'] = req.headers['content-type'];

    let body;
    if (method !== 'GET' && method !== 'HEAD') body = await readRequestBody(req);

    const upstream = await fetch(targetUrl.toString(), {
      method,
      body,
      redirect: 'follow',
      signal: controller.signal,
      headers: forwardHeaders,
    });
    clearTimeout(timeout);

    const contentType = upstream.headers.get('content-type') || 'text/html; charset=utf-8';
    const bodyBuffer = Buffer.from(await upstream.arrayBuffer());

    const responseHeaders = {
      'Content-Type': contentType,
      'Cross-Origin-Resource-Policy': 'cross-origin',
      // The Explorer iframe is sandboxed without allow-same-origin (see
      // index.html), so the proxied page runs on an opaque origin and its
      // fetch/XHR calls — which the shim points back here — are cross-origin
      // requests that need CORS to be readable. Nothing here is
      // origin-sensitive: it is an open proxy of public pages either way.
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
      'Cache-Control': 'no-cache',
      // A COEP-active parent (see buildHeaders above) refuses to embed a
      // framed document that doesn't itself declare COEP — this document
      // needs the header even though it doesn't need every one of ITS OWN
      // subresources to comply, which is exactly what 'credentialless' gets us.
      'Cross-Origin-Embedder-Policy': 'credentialless',
      // Deliberately omit X-Frame-Options / Content-Security-Policy here —
      // stripping them is the whole point of this proxy.
    };

    if (contentType.includes('text/html')) {
      const html = rewriteProxiedHtml(bodyBuffer.toString('utf-8'), upstream.url, ownOrigin);
      res.writeHead(upstream.status, responseHeaders);
      res.end(html);
    } else {
      res.writeHead(upstream.status, responseHeaders);
      res.end(bodyBuffer);
    }
  } catch (err) {
    clearTimeout(timeout);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(buildProxyErrorPage(target, err.message));
  }
}

function rewriteProxiedHtml(html, finalUrl, ownOrigin) {
  const proxyPrefix = `${ownOrigin}/gugexplorer-proxy?url=`;

  const rewriteAttr = (tagPattern) => (html) => html.replace(tagPattern, (match, pre, quote, url) => {
    const absolute = safeResolve(url, finalUrl);
    if (!absolute) return match;
    return `${pre}${quote}${proxyPrefix}${encodeURIComponent(absolute)}${quote}`;
  });

  html = stripFramingMeta(html);
  html = rewriteAttr(/(<a\b[^>]*?\shref=)(["'])(.*?)\2/gi)(html);
  html = rewriteForms(html, finalUrl, ownOrigin);
  html = relaxNestedFrames(html);

  const base = new URL(finalUrl);
  const dirPath = base.pathname.replace(/[^/]*$/, '');
  const baseHref = `${base.origin}${dirPath}`;

  // Many modern sites (Steam's store included) render most of their content
  // client-side via fetch()/XHR calls made *after* load, which the <a>/<form>
  // rewriting above never sees. Those calls would otherwise go straight to
  // the real site from our origin and get blocked as cross-origin requests.
  // This shim runs before any of the page's own scripts and transparently
  // reroutes fetch()/XHR through this same proxy (same-origin from the
  // page's point of view, so no CORS issue), keeping in-page navigation and
  // dynamically-loaded subpages working.
  const fetchShim = `<script>(function(){
    var PROXY_PREFIX = ${JSON.stringify(proxyPrefix)};
    function toProxied(url) {
      try {
        var abs = new URL(url, document.baseURI).toString();
        if (abs.indexOf(PROXY_PREFIX) === 0) return url;
        if (!/^https?:/i.test(abs)) return url;
        return PROXY_PREFIX + encodeURIComponent(abs);
      } catch (e) { return url; }
    }
    var origFetch = window.fetch;
    if (origFetch) {
      window.fetch = function(input, init) {
        try {
          if (typeof input === 'string') input = toProxied(input);
          else if (input && typeof input.url === 'string') input = new Request(toProxied(input.url), input);
        } catch (e) {}
        return origFetch.call(this, input, init);
      };
    }
    var origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      var args = Array.prototype.slice.call(arguments);
      try { args[1] = toProxied(url); } catch (e) {}
      return origOpen.apply(this, args);
    };
  })();</script>`;

  const injected = `<base href="${escapeHtmlAttr(baseHref)}">`
    + UNFRAME_SHIM
    + fetchShim
    + `<script>try{window.top.postMessage({gugExplorerUrl:${JSON.stringify(finalUrl)}},'*');}catch(e){}</script>`;

  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (m) => m + injected);
  } else {
    html = injected + html;
  }
  return html;
}

// ---------------------------------------------------------------------------
// Framing defences beyond the response headers.
//
// Dropping X-Frame-Options / CSP off the upstream *response* only covers the
// first of the three ways a site refuses to be framed. The other two are in
// the markup itself, and both used to get through:
//
//   1. The same policies declared as <meta http-equiv>. The browser honours a
//      meta CSP exactly like the header, and one with a script-src also kills
//      the shims injected above — which turns "framed site" into "blank page".
//      <meta http-equiv="refresh"> goes with them: it points at the real URL,
//      so it would bounce the frame out of the proxy and into a direct (and
//      therefore blocked) load of the site.
//
//   2. Scripts that look at frameElement / parent / top and hide the page or
//      try to break out.
//
// Keep both in sync with the other two copies of this proxy (see the header
// comment on handleGugExplorerProxy).
// ---------------------------------------------------------------------------
const META_BLOCKERS =
  /<meta\b[^>]*http-equiv\s*=\s*(["']?)\s*(?:content-security-policy(?:-report-only)?|x-frame-options|refresh)\s*\1[^>]*>/gi;

function stripFramingMeta(html) {
  return html.replace(META_BLOCKERS, '');
}

// Frames *inside* a proxied page. This document is served COEP: credentialless
// (it has to be, to be embeddable at all), and a COEP document refuses to frame
// anything that doesn't declare COEP itself — which is every third-party embed
// on the web. The credentialless attribute is the escape hatch: the embed loads
// in a cookie-less context instead of being refused. Same fix as the YouTube
// ads in data.js.
function relaxNestedFrames(html) {
  return html.replace(/<iframe\b(?![^>]*\scredentialless[\s>=])([^>]*)>/gi, '<iframe credentialless$1>');
}

// Runs before any of the page's own scripts.
const UNFRAME_SHIM = `<script>(function(){
  var W = window;

  // The three things a "you can't frame me" script looks at. Note that top is
  // [LegacyUnforgeable] and cannot be shadowed, so a page comparing top with
  // window can still tell it is framed — the iframe's sandbox is what makes
  // that harmless, since without allow-same-origin the page can neither
  // navigate us away nor reach our document.
  try { Object.defineProperty(W, 'frameElement', { get: function () { return null; }, configurable: true }); } catch (e) {}
  try { Object.defineProperty(W, 'parent', { get: function () { return W; }, configurable: true }); } catch (e) {}

  // That same sandbox gives the page an opaque origin, and in an opaque origin
  // localStorage / sessionStorage / document.cookie THROW rather than read
  // empty. A great many sites touch one of them in their first inline script,
  // and an exception there stops the page rendering at all. These stand-ins
  // keep those sites running; nothing is lost by them being per-load, because
  // the proxy forwards no cookies in either direction anyway.
  function memoryStorage() {
    var map = {};
    return {
      getItem: function (k) { k = String(k); return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
      setItem: function (k, v) { map[String(k)] = String(v); },
      removeItem: function (k) { delete map[String(k)]; },
      clear: function () { map = {}; },
      key: function (i) { var keys = Object.keys(map); return i < keys.length ? keys[i] : null; },
      get length() { return Object.keys(map).length; }
    };
  }

  ['localStorage', 'sessionStorage'].forEach(function (name) {
    var usable = false;
    try { W[name].setItem('__corg', '1'); W[name].removeItem('__corg'); usable = true; } catch (e) { usable = false; }
    if (!usable) {
      try { Object.defineProperty(W, name, { value: memoryStorage(), configurable: true }); } catch (e) {}
    }
  });

  try {
    void document.cookie;
  } catch (e) {
    var jar = {};
    try {
      Object.defineProperty(document, 'cookie', {
        configurable: true,
        get: function () {
          return Object.keys(jar).map(function (k) { return k + '=' + jar[k]; }).join('; ');
        },
        set: function (value) {
          var pair = String(value).split(';')[0];
          var eq = pair.indexOf('=');
          if (eq > 0) jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
        }
      });
    } catch (e2) {}
  }
})();</script>`;

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// GET-method <form> submissions replace the action URL's query string with
// the form's own fields (per the HTML spec), so the usual ?url=<target>
// scheme used for <a> links can't survive a GET submit — the ?url= param
// would just get overwritten by e.g. Google's own ?q=<search term>. POST
// forms don't have this problem (POST leaves the action URL's query alone),
// so only GET forms (the default when no method is given) need the
// path-based /gugexplorer-proxy/<encoded target> form; handleGugExplorerProxy
// re-merges the browser-supplied query string onto that target server-side.
function rewriteForms(html, finalUrl, ownOrigin) {
  return html.replace(/<form\b[^>]*>/gi, (tag) => {
    const actionMatch = tag.match(/\saction\s*=\s*(["'])(.*?)\1/i);
    const methodMatch = tag.match(/\smethod\s*=\s*(["'])(.*?)\1/i);
    const method = (methodMatch ? methodMatch[2] : 'get').toLowerCase();
    const rawAction = actionMatch ? actionMatch[2] : finalUrl;
    const absolute = safeResolve(rawAction, finalUrl);
    if (!absolute) return tag;

    let newAction;
    if (method === 'post') {
      newAction = `${ownOrigin}/gugexplorer-proxy?url=${encodeURIComponent(absolute)}`;
    } else {
      const target = new URL(absolute);
      newAction = `${ownOrigin}/gugexplorer-proxy/${encodeURIComponent(target.origin + target.pathname)}`;
    }

    if (actionMatch) {
      return tag.replace(actionMatch[0], ` action="${escapeHtmlAttr(newAction)}"`);
    }
    return tag.replace(/<form\b/i, `<form action="${escapeHtmlAttr(newAction)}"`);
  });
}

function safeResolve(href, base) {
  if (!href) return null;
  const trimmed = href.trim();
  if (/^(#|javascript:|mailto:|tel:)/i.test(trimmed)) return null;
  try {
    return new URL(trimmed, base).toString();
  } catch {
    return null;
  }
}

function escapeHtmlAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function buildProxyErrorPage(target, message) {
  return `<!doctype html><html><body style="font-family: Tahoma, 'MS Sans Serif', Arial, sans-serif; background:#c0c0c0; padding: 30px; margin: 0;">
    <h2 style="color:#000080;">Gug Explorer could not load this page</h2>
    <p><strong>${escapeHtmlAttr(target)}</strong></p>
    <p style="color:#800000;">${escapeHtmlAttr(message || 'Unknown error')}</p>
  </body></html>`;
}

server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║       GUG Clicker Local Server           ║');
  console.log('  ╠══════════════════════════════════════════╣');
  console.log(`  ║  http://localhost:${PORT}                    ║`);
  console.log('  ║  Cross-Origin Isolation: ✅ ENABLED      ║');
  console.log('  ║  Half-Life WebXash: ✅ READY             ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
});
