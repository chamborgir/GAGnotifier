self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    clients.openWindow("/");
});
