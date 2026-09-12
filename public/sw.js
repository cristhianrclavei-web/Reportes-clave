const CACHE_NAME = 'reportes-ci-v1';
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

// Network-first: reports need fresh data, but this keeps the app shell available offline.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
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
