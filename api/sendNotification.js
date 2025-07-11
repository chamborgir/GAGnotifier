import webpush from "web-push";


const vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
};

// Set web-push config
webpush.setVapidDetails(
    "mailto:your@email.com",
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

export default async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).end();

    const { subscription, title, body, url } = req.body;

    try {
        await webpush.sendNotification(
            subscription,
            JSON.stringify({ title, body, url })
        );
        return res.status(200).json({ success: true });
    } catch (err) {
        console.error("Push error:", err);
        return res.status(500).json({ error: "Push failed", details: err });
    }
}
