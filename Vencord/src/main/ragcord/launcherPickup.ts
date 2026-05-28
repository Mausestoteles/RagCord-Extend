/*
 * RagCord Extend, a Vencord fork for the RagnaMod community
 * Copyright (c) 2025 Mausi / RagnaMod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Pickup einer bestehenden RagnaMod-Launcher-Session. Wenn der User den
// Launcher schon installiert + eingeloggt hat, müssen wir ihn im Discord-
// Login-Gate nicht erneut nach Credentials fragen — wir lesen den Token
// (oder die Founder-Offline-Session) aus der electron-store-Config des
// Launchers und übernehmen sie.
//
// Pfad (siehe ragnamod-src/main.js:14-18):
//   %AppData%/RagnaMod Launcher/config.json
//
// Struktur (siehe founder-key.js:79 und ragna-auth.js):
//   {
//     "ragnaSession": {
//       "token": "abcdef…" | null,
//       "founder": true | false,
//       "expiresAt": "2026-…" | null,
//       "user": { member_id, username, name, mcname, level, role }
//     }
//   }
//
// Wir prüfen vor dem Übernehmen, ob der Token noch lebt (callVerify gegen
// die Auth-API). Founder-Sessions werden direkt übernommen — die haben
// keinen Server-Anteil und brauchen keinen Verify.

import { app } from "electron";
import { readFileSync } from "fs";
import { join } from "path";

import { callVerify, Session, SessionUser } from "./auth";

const LAUNCHER_APP_NAME = "RagnaMod Launcher";
const LAUNCHER_CONFIG_FILENAME = "config.json";

interface LauncherSession {
    token?: string | null;
    founder?: boolean;
    expiresAt?: string | null;
    user?: Partial<SessionUser> & { member_id?: number; username?: string };
}

interface LauncherConfig {
    ragnaSession?: LauncherSession;
}

function launcherConfigPath(): string {
    // Auf Windows = %AppData%\RagnaMod Launcher\config.json
    // Auf Linux / macOS = $XDG_CONFIG_HOME bzw. ~/Library/Application Support/…
    // — der Launcher setzt das in seinem main.js auf den App-Namen-Subordner
    // und legt config.json via electron-store ab.
    return join(app.getPath("appData"), LAUNCHER_APP_NAME, LAUNCHER_CONFIG_FILENAME);
}

function readLauncherSession(): LauncherSession | null {
    try {
        const raw = readFileSync(launcherConfigPath(), "utf-8");
        const parsed = JSON.parse(raw) as LauncherConfig;
        const session = parsed?.ragnaSession;
        if (!session || typeof session !== "object") return null;
        // Mindestens ein verwertbares Login-Artefakt muss vorhanden sein.
        if (!session.token && !session.founder) return null;
        if (!session.user?.member_id || !session.user?.username) return null;
        return session;
    } catch {
        // ENOENT (Launcher nicht installiert) und SyntaxError (kaputtes JSON,
        // Launcher gerade beim Schreiben) sind beide normale Skip-Bedingungen.
        return null;
    }
}

function toRagCordUser(u: NonNullable<LauncherSession["user"]>): SessionUser {
    return {
        member_id: u.member_id!,
        username: u.username!,
        name: u.name ?? null,
        mcname: u.mcname ?? null,
        level: u.level ?? null,
        role: u.role ?? null,
    };
}

/**
 * Versucht eine RagCord-Session aus der Launcher-Config zu erzeugen.
 * Liefert null wenn:
 *  - der Launcher nicht installiert / nicht eingeloggt ist
 *  - der Token gegen /api/verify nicht (mehr) gültig ist
 * Founder-Offline-Sessions werden ohne Server-Roundtrip übernommen.
 */
export async function tryPickupLauncherSession(): Promise<Session | null> {
    const launcher = readLauncherSession();
    if (!launcher) return null;

    // Founder-Offline-Session: kein Token → einfach übernehmen.
    if (launcher.founder && launcher.user) {
        return {
            token: "",
            expires_at: "",
            user: toRagCordUser(launcher.user),
            founder: true,
            source: "launcher",
        };
    }

    // Standard-Login: gegen die API verifizieren, damit wir nicht mit
    // einem revoked/abgelaufenen Token weitermachen.
    if (!launcher.token) return null;
    try {
        const result = await callVerify(launcher.token);
        if (!result.ok) return null;
        // Server hat eine frische User-Repräsentation geliefert — die ist
        // autoritativer als das, was der Launcher gecached hat.
        const serverUser = result.user ? toRagCordUser(result.user as any) : toRagCordUser(launcher.user!);
        return {
            token: launcher.token,
            // Launcher schreibt `expiresAt` (camelCase), unsere Session
            // hält `expires_at` (snake_case wie die API). Beide tolerieren.
            expires_at: launcher.expiresAt || "",
            user: serverUser,
            source: "launcher",
        };
    } catch {
        // Netzfehler → wir behaupten lieber „keine pickup-bare Session"
        // und lassen das normale Login-Fenster aufgehen, damit der User
        // einen klaren Schritt vor sich hat statt schweigender Stille.
        return null;
    }
}
