const CACHE_NAME = 'reportes-ci-v2';
const APP_SHELL = ['/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first: los reportes necesitan datos frescos, pero esto mantiene
// disponible el armazon de la app sin conexion.
//
// Dos reglas que antes faltaban y rompian las imagenes de evidencias:
//
// 1. Solo se interviene en peticiones al propio origen. Las de Supabase
//    (URLs firmadas de Storage, API, Realtime) pasan directo al navegador.
//    No tiene caso cachearlas: la firma expira y el caché nunca va a tener
//    una copia util.
//
// 2. Nunca se responde con undefined. caches.match() devuelve undefined
//    cuando no hay coincidencia, y respondWith(undefined) hace fallar la
//    peticion con "resolved with non-Response value". Eso era lo que
//    impedia ver las fotos: el Service Worker se quedaba con la respuesta
//    y no entregaba nada.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request).catch(async () => {
      const enCache = await caches.match(event.request);
      if (enCache) return enCache;
      return new Response('Sin conexion', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    })
  );
});

// --- Manejo de mensajes desde la app (OWASP A04 - logout cleanup) ---

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_ALL_DATA') {
    console.log('[SW] Limpiando todos los datos...');
    
    // Limpiar caches de la app
    caches.keys().then((cacheNames) => {
      Promise.all(
        cacheNames.map((cacheName) => {
          console.log('[SW] Eliminando cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    });

    event.ports[0].postMessage({ success: true, message: 'SW data cleared' });
  }
});

// --- Notificaciones push ---

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let datos = {};
  try {
    datos = event.data.json();
  } catch {
    datos = { titulo: 'Reportes de Servicio', cuerpo: event.data.text() };
  }

  const titulo = datos.titulo || 'Reportes de Servicio';
  const opciones = {
    body: datos.cuerpo || '',
    icon: '/icons/icon-192.png',
    // Android muestra el badge como silueta: tiene que ser blanco sobre
    // transparente, no el icono a color.
    badge: '/icons/badge-96.png',
    // La URL viaja en data para poder abrirla al tocar la notificación.
    data: { url: datos.url || '/' },
    // Agrupa por tipo: varias solicitudes de herramienta no llenan la
    // pantalla de bloqueo con avisos repetidos.
    tag: datos.tag || undefined,
    renotify: !!datos.tag,
    vibrate: [80, 40, 80],
  };

  event.waitUntil(self.registration.showNotification(titulo, opciones));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || '/';

  // Si la app ya está abierta, se reutiliza esa ventana en lugar de abrir otra.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if ('focus' in v) {
          v.navigate(destino);
          return v.focus();
        }
      }
      return self.clients.openWindow(destino);
    })
  );
});
