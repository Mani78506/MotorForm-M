self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>MotorForm</title><h1>MotorForm is offline</h1><p>Reconnect to load the catalog and your enquiries.</p><a href="/app/">Try again</a>',
    {headers:{'Content-Type':'text/html;charset=utf-8'}}
  )));
});
