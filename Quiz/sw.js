/**
 * Service Worker – macht das Quiz offline-fähig und installierbar.
 *
 * Strategie "stale-while-revalidate": Dateien kommen sofort aus dem Cache
 * (schnell + offline), im Hintergrund wird die aktuelle Version geladen und
 * für den nächsten Start gespeichert. Neue Biases in ../script.js erscheinen
 * also spätestens beim übernächsten Öffnen automatisch – ohne Versionswechsel.
 *
 * CACHE_VERSION nur erhöhen, wenn sich die Liste in PRECACHE ändert.
 */
const CACHE_VERSION = 'bias-quiz-v1';

const PRECACHE = [
    'quiz.html',
    'quiz.css',
    'quiz.js',
    'manifest.webmanifest',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/apple-touch-icon.png',
    '../script.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then(cache => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    // Alte Cache-Versionen aufräumen
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_VERSION);
        const cached = await cache.match(request, { ignoreSearch: true });

        const network = fetch(request)
            .then(response => {
                if (response.ok) cache.put(request, response.clone());
                return response;
            })
            .catch(() => null);

        if (cached) {
            event.waitUntil(network); // im Hintergrund aktualisieren
            return cached;
        }

        const response = await network;
        if (response) return response;

        // Offline und nicht im Cache: bei Seitenaufrufen das Quiz zeigen
        if (request.mode === 'navigate') return cache.match('quiz.html');
        return new Response('', { status: 504, statusText: 'Offline' });
    })());
});
