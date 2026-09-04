/* Equity Analyst service worker — offline shell */
/* One line to change per release, and the same line as APP_BUILD in
   index.html. The cache name carries the build, so a new build cannot be
   served out of an old cache. */
var BUILD = '2026.09.04.1';
var CACHE = 'equity-analyst-' + BUILD;
var ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './render.js', './charts.js', './segments.js', './docs.js', './vendor/html2canvas.min.js', './vendor/jspdf.umd.min.js',
  './src/engine-bridge.js',
  './src/data/provider.js',
  './src/data/store.js',
  './src/core/compare.js',
  './src/core/forensic.js',
  './src/core/integrity.js',
  './src/core/litigation.js',
  './src/core/metrics.js',
  './src/core/model.js',
  './src/core/multibagger.js',
  './src/core/payload-schema.js', './src/core/repair.js',
  './src/core/prompt-builder.js',
  './src/core/ranking.js',
  './src/core/report.js',
  './src/core/rubrics.js',
  './src/core/scoring.js',
  './src/core/technicals.js',
  './src/core/valuation.js'
];
self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(ASSETS).catch(function(){}); }));
});
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== CACHE; })
      .map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener('fetch', function(e){
  var url = new URL(e.request.url);
  /* never cache or intercept API traffic */
  if(url.hostname.indexOf('anthropic.com') !== -1) return;
  if(e.request.method !== 'GET') return;
  if(url.origin !== self.location.origin) return;

  /* The page itself is fetched network-first. Cache-first here meant a fresh
     upload kept showing the previous build until the app happened to be opened
     a second time — which is indistinguishable from "my deploy did not work". */
  var isPage = e.request.mode === 'navigate' ||
               /\.(html)$/.test(url.pathname) ||
               url.pathname.replace(/\/+$/, '') === self.location.pathname.replace(/\/[^\/]*$/, '');
  if(isPage){
    e.respondWith(
      fetch(e.request).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(e.request, copy); });
        return res;
      }).catch(function(){
        return caches.match(e.request).then(function(hit){ return hit || caches.match('./index.html'); });
      })
    );
    return;
  }

  /* Everything else is served from cache but refreshed in the background, so
     the next load is current without ever waiting on the network. */
  e.respondWith(
    caches.match(e.request).then(function(hit){
      var net = fetch(e.request).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(e.request, copy); });
        return res;
      }).catch(function(){ return hit; });
      return hit || net;
    })
  );
});
