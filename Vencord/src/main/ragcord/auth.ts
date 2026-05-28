/*
 * RagCord Extend, a Vencord fork for the RagnaMod community
 * Copyright (c) 2025 Mausi / RagnaMod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, safeStorage } from "electron";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { join } from "path";

// The RagnaMod auth service. Hardcoded for now; if Mausi ever moves the
// endpoint, change it here. Note: plain HTTP — anyone with the user's local
// network can see the username + password go by. If the auth host gets
// fronted by an HTTPS terminator later, swap this string.
export const RAGCORD_AUTH_BASE = process.env.RAGCORD_AUTH_BASE
    || "http://46.17.217.79:8000";

// Network timeout for /api/login and /api/verify — anything past this and
// we treat the API as unreachable. 8 seconds is a comfortable upper bound
// for a Flask+MySQL endpoint on a healthy host.
const AUTH_REQUEST_TIMEOUT_MS = 8000;

export interface SessionUser {
    member_id: number;
    username: string;
    name?: string | null;
    mcname?: string | null;
    level?: string | null;
    role?: string | null;
}

export interface Session {
    /**
     * Server-Token aus /api/login. Bei Gründungsmitgliedern, die per
     * Offline-Founder-Key eingestiegen sind, leer — siehe `founder`.
     */
    token: string;
    expires_at: string;
    user: SessionUser;
    /**
     * Marker für die token-lose Founder-Offline-Session (analog zum
     * RagnaMod-Launcher). `verify`/`logout` werden für diese Sessions
     * server-seitig nicht aufgerufen.
     */
    founder?: boolean;
    /**
     * Quelle der Session — informativ, hilft beim Debuggen und bei
     * späteren Statistik-Auswertungen. "ragcord" = direkter Login im Mod,
     * "launcher" = vom RagnaMod-Launcher übernommen, "founder" = Offline-
     * Authority-Key.
     */
    source?: "ragcord" | "launcher" | "founder";
}

export interface LoginResponse {
    ok: boolean;
    error?: string;
    code?: string;
    token?: string;
    expires_at?: string;
    user?: SessionUser;
}

export interface VerifyResponse {
    ok: boolean;
    error?: string;
    code?: string;
    user?: SessionUser;
}

function sessionDir() {
    // process.env.DATA_DIR is set by patcher.ts before our module loads; fall
    // back to Electron's userData if we somehow ran before it.
    const base = process.env.DATA_DIR
        ?? join(app.getPath("userData"), "..", "RagCord");
    return join(base, "ragcord");
}

function sessionFile() {
    return join(sessionDir(), "session.dat");
}

export async function loadSession(): Promise<Session | null> {
    try {
        const buf = await readFile(sessionFile());
        let json: string;
        if (safeStorage.isEncryptionAvailable()) {
            try {
                json = safeStorage.decryptString(buf);
            } catch {
                // Stored encrypted but keystore changed (new user profile, etc.)
                // — treat as a missing session.
                return null;
            }
        } else {
            // safeStorage not available on this platform (e.g. Linux without a
            // keyring); the file is plain UTF-8 JSON. Same trust level as the
            // rest of the Vencord settings dir.
            json = buf.toString("utf-8");
        }
        const parsed = JSON.parse(json);
        if (typeof parsed?.token !== "string") return null;
        return parsed as Session;
    } catch {
        return null;
    }
}

export async function saveSession(session: Session): Promise<void> {
    await mkdir(sessionDir(), { recursive: true });
    const json = JSON.stringify(session);
    const data: Buffer = safeStorage.isEncryptionAvailable()
        ? safeStorage.encryptString(json)
        : Buffer.from(json, "utf-8");
    // Atomic write — same pattern as the settings hardening patch.
    const tmp = sessionFile() + ".tmp";
    await writeFile(tmp, data);
    const { rename } = await import("fs/promises");
    await rename(tmp, sessionFile());
}

export async function clearSession(): Promise<void> {
    try { await unlink(sessionFile()); } catch { /* ignore */ }
}

async function postJson<T>(path: string, body: object): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS);
    try {
        const res = await fetch(RAGCORD_AUTH_BASE + path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        // The API answers with JSON for both success and most error cases
        // (Flask sets the status code; we still want the body to surface the
        // server-side `error` string).
        return await res.json() as T;
    } finally {
        clearTimeout(timer);
    }
}

export async function callLogin(username: string, password: string): Promise<LoginResponse> {
    return postJson<LoginResponse>("/api/login", { username, password });
}

export async function callVerify(token: string): Promise<VerifyResponse> {
    return postJson<VerifyResponse>("/api/verify", { token });
}

export async function callLogout(token: string): Promise<void> {
    try {
        await postJson<{ ok: boolean }>("/api/logout", { token });
    } catch {
        // Best-effort — even if the server is down, the local session is
        // cleared by clearSession().
    }
}

export interface NewsItem {
    id: number;
    title: string;
    body: string;
    author: string;
    pinned: boolean;
    created_at: string | null;
}

export interface NewsResponse {
    ok: boolean;
    error?: string;
    news?: NewsItem[];
}

export async function callNews(token: string): Promise<NewsResponse> {
    return postJson<NewsResponse>("/api/news", { token });
}

export interface DiscordLinkResponse {
    ok: boolean;
    error?: string;
    member_id?: number;
}

/**
 * Hängt die aktuelle Discord-User-ID an die laufende Auth-Session an.
 * Backend speichert das Mapping in `discord_links` (siehe auth-api/db.py).
 * Der Discord-Bot wertet das Mapping dann aus und vergibt die Verified-
 * Rolle + setzt den Nicknamen auf den MC-Namen — keine `?verify`-Befehle
 * mehr nötig.
 */
export async function callDiscordLink(
    token: string,
    discordId: string,
    discordName?: string | null,
): Promise<DiscordLinkResponse> {
    return postJson<DiscordLinkResponse>("/api/discord/link", {
        token,
        discord_id: discordId,
        discord_name: discordName || null,
    });
}

export interface DiscordLinkFounderResponse {
    ok: boolean;
    error?: string;
    member_id?: number;
    user?: SessionUser;
}

/**
 * Founder-Key-Variante: für Gründungsmitglieder, die keinen Server-Token
 * besitzen (Offline-Login). Wir reichen den signierten Key-Inhalt an die
 * API durch; die verifiziert die Ed25519-Signatur und legt den Discord-
 * Link an. Identisches Public-Key-Material wie der Launcher.
 */
export async function callDiscordLinkFounder(
    founderKey: string,
    discordId: string,
    discordName?: string | null,
): Promise<DiscordLinkFounderResponse> {
    return postJson<DiscordLinkFounderResponse>("/api/discord/link-founder", {
        founder_key: founderKey,
        discord_id: discordId,
        discord_name: discordName || null,
    });
}

export interface ForumNotification {
    id: number;
    type?: string | null;
    topic_id?: number | null;
    comment_id?: number | null;
    from?: string | null;
    text?: string | null;
    is_read: boolean;
    created_at: string | null;
}

export interface NotificationsResponse {
    ok: boolean;
    error?: string;
    count?: number;
    items?: ForumNotification[];
}

export async function callNotifications(token: string): Promise<NotificationsResponse> {
    return postJson<NotificationsResponse>("/api/notifications", { token });
}
