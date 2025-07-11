self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    clients.openWindow("/");
});

// public/sw.js
self.addEventListener("push", (event) => {
    const data = event.data?.json() || {};
    const title = data.title || "Grow a Garden Stock Alert";
    self.registration.showNotification(data.title, {
        body: data.body,
        icon: data.icon,
    });
    const options = {
        body: data.body || "An item you want is now in stock!",
        // icon: data.icon || "/icon-192x192.png",
        badge: "/badge-72x72.png", // optional badge
        data: data.url || "/", // URL to open on click
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const urlToOpen = event.notification.data || "/";
    event.waitUntil(
        clients.matchAll({ type: "window" }).then((clientList) => {
            for (const client of clientList) {
                if (client.url === urlToOpen && "focus" in client) {
                    return client.focus();
                }
            }
            return clients.openWindow(urlToOpen);
        })
    );
});
