// pages/api/sendNotification.js or /api/sendNotification.ts (if using Next.js)

import webpush from "web-push";

const vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
};

webpush.setVapidDetails(
    "mailto:chamboquilon1@gmail.com",
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    if (req.headers["content-type"] !== "application/json") {
        return res.status(400).json({ error: "Expected application/json" });
    }

    const { subscription, title, body, url } = req.body;

    try {
        await webpush.sendNotification(
            subscription,
            JSON.stringify({ title, body, url })
        );
        return res.status(200).json({ success: true });
    } catch (err) {
        console.error("❌ Push error:", err);
        return res.status(500).json({ error: "Push failed", details: err });
    }
}
