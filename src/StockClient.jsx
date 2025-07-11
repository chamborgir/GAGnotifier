import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

import "./StockClient.css";

function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, "+")
        .replace(/_/g, "/");

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

const StockClient = () => {
    const [allStock, setAllStock] = useState({});
    const [weather, setWeather] = useState(null);
    const stockKeys = [
        "seed_stock",
        "gear_stock",
        "egg_stock",
        "cosmetic_stock",
        "event_stock",
    ];

    const [user, setUser] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoginMode, setIsLoginMode] = useState(true);
    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);

    const [editModalOpen, setEditModalOpen] = useState(false);
    const [availablePreferences, setAvailablePreferences] = useState([]);
    const [selectedPreferences, setSelectedPreferences] = useState([]);

    const [authNotice, setAuthNotice] = useState("");

    const [nextExpiryTime, setNextExpiryTime] = useState(null);
    const [countdown, setCountdown] = useState("");

    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [notifiedItems, setNotifiedItems] = useState(new Set());

    const [subscription, setSubscription] = useState(null);

    useEffect(() => {
        const userId = "911260968980447293";
        const ws = new WebSocket(
            `wss://websocket.joshlei.com/growagarden?user_id=${userId}`
        );

        ws.onopen = () => console.log("✅ Connected to Joshlei WebSocket");

        ws.onmessage = (event) => {
            try {
                const parsed = JSON.parse(event.data);
                const filtered = {};
                const bufferMs = 5000;

                stockKeys.forEach((key) => {
                    const value = parsed[key];
                    if (Array.isArray(value)) {
                        const available = value.filter((item) => {
                            const endTime = new Date(item.Date_End).getTime();
                            const isAvailable = endTime > Date.now() - bufferMs;

                            if (!isAvailable) {
                                console.warn(
                                    `⛔ Skipping expired: ${item.display_name} (${key}) - Ends: ${item.Date_End}`
                                );
                            }

                            return isAvailable;
                        });

                        if (available.length > 0) filtered[key] = available;
                    }
                });

                const syncNewStockItems = async (items, type) => {
                    if (!Array.isArray(items)) return;

                    const inserts = items.map((item) => ({
                        item_id: item.item_id,
                        item_name: item.display_name,
                        type,
                        icon_url: item.icon || null,
                    }));

                    for (const entry of inserts) {
                        // Try insert; if already exists, ignore
                        await supabase
                            .from("all_stock_items")
                            .upsert(entry, { onConflict: "item_id" }); // won't insert duplicate
                    }
                };

                if (Array.isArray(parsed.seed_stock)) {
                    syncNewStockItems(parsed.seed_stock, "seed");
                }
                if (Array.isArray(parsed.gear_stock)) {
                    syncNewStockItems(parsed.gear_stock, "gear");
                }
                if (Array.isArray(parsed.egg_stock)) {
                    syncNewStockItems(parsed.egg_stock, "egg");
                }

                // ✅ Compute soonest expiration time AFTER filtering
                const allItems = Object.values(filtered).flat();
                if (allItems.length > 0) {
                    const soonest = allItems.reduce((min, item) => {
                        const time = new Date(item.Date_End).getTime();
                        return isNaN(time) ? min : Math.min(min, time);
                    }, Infinity);
                    setNextExpiryTime(soonest !== Infinity ? soonest : null);
                } else {
                    setNextExpiryTime(null);
                }

                setAllStock((prev) => ({
                    ...prev,
                    ...filtered,
                }));

                if (user && subscription) {
                    const currentItems = Object.values(filtered).flat();
                    const matching = currentItems.filter((item) =>
                        selectedPreferences.includes(item.item_id)
                    );

                    if (matching.length > 0) {
                        for (const item of matching) {
                            fetch("/api/sendNotification", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    subscription,
                                    title: "Stock Alert!",
                                    body: `${item.display_name} is now available.`,
                                    url: window.location.href,
                                }),
                            });
                        }
                    }
                }

                // ✅ Compare filtered stock to user preferences
                if (user && selectedPreferences.length > 0) {
                    const newMatchedItems = Object.values(filtered)
                        .flat()
                        .filter(
                            (item) =>
                                selectedPreferences.includes(item.item_id) &&
                                !notifiedItems.has(item.item_id)
                        );

                    // Send notifications and update notifiedItems
                    if (newMatchedItems.length > 0) {
                        newMatchedItems.forEach((item) => {
                            sendPushNotification(
                                `🔔 ${item.display_name} is now in stock!`,
                                {
                                    body: `Ends at ${new Date(
                                        item.Date_End
                                    ).toLocaleTimeString()}`,
                                    icon: item.icon,
                                }
                            );

                            setNotifiedItems((prev) =>
                                new Set(prev).add(item.item_id)
                            );
                        });
                    }
                }

                if (Array.isArray(parsed.weather)) {
                    const activeWeather = parsed.weather.find((w) => w.active);
                    if (activeWeather) {
                        setWeather({
                            ...activeWeather,
                            display_name: activeWeather.name,
                            Date_End: activeWeather.ends_at,
                        });
                    } else {
                        setWeather({
                            weather_id: "weather_clear",
                            display_name: "Clear Weather",
                            description: "No active weather effect.",
                            Date_End: new Date(
                                Date.now() + 15 * 60000
                            ).toISOString(),
                        });
                    }
                }

                console.log("📦 Parsed data:", parsed);
            } catch (e) {
                console.error("❌ Failed to parse message:", e.message);
            }
        };

        ws.onclose = () =>
            console.log("❌ Disconnected from Joshlei WebSocket");

        return () => ws.close();
    }, []);

    useEffect(() => {
        if (!nextExpiryTime || isNaN(nextExpiryTime)) return;

        const interval = setInterval(() => {
            const msLeft = nextExpiryTime - Date.now();

            if (msLeft <= 0) {
                setCountdown("Refreshing...");
            } else {
                const min = Math.floor(msLeft / 60000);
                const sec = Math.floor((msLeft % 60000) / 1000)
                    .toString()
                    .padStart(2, "0");
                setCountdown(`${min}:${sec}`);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [nextExpiryTime]);

    useEffect(() => {
        const fetchWeather = async () => {
            try {
                const res = await fetch(
                    "https://api.joshlei.com/v2/growagarden/weather"
                );
                const data = await res.json();
                if (Array.isArray(data)) {
                    const active = data.find((w) => w.active);
                    if (active) {
                        setWeather({
                            ...active,
                            display_name: active.name,
                            Date_End: active.ends_at,
                        });
                    } else {
                        setWeather({
                            weather_id: "weather_clear",
                            display_name: "Clear Weather",
                            description: "No active weather effect.",
                            Date_End: new Date(
                                Date.now() + 15 * 60000
                            ).toISOString(),
                        });
                    }
                }
            } catch (err) {
                console.error("🌤️ Weather fetch failed:", err.message);
            }
        };

        fetchWeather();
        const interval = setInterval(fetchWeather, 60000); // every 1 minute

        return () => clearInterval(interval);
    }, []);

    const renderStockList = (title, stockArray) => {
        const typeKey = title.toLowerCase(); // ex: EGG -> egg
        let refreshTime = null;

        if (typeKey === "egg") {
            refreshTime = getNextRefreshTime("egg");
        } else if (typeKey === "cosmetic") {
            refreshTime = getNextRefreshTime("cosmetic");
        }

        const refreshCountdown =
            refreshTime && !isNaN(refreshTime)
                ? Math.max(0, refreshTime.getTime() - Date.now())
                : null;

        const refreshDisplay =
            refreshCountdown !== null
                ? `Next Refresh: ${Math.floor(refreshCountdown / 60000)} min`
                : countdown
                ? countdown
                : null;

        return (
            <div className="stock-section" key={title}>
                <h3 className="stock-title">
                    {title}
                    {refreshDisplay && (
                        <span className="stock-timer-inline">
                            &nbsp;{refreshDisplay}
                        </span>
                    )}
                </h3>
                <ul className="stock-grid">
                    {stockArray.map((item, index) => (
                        <li
                            key={`${item.item_id}-${item.Date_Start}-${index}`}
                            className="stock-card"
                        >
                            <img
                                src={item.icon}
                                alt={item.display_name}
                                className="stock-icon"
                            />
                            <div className="stock-info">
                                <div className="stock-name">
                                    {item.display_name}
                                </div>
                                <div className="stock-qty">
                                    Qty: {item.quantity}
                                </div>
                                <div className="stock-meta">
                                    ID: {item.item_id} | Ends:{" "}
                                    {new Date(
                                        item.Date_End
                                    ).toLocaleTimeString()}
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        );
    };

    const renderWeather = () => (
        <div className="stock-section">
            <h3 className="stock-title">CURRENT WEATHER</h3>
            <div className="stock-card">
                {weather.weather_id === "weather_clear" ? (
                    <div className="stock-icon emoji-icon">☀️</div>
                ) : (
                    <img
                        src={`https://api.joshlei.com/v2/growagarden/image/${weather.weather_id}`}
                        alt={weather.display_name}
                        className="stock-icon"
                    />
                )}

                <div className="stock-info">
                    <div className="stock-name">{weather.display_name}</div>
                    <div className="stock-qty">
                        Effect: {weather.description || "N/A"}
                    </div>
                    <div className="stock-meta">
                        Ends: {new Date(weather.Date_End).toLocaleTimeString()}
                    </div>
                </div>
            </div>
        </div>
    );

    useEffect(() => {
        const fetchSession = async () => {
            const {
                data: { session },
            } = await supabase.auth.getSession();
            setUser(session?.user || null);
        };

        const urlBase64ToUint8Array = (base64String) => {
            const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
            const base64 = (base64String + padding)
                .replace(/-/g, "+")
                .replace(/_/g, "/");
            const rawData = atob(base64);
            return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
        };

        if ("serviceWorker" in navigator && "PushManager" in window) {
            navigator.serviceWorker.ready.then(async (registration) => {
                try {
                    const existing =
                        await registration.pushManager.getSubscription();
                    if (existing) {
                        setSubscription(existing);
                        return;
                    }

                    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
                    console.log("🔑 Using VAPID key:", vapidKey);

                    const newSub = await registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: urlBase64ToUint8Array(vapidKey),
                    });

                    console.log("✅ Push subscription created:", newSub);
                    setSubscription(newSub);
                } catch (err) {
                    console.error("❌ Push subscription failed:", err);
                }
            });
        }

        fetchSession();

        supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user || null);
        });
    }, []);

    const handleSignup = async () => {
        setAuthNotice("");
        setLoading(true);

        const { error } = await supabase.auth.signUp({
            email,
            password,
        });

        if (error) {
            setAuthNotice(error.message);
        } else {
            setAuthNotice("✅ Check your email for confirmation.");
        }

        setLoading(false);
    };

    const handleLogin = async () => {
        setAuthNotice("");
        setLoading(true);

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            setAuthNotice(error.message);
        } else {
            setShowModal(false);
        }

        setLoading(false);
    };
    useEffect(() => {
        if (!("Notification" in window)) return;

        const askPermissionOnce = async () => {
            const asked = localStorage.getItem("push_permission_requested");

            if (!asked) {
                const permission = await Notification.requestPermission();
                if (permission !== "denied") {
                    localStorage.setItem("push_permission_requested", "true");
                }
                console.log("🔔 Notification permission:", permission);
            }
        };

        askPermissionOnce();
    }, []);
    useEffect(() => {
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker
                .register("/sw.js")
                .then((reg) => {
                    console.log("✅ Service worker registered:", reg.scope);
                })
                .catch((err) => {
                    console.error(
                        "❌ Service worker registration failed:",
                        err
                    );
                });
        }
    }, []);

    const handleLogout = async () => {
        await supabase.auth.signOut();
    };

    const handleEditPreferences = async () => {
        await fetchAllAvailableItems(); // ✅ pull data from Supabase
        setEditModalOpen(true);
    };
    useEffect(() => {
        if (countdown === "Refreshing...") {
            setNotifiedItems(new Set()); // reset notifications
        }
    }, [countdown]);

    useEffect(() => {
        if (!user) return;
        const fetchPreferences = async () => {
            const { data, error } = await supabase
                .from("stock_preferences")
                .select("*")
                .eq("user_id", user.id);
            if (!error) {
                setSelectedPreferences(data.map((d) => d.item_id));
            }
        };
        fetchPreferences();
    }, [user]);

    const handleSavePreferences = async () => {
        if (!user) return;

        // Clear existing preferences
        await supabase
            .from("stock_preferences")
            .delete()
            .eq("user_id", user.id);

        const inserts = selectedPreferences.map((itemId) => {
            const found = availablePreferences.find(
                (i) => i.item_id === itemId
            );
            return {
                user_id: user.id,
                item_id: found.item_id,
                item_name: found.item_name,
                type: found.type,
            };
        });

        const { error } = await supabase
            .from("stock_preferences")
            .insert(inserts);
        console.log("Payload:", inserts);

        if (!error) {
            setEditModalOpen(false);
            setShowSuccessModal(true);

            // Auto-close success modal after 2 seconds
            setTimeout(() => setShowSuccessModal(false), 2000);
        } else {
            alert("Failed to save preferences.");
        }
    };

    const getNextRefreshTime = (type) => {
        const now = new Date();

        if (type === "egg") {
            // Pet stock: every 30 minutes
            const minutes = now.getMinutes();
            const nextHalfHour = minutes < 30 ? 30 : 60;
            const next = new Date(now);
            next.setMinutes(nextHalfHour, 0, 0);
            return next;
        }

        if (type === "cosmetic") {
            // Cosmetic stock: every 4 hours starting at 0, 4, 8, 12, 16, 20
            const currentHour = now.getHours();
            const nextHourBlock = Math.ceil((currentHour + 1) / 4) * 4;
            const next = new Date(now);
            next.setHours(nextHourBlock, 0, 0, 0);
            return next;
        }

        return null;
    };

    const fetchAllAvailableItems = async () => {
        const { data, error } = await supabase
            .from("all_stock_items")
            .select("*")
            .in("type", ["seed", "gear", "egg"]);

        if (!error) {
            setAvailablePreferences(data);
        } else {
            console.error("Error fetching available items:", error.message);
        }
    };

    const sendPushNotification = (title, options) => {
        if (Notification.permission === "granted") {
            new Notification(title, options);
        }
    };

    return (
        <div className="stock-wrapper">
            <div className="stock-header-row">
                <h2 className="stock-header">Grow a Garden Stock</h2>
                <div className="user-menu">
                    <button
                        className="user-button"
                        onClick={() => setShowModal(true)}
                    >
                        {user ? "👤" : "🔐"}
                    </button>

                    {showModal && (
                        <div className="modal-overlay">
                            <div className="modal-centered">
                                {user ? (
                                    <>
                                        <h2>Account</h2>
                                        <button
                                            className="user-button"
                                            onClick={handleLogout}
                                        >
                                            Logout
                                        </button>
                                        <button
                                            className="user-button"
                                            onClick={handleEditPreferences}
                                        >
                                            Edit Preferences
                                        </button>
                                        <button
                                            className="modal-cancel"
                                            onClick={() => setShowModal(false)}
                                        >
                                            Close
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <h2>{isLogin ? "Login" : "Sign Up"}</h2>

                                        {authNotice && (
                                            <p
                                                style={{
                                                    color: "#22d3ee",
                                                    fontSize: "0.9rem",
                                                }}
                                            >
                                                {authNotice}
                                            </p>
                                        )}

                                        <input
                                            type="email"
                                            placeholder="Email"
                                            value={email}
                                            onChange={(e) =>
                                                setEmail(e.target.value)
                                            }
                                        />
                                        <input
                                            type="password"
                                            placeholder="Password"
                                            value={password}
                                            onChange={(e) =>
                                                setPassword(e.target.value)
                                            }
                                        />

                                        <button
                                            className="auth-button"
                                            onClick={
                                                isLogin
                                                    ? handleLogin
                                                    : handleSignup
                                            }
                                            disabled={loading}
                                        >
                                            {loading
                                                ? isLogin
                                                    ? "Logging in..."
                                                    : "Signing up..."
                                                : isLogin
                                                ? "Login"
                                                : "Sign Up"}
                                        </button>

                                        <p
                                            className="toggle-link"
                                            onClick={() => setIsLogin(!isLogin)}
                                        >
                                            {isLogin
                                                ? "No account? Create here"
                                                : "Have an account? Login here"}
                                        </p>

                                        <button
                                            className="modal-cancel"
                                            onClick={() => setShowModal(false)}
                                        >
                                            Cancel
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {Object.entries(allStock).length === 0 && !weather ? (
                <p className="stock-wait">Waiting for stock update...</p>
            ) : (
                <div>
                    {weather && renderWeather()}
                    {Object.entries(allStock).map(([type, items]) =>
                        renderStockList(
                            type.replace("_stock", "").toUpperCase(),
                            items
                        )
                    )}
                </div>
            )}

            {/* ✅ Edit Preferences Modal */}
            {editModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-centered preferences-modal">
                        <h2>Edit Preferences</h2>
                        <p className="preferences-description">
                            Choose what stocks you want to be notified about:
                        </p>
                        <div className="preferences-scroll">
                            {["seed", "gear", "egg"].map((type) => {
                                const filtered = availablePreferences.filter(
                                    (item) => item.type === type
                                );
                                if (filtered.length === 0) return null;

                                return (
                                    <div
                                        key={type}
                                        className="preferences-group"
                                    >
                                        <h4 className="preferences-group-title">
                                            {type.toUpperCase()} STOCKS
                                        </h4>
                                        {filtered.map((item) => (
                                            <div
                                                className="preferences-item"
                                                key={item.item_id}
                                            >
                                                <div className="preference-left">
                                                    <img
                                                        src={item.icon_url}
                                                        alt={
                                                            item.item_name ||
                                                            item.item_id
                                                        }
                                                        className="preference-icon"
                                                    />
                                                    <span className="preference-name">
                                                        {item.item_name ||
                                                            item.item_id}
                                                    </span>
                                                </div>
                                                <div className="preference-checkbox">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedPreferences.includes(
                                                            item.item_id
                                                        )}
                                                        onChange={(e) => {
                                                            const checked =
                                                                e.target
                                                                    .checked;
                                                            setSelectedPreferences(
                                                                (prev) =>
                                                                    checked
                                                                        ? [
                                                                              ...prev,
                                                                              item.item_id,
                                                                          ]
                                                                        : prev.filter(
                                                                              (
                                                                                  id
                                                                              ) =>
                                                                                  id !==
                                                                                  item.item_id
                                                                          )
                                                            );
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="preferences-buttons">
                            <button
                                className="auth-button"
                                onClick={handleSavePreferences}
                            >
                                Save
                            </button>
                            <button
                                className="modal-cancel"
                                onClick={() => setEditModalOpen(false)}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showSuccessModal && (
                <div className="modal-overlay">
                    <div className="modal-centered toast-notification">
                        <h3 style={{ textAlign: "center" }}>
                            ✅ Saved Successfully
                        </h3>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StockClient;
