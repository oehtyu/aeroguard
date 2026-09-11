self.addEventListener('push', (event) => {
  let data = { title: 'AeroGuard Alert', body: 'A new alert was triggered.', url: '/dashboard' };
  try {
    data = event.data.json();
  } catch (e) {
    // if the payload wasn't JSON for some reason, fall back to the defaults above
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/dashboard' },
      requireInteraction: true, // stays on screen until dismissed — appropriate for a fire alert
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});