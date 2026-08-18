/**
 * Corg Explorer proxy — Netlify Function port of handleGugExplorerProxy()
 * in server.js.
 *
 * The local `node server.js` build serves /gugexplorer-proxy itself. Netlify
 * only serves the static files, so on *.netlify.app that path 404'd and the
 * in-game browser showed nothing but a "Not found" page. This function is the
 * same proxy, rewritten against the Fetch API (Netlify Functions v2), and
 * netlify.toml points /gugexplorer-proxy at it.
 *
 * Keep this in sync with server.js — the two implement the same contract:
 *   /gugexplorer-proxy?url=<absolute url>        (links, POST forms, fetch/XHR)
 *   /gugexplorer-proxy/<encoded origin+path>     (GET forms; see rewriteForms)
 *
 * As in server.js this is effectively an open proxy, so it is deliberately
 * limited to http/https, has a hard timeout, and caps the response size.
 */

export const config = {
  path: ['/gugexplorer-proxy', '/gugexplorer-proxy/*'],
};

// Netlify's synchronous function timeout is 10s; bail before that so the
// player gets the styled error page instead of a platform 502.
const FETCH_TIMEOUT_MS = 9000;
const MAX_BYTES = 6 * 1024 * 1024;

const PATH_PREFIXES = ['/gugexplorer-proxy/', '/.netlify/functions/gugexplorer-proxy/'];

// The Explorer iframe is sandboxed without allow-same-origin (see index.html),
// so a proxied page runs on an opaque origin and the fetch/XHR calls the shim
// points back here are cross-origin requests that need CORS to be readable.
// Nothing here is origin-sensitive: it is an open proxy of public pages either
// way.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
};

export default async function handler(request) {
  // A proxied page on an opaque origin preflights any fetch with a non-simple
  // method or content type. Answer those here rather than forwarding an
  // OPTIONS upstream.
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...CORS_HEADERS, 'Access-Control-Max-Age': '600' } });
  }

  const requestUrl = new URL(request.url);
  let target = requestUrl.searchParams.get('url');

  // GET <form> submissions can't use ?url= — the browser replaces the action
  // URL's query string with the form's own fields — so those come in as
  // /gugexplorer-proxy/<encoded target>, with the form fields as the query
  // string. Merge the two back together here.
  if (!target) {
    const prefix = PATH_PREFIXES.find((p) => requestUrl.pathname.startsWith(p));
    if (prefix) {
      try {
        const merged = new URL(decodeURIComponent(requestUrl.pathname.slice(prefix.length)));
        requestUrl.searchParams.forEach((value, key) => merged.searchParams.set(key, value));
        target = merged.toString();
      } catch {
        target = null;
      }
    }
  }

  if (!target) return text('Missing url parameter', 400);

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    return text('Invalid URL', 400);
  }
  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    return text('Only http:// and https:// URLs are supported', 400);
  }

  const ownOrigin = requestUrl.origin;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const method = request.method || 'GET';
    const forwardHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': request.headers.get('accept') || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    };
    const contentTypeIn = request.headers.get('content-type');
    if (contentTypeIn) forwardHeaders['Content-Type'] = contentTypeIn;

    let body;
    if (method !== 'GET' && method !== 'HEAD') body = await request.arrayBuffer();

    const upstream = await fetch(targetUrl.toString(), {
      method,
      body,
      redirect: 'follow',
      signal: controller.signal,
      headers: forwardHeaders,
    });
    clearTimeout(timeout);

    const contentType = upstream.headers.get('content-type') || 'text/html; charset=utf-8';
    const buffer = await upstream.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      return html(buildProxyErrorPage(target, 'That page is too large to proxy.'));
    }

    const responseHeaders = {
      'Content-Type': contentType,
      'Cross-Origin-Resource-Policy': 'cross-origin',
      ...CORS_HEADERS,
      // The parent document is COEP-active (see netlify.toml), and a COEP
      // parent refuses to frame a document that doesn't declare COEP itself.
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cache-Control': 'no-cache',
      // X-Frame-Options / Content-Security-Policy are deliberately not copied
      // from upstream — stripping them is the whole point of this proxy.
    };

    if (contentType.includes('text/html')) {
      const rewritten = rewriteProxiedHtml(new TextDecoder('utf-8').decode(buffer), upstream.url, ownOrigin);
      return new Response(rewritten, { status: upstream.status, headers: responseHeaders });
    }
    return new Response(buffer, { status: upstream.status, headers: responseHeaders });
  } catch (err) {
    clearTimeout(timeout);
    const message = err && err.name === 'AbortError'
      ? 'The site took too long to respond.'
      : (err && err.message) || 'Unknown error';
    return html(buildProxyErrorPage(target, message));
  }
}

function rewriteProxiedHtml(source, finalUrl, ownOrigin) {
  const proxyPrefix = `${ownOrigin}/gugexplorer-proxy?url=`;

  let out = stripFramingMeta(source).replace(/(<a\b[^>]*?\shref=)(["'])(.*?)\2/gi, (match, pre, quote, url) => {
    const absolute = safeResolve(url, finalUrl);
    if (!absolute) return match;
    return `${pre}${quote}${proxyPrefix}${encodeURIComponent(absolute)}${quote}`;
  });
  out = rewriteForms(out, finalUrl, ownOrigin);
  out = relaxNestedFrames(out);

  const base = new URL(finalUrl);
  const baseHref = `${base.origin}${base.pathname.replace(/[^/]*$/, '')}`;

  // Sites that render themselves client-side would otherwise fire their
  // fetch()/XHR calls straight at the real origin and get blocked. Route
  // those back through this proxy too, before any of the page's own scripts.
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

  if (/<head[^>]*>/i.test(out)) return out.replace(/<head[^>]*>/i, (m) => m + injected);
  return injected + out;
}

// ---------------------------------------------------------------------------
// Framing defences beyond the response headers. See the long version of this
// comment in server.js; the short of it is that stripping X-Frame-Options and
// CSP off the response only covers one of the three ways a site refuses to be
// framed. The other two live in the markup: the same policies declared as
// <meta http-equiv> (which also kill the injected shims when they carry a
// script-src, turning a framed site into a blank one), and scripts that check
// frameElement / parent / top.
// ---------------------------------------------------------------------------
const META_BLOCKERS =
  /<meta\b[^>]*http-equiv\s*=\s*(["']?)\s*(?:content-security-policy(?:-report-only)?|x-frame-options|refresh)\s*\1[^>]*>/gi;

function stripFramingMeta(html) {
  return html.replace(META_BLOCKERS, '');
}

// Frames *inside* a proxied page. This document is COEP: credentialless (it has
// to be, to be embeddable at all), and a COEP document refuses to frame
// anything that doesn't declare COEP itself — i.e. every third-party embed on
// the web. The credentialless attribute is the escape hatch. Same fix as the
// YouTube ads in data.js.
function relaxNestedFrames(html) {
  return html.replace(/<iframe\b(?![^>]*\scredentialless[\s>=])([^>]*)>/gi, '<iframe credentialless$1>');
}

// Runs before any of the page's own scripts.
const UNFRAME_SHIM = `<script>(function(){
  var W = window;

  // The three things a "you can't frame me" script looks at. top is
  // [LegacyUnforgeable] and cannot be shadowed, so a page comparing top with
  // window can still tell it is framed — the iframe's sandbox is what makes
  // that harmless, since without allow-same-origin the page can neither
  // navigate us away nor reach our document.
  try { Object.defineProperty(W, 'frameElement', { get: function () { return null; }, configurable: true }); } catch (e) {}
  try { Object.defineProperty(W, 'parent', { get: function () { return W; }, configurable: true }); } catch (e) {}

  // That same sandbox gives the page an opaque origin, and in an opaque origin
  // localStorage / sessionStorage / document.cookie THROW rather than read
  // empty. Plenty of sites touch one of them in their first inline script, and
  // an exception there stops the page rendering at all. These stand-ins keep
  // those sites running; nothing is lost by them being per-load, since the
  // proxy forwards no cookies in either direction anyway.
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

function rewriteForms(source, finalUrl, ownOrigin) {
  return source.replace(/<form\b[^>]*>/gi, (tag) => {
    const actionMatch = tag.match(/\saction\s*=\s*(["'])(.*?)\1/i);
    const methodMatch = tag.match(/\smethod\s*=\s*(["'])(.*?)\1/i);
    const method = (methodMatch ? methodMatch[2] : 'get').toLowerCase();
    const absolute = safeResolve(actionMatch ? actionMatch[2] : finalUrl, finalUrl);
    if (!absolute) return tag;

    let newAction;
    if (method === 'post') {
      newAction = `${ownOrigin}/gugexplorer-proxy?url=${encodeURIComponent(absolute)}`;
    } else {
      const t = new URL(absolute);
      newAction = `${ownOrigin}/gugexplorer-proxy/${encodeURIComponent(t.origin + t.pathname)}`;
    }

    if (actionMatch) return tag.replace(actionMatch[0], ` action="${escapeHtmlAttr(newAction)}"`);
    return tag.replace(/<form\b/i, `<form action="${escapeHtmlAttr(newAction)}"`);
  });
}

function safeResolve(href, base) {
  if (!href) return null;
  const trimmed = href.trim();
  if (/^(#|javascript:|mailto:|tel:|data:)/i.test(trimmed)) return null;
  try {
    return new URL(trimmed, base).toString();
  } catch {
    return null;
  }
}

function escapeHtmlAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function buildProxyErrorPage(target, message) {
  return `<!doctype html><html><body style="font-family: Tahoma, 'MS Sans Serif', Arial, sans-serif; background:#c0c0c0; padding: 30px; margin: 0;">
    <h2 style="color:#000080;">Corg Explorer could not load this page</h2>
    <p><strong>${escapeHtmlAttr(target)}</strong></p>
    <p style="color:#800000;">${escapeHtmlAttr(message || 'Unknown error')}</p>
  </body></html>`;
}

function text(message, status) {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

function html(markup) {
  return new Response(markup, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cross-Origin-Embedder-Policy': 'credentialless' },
  });
}
