/*
 * RagCord Extend, a Vencord fork for the RagnaMod community
 * Copyright (c) 2025 Mausi / RagnaMod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Notification } from "electron";

import { callVerify, clearSession, loadSession } from "./auth";

// Re-check the session every 4 hours during a running Discord process.
// The check is cheap (one HTTP request, server-side `last_used` update)
// and lets the auth API revoke sessions in near-realtime: a banned account
// loses Discord access on the next check rather than on the next launch.
const REFRESH_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

// Surface a desktop notification once the token has less than this much
// time left. Two days is enough lead time to plan a re-login without being
// surprised on a Monday morning.
const WARN_WHEN_LESS_THAN_MS = 2 * 24 * 60 * 60 * 1000;

// Run the first check shortly after startup so a freshly-revoked token is
// caught without waiting for the full interval.
const STARTUP_CHECK_DELAY_MS = 60 * 1000;

let refreshTimer: NodeJS.Timeout | null = null;
let startupTimer: NodeJS.Timeout | null = null;
let warnedThisSession = false;

export function startTokenRefreshLoop(): void {
    if (refreshTimer) return;
    refreshTimer = setInterval(checkToken, REFRESH_CHECK_INTERVAL_MS);
    if (refreshTimer.unref) refreshTimer.unref();
    startupTimer = setTimeout(checkToken, STARTUP_CHECK_DELAY_MS);
    if (startupTimer.unref) startupTimer.unref();
}

export function stopTokenRefreshLoop(): void {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
    if (startupTimer) {
        clearTimeout(startupTimer);
        startupTimer = null;
    }
}

async function checkToken(): Promise<void> {
    const session = await loadSession();
    if (!session) return;

    const expiresAt = Date.parse(session.expires_at);
    if (Number.isNaN(expiresAt)) {
        // Malformed session file — treat as missing, force re-login on
        // next launch.
        await clearSession();
        return;
    }

    const now = Date.now();
    const msUntilExpiry = expiresAt - now;

    // Already past expiry — drop the local session so the next launch
    // routes through the login window instead of silently failing.
    if (msUntilExpiry <= 0) {
        await clearSession();
        notify(
            "RagnaMod-Sitzung abgelaufen",
            "Beim nächsten Discord-Start ist eine Anmeldung erforderlich.",
        );
        return;
    }

    // Confirm with the server that the session is still valid (catches
    // server-side revocation between launches).
    try {
        const result = await callVerify(session.token);
        if (!result.ok) {
            await clearSession();
            notify(
                "RagnaMod-Sitzung beendet",
                "Deine Sitzung wurde serverseitig aufgehoben. Beim nächsten Discord-Start neu anmelden.",
            );
            return;
        }
    } catch {
        // Network error reaching the auth API — leave the local session
        // alone and try again on the next interval. We do NOT escalate to
        // a re-login prompt on transient network failures.
        return;
    }

    // Warn once per session about the upcoming expiry.
    if (!warnedThisSession && msUntilExpiry < WARN_WHEN_LESS_THAN_MS) {
        warnedThisSession = true;
        const days = Math.max(1, Math.ceil(msUntilExpiry / (24 * 60 * 60 * 1000)));
        notify(
            "RagnaMod-Sitzung läuft bald ab",
            `Noch ${days} Tag${days === 1 ? "" : "e"} gültig — bitte beim nächsten Discord-Start neu anmelden.`,
        );
    }
}

function notify(title: string, body: string) {
    try {
        if (!Notification.isSupported()) return;
        const n = new Notification({ title, body, silent: false });
        n.show();
    } catch (e) {
        console.error("[RagCord] tokenRefresh notify failed:", e);
    }
}
