/*
 * RagCord Extend, a Vencord fork for the RagnaMod community
 * Copyright (c) 2025 Mausi / RagnaMod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcEvents } from "@shared/IpcEvents";
import { ipcMain } from "electron";

import { callDiscordLink, callDiscordLinkFounder, callLogout, callNews, callNotifications, clearSession, ForumNotification, loadSession, NewsItem, Session } from "./auth";

// In-memory-Cache des rohen Founder-Key-Inhalts. Wird im Login-Gate gesetzt,
// sobald ein User per Authority-Key einsteigt — wir brauchen ihn EINMAL, um
// den Discord-Link beim Backend zu setzen, und dann verschwindet er.
//
// Bewusst NICHT in der Session-Datei persistiert: das wäre Geheimnis-
// Material (signierter Identitäts-Beweis), das sich aus der Disk neu in
// die Session zurücktragen ließe. Verschwindet beim nächsten Discord-Neustart.
let pendingFounderKey: string | null = null;

export function setPendingFounderKey(rawContent: string): void {
    pendingFounderKey = rawContent;
}

export function consumePendingFounderKey(): string | null {
    const v = pendingFounderKey;
    pendingFounderKey = null;
    return v;
}

// We expose only the fields the renderer actually needs to render — never
// the token itself. A renderer-side plugin can ask "who is the current
// user?" without ever holding the credential.
export interface ExposedSessionUser {
    member_id: number;
    username: string;
    name?: string | null;
    mcname?: string | null;
    level?: string | null;
    role?: string | null;
    expires_at: string;
}

function toExposed(s: Session | null): ExposedSessionUser | null {
    if (!s) return null;
    return {
        member_id: s.user.member_id,
        username: s.user.username,
        name: s.user.name ?? null,
        mcname: s.user.mcname ?? null,
        level: s.user.level ?? null,
        role: s.user.role ?? null,
        expires_at: s.expires_at,
    };
}

export function registerRagCordIpcHandlers(): void {
    ipcMain.handle(IpcEvents.RAGCORD_GET_SESSION, async (): Promise<ExposedSessionUser | null> => {
        const session = await loadSession();
        return toExposed(session);
    });

    ipcMain.handle(IpcEvents.RAGCORD_LOGOUT, async (): Promise<boolean> => {
        const session = await loadSession();
        if (session?.token) {
            await callLogout(session.token);
        }
        await clearSession();
        return true;
    });

    // The renderer can't hold the auth token (we never expose it), so the
    // news fetch goes through main. Returns null on no-session or any
    // network/auth failure — the plugin treats null as "skip this tick".
    ipcMain.handle(IpcEvents.RAGCORD_FETCH_NEWS, async (): Promise<NewsItem[] | null> => {
        const session = await loadSession();
        if (!session?.token) return null;
        try {
            const result = await callNews(session.token);
            if (result.ok && Array.isArray(result.news)) {
                return result.news;
            }
            return null;
        } catch {
            return null;
        }
    });

    // Forum-Benachrichtigungen: gleiche Geschichte wie News — der Token
    // bleibt im Main, Renderer sieht nur die Items. Liefert {count, items},
    // damit der Renderer Toast UND Badge in einem Call hat. null bei
    // No-Session / Netzfehler.
    ipcMain.handle(IpcEvents.RAGCORD_FETCH_NOTIFICATIONS, async ():
        Promise<{ count: number; items: ForumNotification[]; } | null> => {
        const session = await loadSession();
        if (!session?.token) return null;
        try {
            const result = await callNotifications(session.token);
            if (result.ok) {
                return { count: result.count ?? 0, items: result.items ?? [] };
            }
            return null;
        } catch {
            return null;
        }
    });

    // Auto-Verify: der Renderer kennt die Discord-User-ID (UserStore), wir
    // kennen den Token (im Main-Prozess gehalten). Renderer ruft das mit der
    // ID an, wir hängen den Token dran und schicken die Verknüpfung an die
    // Auth-API. Antwort ist {ok, error?} — true heißt "Discord-Bot wird das
    // bei nächstem Member-Sync verarbeiten" (Rolle + Nickname setzen).
    ipcMain.handle(
        IpcEvents.RAGCORD_LINK_DISCORD,
        async (_event, discordId: unknown, discordName: unknown):
            Promise<{ ok: boolean; error?: string; }> => {
            // Defensiv: niemals dem Renderer vertrauen, was er als ID schickt.
            const id = typeof discordId === "string" ? discordId.trim() : "";
            if (!/^\d{15,22}$/.test(id)) {
                return { ok: false, error: "Ungültige Discord-ID." };
            }
            const name = typeof discordName === "string"
                ? discordName.trim().slice(0, 100) || null
                : null;

            const session = await loadSession();
            if (!session) return { ok: false, error: "Keine Auth-Session." };

            try {
                // Founder-Pfad: kein Token, aber wir haben (eventuell) den
                // signierten Key-Inhalt direkt aus dem Login-Gate gepuffert.
                // Wenn der Cache leer ist, lehnen wir ab — der User soll dann
                // einmal seinen Key neu auswählen, damit das Backend die
                // Signatur prüfen kann. Niemals den Token-Endpoint stub-mäßig
                // mit einem leeren Token aufrufen.
                if (session.founder) {
                    const key = consumePendingFounderKey();
                    if (!key) {
                        return {
                            ok: false,
                            error: "Founder-Discord-Link nur direkt nach Authority-Login möglich.",
                        };
                    }
                    const fResult = await callDiscordLinkFounder(key, id, name);
                    if (fResult.ok) return { ok: true };
                    return { ok: false, error: fResult.error || "Verknüpfung fehlgeschlagen." };
                }

                if (!session.token) return { ok: false, error: "Keine Auth-Session." };
                const result = await callDiscordLink(session.token, id, name);
                if (result.ok) return { ok: true };
                return { ok: false, error: result.error || "Verknüpfung fehlgeschlagen." };
            } catch {
                return { ok: false, error: "Auth-Server nicht erreichbar." };
            }
        },
    );
}
