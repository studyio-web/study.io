/**
 * study.io Service Worker (v5)
 * - Offline App Shell & Static Asset Caching
 * - Android WebView Airplane Mode Support
 * - Background Timer Tracking & Persistent Notifications
 * - Versioned Cache Purging & Skip Waiting Update Cycle
 */

const SHELL_CACHE_NAME  = 'studyio-shell-v6';
const STATIC_CACHE_NAME = 'studyio-static-v6';
const API_CACHE_NAME    = 'studyio-api-v6';

const CURRENT_CACHES = [SHELL_CACHE_NAME, STATIC_CACHE_NAME, API_CACHE_NAME];

const NOTIF_TAG = 'studyio-timer-running';
const ICON      = '/icon-192.png';
const BADGE     = '/icon-192.png';

const PRECACHE_SHELL = [
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/manifest.json',
  '/favicon.ico',
  '/favicon.svg',
  '/logo.png',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

const PRECACHE_STATIC = [
  '/ranks/bronze-1.webp',
  '/ranks/bronze-1.png',
  '/ranks/silver-1.webp',
  '/ranks/silver-1.png',
  '/ranks/gold-1.webp',
  '/ranks/gold-1.png',
  '/ranks/platinum-1.webp',
  '/ranks/platinum-1.png',
  '/ranks/diamond-1.webp',
  '/ranks/diamond-1.png',
  '/ranks/master.webp',
  '/ranks/master.png',
  '/ranks/grandmaster.webp',
  '/ranks/grandmaster.png',
  '/ranks/champion.webp',
  '/ranks/champion.png',
];

let state = {
  running:   false,
  startTime: null,   // epoch anchor in ms
  elapsed:   0,      // used only when paused
  subject:   '',
  mode:      'stopwatch',
  target:    null,
};

let notifInterval = null;

// ─── Helpers ────────────────────────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0'); }

function formatTime(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return h + 'h ' + pad(m) + 'm ' + pad(sec) + 's';
  return pad(m) + ':' + pad(sec);
}

function getLiveElapsed() {
  if (state.running && state.startTime !== null) {
    return Math.floor((Date.now() - state.startTime) / 1000);
  }
  return state.elapsed;
}

// ─── Notification ────────────────────────────────────────────────────────────

async function showNotif() {
  try {
    const elapsed = getLiveElapsed();
    const subject = state.subject || 'Study Session';
    let title, body;

    if ((state.mode === 'countdown' || state.mode === 'pomodoro') && state.target) {
      const remaining = Math.max(0, state.target - elapsed);
      const emoji = state.mode === 'pomodoro' ? '🍅' : '⏱';
      title = emoji + ' ' + formatTime(remaining) + ' remaining';
      body  = (state.mode === 'pomodoro' ? 'Pomodoro • ' : 'Countdown • ') + subject;
    } else {
      title = '📚 ' + formatTime(elapsed) + ' elapsed';
      body  = 'Studying: ' + subject;
    }

    await self.registration.showNotification(title, {
      body,
      icon:             ICON,
      badge:            BADGE,
      tag:              NOTIF_TAG,
      renotify:         true,
      requireInteraction: true,
      sticky:           true,
      silent:           true,
      actions: [
        { action: 'open',  title: '📖 Open App' },
        { action: 'pause', title: '⏸ Pause' },
      ],
      data: { url: '/' },
    });
  } catch (e) {
    console.warn('[SW] showNotif error:', e);
  }
}

async function clearNotif() {
  try {
    const ns = await self.registration.getNotifications({ tag: NOTIF_TAG });
    ns.forEach(function(n) { n.close(); });
  } catch (e) {}
}

function startLoop() {
  stopLoop();
  showNotif();
  notifInterval = setInterval(function() {
    if (state.running) {
      showNotif();
    } else {
      stopLoop();
    }
  }, 1000);
}

function stopLoop() {
  if (notifInterval !== null) {
    clearInterval(notifInterval);
    notifInterval = null;
  }
}

// ─── Lifecycle: Install & Activate ──────────────────────────────────────────

self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(
    (async function() {
      // 1. Precache App Shell
      try {
        const shellCache = await caches.open(SHELL_CACHE_NAME);
        await Promise.allSettled(
          PRECACHE_SHELL.map(function(url) {
            return shellCache.add(url).catch(function(err) {
              console.warn('[SW Precache] Shell item skipped:', url, err);
            });
          })
        );
      } catch (err) {
        console.warn('[SW Precache] Shell cache open failed:', err);
      }

      // 2. Precache Rank Badges & Static Assets
      try {
        const staticCache = await caches.open(STATIC_CACHE_NAME);
        await Promise.allSettled(
          PRECACHE_STATIC.map(function(url) {
            return staticCache.add(url).catch(function(err) {
              console.warn('[SW Precache] Static item skipped:', url, err);
            });
          })
        );
      } catch (err) {
        console.warn('[SW Precache] Static cache open failed:', err);
      }
    })()
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.map(function(key) {
          if (!CURRENT_CACHES.includes(key)) {
            console.log('[SW] Purging outdated cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ─── Message Handler ────────────────────────────────────────────────────────

self.addEventListener('message', function(event) {
  var d = event.data;
  if (!d || !d.type) return;

  switch (d.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'TIMER_START':
      state = {
        running:   true,
        startTime: d.startTime || Date.now(),
        elapsed:   0,
        subject:   d.subject || '',
        mode:      d.mode || 'stopwatch',
        target:    d.target || null,
      };
      startLoop();
      break;

    case 'TIMER_RESUME':
      state.running   = true;
      state.startTime = d.startTime || Date.now();
      if (d.subject) state.subject = d.subject;
      startLoop();
      break;

    case 'TIMER_PAUSE':
      state.running   = false;
      state.startTime = null;
      if (d.elapsed !== undefined) state.elapsed = d.elapsed;
      stopLoop();
      (async function() {
        try {
          await self.registration.showNotification('⏸ Timer Paused — ' + formatTime(state.elapsed), {
            body:               'Studying: ' + (state.subject || 'Study Session'),
            icon:               ICON,
            badge:              BADGE,
            tag:                NOTIF_TAG,
            renotify:           true,
            requireInteraction: true,
            sticky:             true,
            silent:             true,
            actions: [
              { action: 'open',   title: '📖 Open App' },
              { action: 'resume', title: '▶ Resume' },
            ],
            data: { url: '/' },
          });
        } catch(e) {}
      })();
      break;

    case 'TIMER_STOP':
      state.running   = false;
      state.startTime = null;
      state.elapsed   = 0;
      stopLoop();
      clearNotif();
      break;

    case 'TIMER_TICK':
      if (d.startTime !== undefined) state.startTime = d.startTime;
      if (d.subject) state.subject = d.subject;
      break;

    case 'APP_HIDDEN':
      if (state.running && notifInterval === null) startLoop();
      break;

    case 'APP_VISIBLE':
      break;

    case 'PING':
      if (event.ports && event.ports[0]) event.ports[0].postMessage({ type: 'PONG' });
      break;

    case 'SHOW_NUDGE_NOTIFICATION':
      (async function() {
        try {
          await self.registration.showNotification('Focus Nudge', {
            body: (d.senderUsername || 'A scholar') + ' nudged you to focus in study.io!',
            icon: ICON,
            badge: BADGE,
            tag: 'studyio-nudge-' + Date.now(),
            renotify: true,
            vibrate: [300, 150, 300],
            data: { url: d.url || '/' },
          });
        } catch(e) {}
      })();
      break;
  }
});

// ─── Notification Click ─────────────────────────────────────────────────────

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  if (event.action === 'pause') {
    self.clients.matchAll({ type: 'window' }).then(function(clients) {
      clients.forEach(function(c) { c.postMessage({ type: 'SW_PAUSE_TIMER' }); });
    });
    return;
  }

  if (event.action === 'resume') {
    self.clients.matchAll({ type: 'window' }).then(function(clients) {
      clients.forEach(function(c) { c.postMessage({ type: 'SW_RESUME_TIMER' }); });
    });
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clients) {
      var found = clients.find(function(c) {
        return c.url.indexOf(self.registration.scope) !== -1;
      });
      if (found) return found.focus();
      return self.clients.openWindow('/');
    })
  );
});

self.addEventListener('notificationclose', function(event) {
  if (state && state.running) {
    showNotif();
  }
});

// ─── Fetch Handling: Cache Strategies ───────────────────────────────────────

const STATIC_ASSET_REGEX = /\.(js|css|woff|woff2|ttf|otf|png|jpg|jpeg|gif|svg|webp|ico)$/i;

self.addEventListener('fetch', function(event) {
  // Only intercept GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Bypass Auth, Supabase DB/RPC, Payments (Razorpay), and WebSockets
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('razorpay.com') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/api/billing/') ||
    url.pathname.startsWith('/api/razorpay/') ||
    url.pathname.startsWith('/api/verify-payment') ||
    url.protocol.startsWith('ws')
  ) {
    return;
  }

  // 1. Navigation Requests (App Shell - Network-First with Cache Fallback)
  // Ensures Android WebView in airplane mode loading from Vercel URL displays the app shell
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then(function(networkResponse) {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(SHELL_CACHE_NAME).then(function(cache) {
              cache.put('/', responseClone);
            });
          }
          return networkResponse;
        })
        .catch(function() {
          // Network failed (offline / airplane mode): return cached app shell, or fallback to offline.html
          return caches.open(SHELL_CACHE_NAME).then(function(cache) {
            return cache.match('/', { ignoreSearch: true }).then(function(cachedShell) {
              if (cachedShell) return cachedShell;
              return cache.match(event.request, { ignoreSearch: true }).then(function(reqMatch) {
                if (reqMatch) return reqMatch;
                return cache.match('/offline.html');
              });
            });
          });
        })
    );
    return;
  }

  // 2. Static Assets (Cache-First)
  const isNextStatic = url.pathname.startsWith('/_next/static/');
  const isGoogleFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  const isStaticFile = STATIC_ASSET_REGEX.test(url.pathname);

  if (isNextStatic || isGoogleFont || isStaticFile) {
    event.respondWith(
      caches.open(STATIC_CACHE_NAME).then(function(cache) {
        return cache.match(event.request).then(function(cachedResponse) {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(event.request)
            .then(function(networkResponse) {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(event.request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(function() {
              return cachedResponse;
            });
        });
      })
    );
    return;
  }

  // 3. API Reads (Network-First with Cache Fallback)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(function(networkResponse) {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(API_CACHE_NAME).then(function(cache) {
              cache.put(event.request, clone);
            });
          }
          return networkResponse;
        })
        .catch(function() {
          return caches.open(API_CACHE_NAME).then(function(cache) {
            return cache.match(event.request);
          });
        })
    );
    return;
  }
});
