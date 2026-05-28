/*
 * RagCord Extend, a Vencord fork for the RagnaMod community
 * Copyright (c) 2025 Mausi / RagnaMod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
    callLogin,
    callVerify,
    clearSession,
    loadSession,
    saveSession,
} from "./auth";
import { buildFounderSessionFromFile, FounderKeyError, readFounderKeyContent } from "./founderKey";
import { registerRagCordIpcHandlers, setPendingFounderKey } from "./ipc";
import { tryPickupLauncherSession } from "./launcherPickup";
import { LOGIN_PAGE_HTML } from "./loginPageHtml";
import { startTokenRefreshLoop } from "./tokenRefresh";

// Preload-Script für das Login-Fenster. Electron 32+ blockt `require("electron")`
// in `data:`-URL-Renderern auch wenn `nodeIntegration: true` gesetzt ist —
// dann steht im Login-Fenster nur noch "IPC-Brücke nicht verfügbar".
//
// Lösung: ein Mikro-Preload, das nur ein paar IPC-Wrapper via contextBridge
// in `window.ragcord` exposed. Der Preload muss als echte Datei auf der
// Platte liegen (Electron lädt sie per Pfad), also schreiben wir ihn beim
// Window-Öffnen in einen temp-Ordner und räumen ihn beim Close wieder weg.
const LOGIN_PRELOAD_JS = `
"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("ragcord", {
    login: (username, password) =>
        ipcRenderer.invoke("ragcord:login", username, password),
    loginFounder: () =>
        ipcRenderer.invoke("ragcord:loginFounder"),
});
`.trim();

// Register the renderer-facing IPC surface once at module load. Safe to
// call again from runLoginGate() — Electron deduplicates handlers via the
// channel name.
registerRagCordIpcHandlers();

const LOGIN_IPC_CHANNEL = "ragcord:login";

let gatePromise: Promise<void> | null = null;

/**
 * Block the rest of the boot until the user has a valid RagnaMod session.
 *
 *  - If a stored session token verifies cleanly against /api/verify, we
 *    return immediately.
 *  - Otherwise we open a small modal-style BrowserWindow with the login
 *    form. Successful login persists the session and closes the window.
 *  - If the user closes the login window without completing it, we
 *    `app.quit()` so Discord does not start at all.
 *
 * The promise is memoised — calling `runLoginGate()` twice returns the
 * same in-flight promise.
 */
export function runLoginGate(): Promise<void> {
    if (!gatePromise) {
        gatePromise = (async () => {
            // 1) Eigene RagCord-Session vorhanden?
            const existing = await loadSession();
            if (existing) {
                // Founder-Offline-Session: kein Server-Roundtrip nötig, der
                // signierte Key ist die Authority. Direkt durchwinken.
                if (existing.founder) {
                    console.log("[RagCord] Founder-Session aktiv, fast-path");
                    startTokenRefreshLoop();
                    return;
                }
                if (existing.token) {
                    try {
                        const result = await callVerify(existing.token);
                        if (result.ok) {
                            startTokenRefreshLoop();
                            return;
                        }
                    } catch {
                        // Netzfehler → unten ins Login-Fenster fallen,
                        // damit der User den Status sieht.
                    }
                    await clearSession();
                }
            }

            // 2) Kein gespeicherter Login? Versuche eine Übernahme aus dem
            // RagnaMod-Launcher (falls installiert + eingeloggt).
            const fromLauncher = await tryPickupLauncherSession();
            if (fromLauncher) {
                await saveSession(fromLauncher);
                console.log(
                    "[RagCord] RagnaMod-Launcher-Session uebernommen "
                    + `(member_id=${fromLauncher.user.member_id}, `
                    + `founder=${!!fromLauncher.founder})`,
                );
                startTokenRefreshLoop();
                return;
            }

            // 3) Letzter Schritt: Login-Fenster zeigen.
            await showLoginWindow();
            startTokenRefreshLoop();
        })();
    }
    return gatePromise;
}

function showLoginWindow(): Promise<void> {
    return new Promise<void>((resolve) => {
        // Preload als echte Datei vorbereiten. Pfad muss absolut sein.
        const preloadDir = join(tmpdir(), `ragcord-login-${Date.now()}-${process.pid}`);
        const preloadPath = join(preloadDir, "preload.js");
        try {
            mkdirSync(preloadDir, { recursive: true });
            writeFileSync(preloadPath, LOGIN_PRELOAD_JS, "utf-8");
        } catch (e) {
            console.error("[RagCord] Konnte Login-Preload nicht schreiben:", e);
        }

        const win = new BrowserWindow({
            width: 520,
            height: 640,
            resizable: false,
            maximizable: false,
            minimizable: false,
            fullscreenable: false,
            autoHideMenuBar: true,
            // frame:false because the HTML brings its own titlebar with the
            // brand-coloured close button. -webkit-app-region: drag on the
            // bar makes the window movable.
            frame: false,
            title: "RagCord Extend",
            backgroundColor: "#0a0a0a",
            webPreferences: {
                // Saubere Trennung: contextIsolation:true, kein nodeIntegration
                // im Renderer. Der einzige Node-Zugang ist das preload-Skript,
                // das via contextBridge eine minimale `window.ragcord`-Surface
                // exposed (nur die Login-Methode, nichts weiter). Funktioniert
                // mit data:-URL und ist resistant gegen kommende Electron-
                // Härtungen.
                sandbox: false,
                nodeIntegration: false,
                contextIsolation: true,
                preload: preloadPath,
                backgroundThrottling: false,
            },
            show: false,
        });

        // Cleanup für den preload-tmpdir, wenn das Fenster zu ist.
        const cleanupPreload = () => {
            try { rmSync(preloadDir, { recursive: true, force: true }); }
            catch { /* OS räumt /tmp ohnehin auf */ }
        };

        let loginCompleted = false;

        const handler = async (
            _event: Electron.IpcMainInvokeEvent,
            username: unknown,
            password: unknown,
        ) => {
            if (typeof username !== "string" || typeof password !== "string") {
                return { ok: false, error: "Ungültige Eingabe." };
            }
            try {
                const result = await callLogin(username, password);
                if (result.ok && result.token && result.expires_at && result.user) {
                    await saveSession({
                        token: result.token,
                        expires_at: result.expires_at,
                        user: result.user,
                        source: "ragcord",
                    });
                    loginCompleted = true;
                    // Give the UI a moment to render the success line before
                    // we kill the window.
                    setTimeout(() => {
                        if (!win.isDestroyed()) win.close();
                    }, 350);
                    return { ok: true, user: result.user };
                }
                return {
                    ok: false,
                    error: result.error || "Anmeldung fehlgeschlagen.",
                    code: result.code,
                };
            } catch {
                return { ok: false, error: "Auth-Server nicht erreichbar." };
            }
        };

        // Gründungs-Autoritäts-Login: User klickt im Login-Fenster auf
        // „Gründungsautorität verwenden" → wir öffnen den Datei-Dialog →
        // verifizieren die Signatur lokal → speichern eine token-lose
        // Founder-Session.
        const founderHandler = async () => {
            const dlg = await dialog.showOpenDialog(win, {
                title: "Gründungs-Authority-Key auswählen",
                properties: ["openFile"],
                filters: [
                    { name: "Authority-Key (.txt)", extensions: ["txt"] },
                    { name: "Alle Dateien", extensions: ["*"] },
                ],
            });
            if (dlg.canceled || !dlg.filePaths.length) {
                return { ok: false, cancelled: true };
            }
            try {
                const session = buildFounderSessionFromFile(dlg.filePaths[0]);
                await saveSession(session);
                // Rohen Key-Inhalt im Speicher behalten, damit das
                // AutoVerify-Plugin gleich nach Discord-Boot einen
                // /api/discord/link-founder-Call machen kann. NIEMALS auf
                // Disk persistieren.
                setPendingFounderKey(readFounderKeyContent(dlg.filePaths[0]));
                loginCompleted = true;
                setTimeout(() => { if (!win.isDestroyed()) win.close(); }, 350);
                return {
                    ok: true,
                    user: {
                        member_id: session.user.member_id,
                        username: session.user.username,
                        name: session.user.name,
                        mcname: session.user.mcname,
                        level: session.user.level,
                    },
                };
            } catch (e) {
                const msg = e instanceof FounderKeyError ? e.message
                    : "Key konnte nicht verifiziert werden.";
                return { ok: false, error: msg };
            }
        };

        ipcMain.handle(LOGIN_IPC_CHANNEL, handler);
        ipcMain.handle("ragcord:loginFounder", founderHandler);

        win.once("ready-to-show", () => {
            win.show();
            win.focus();
        });

        win.on("closed", () => {
            ipcMain.removeHandler(LOGIN_IPC_CHANNEL);
            ipcMain.removeHandler("ragcord:loginFounder");
            cleanupPreload();
            if (loginCompleted) {
                resolve();
                return;
            }

            // User closed the window without logging in. We MUST NOT resolve
            // the gate promise — every Discord init step gated on
            // `app.whenReady().then(runLoginGate)` would otherwise fire on
            // the next tick and create the main window before `app.quit()`
            // has fully unwound. Hard-exit instead: synchronous, no main
            // window ever shown, no half-initialised Discord state on disk.
            //
            // We deliberately do NOT throw here — Electron's uncaught-
            // exception handler turns a throw at this stage into a modal
            // "A JavaScript error occurred in the main process" dialog,
            // which is exactly the failure mode we are trying to avoid.
            app.exit(0);
        });

        const dataUrl =
            "data:text/html;charset=utf-8;base64," +
            Buffer.from(LOGIN_PAGE_HTML, "utf-8").toString("base64");
        win.loadURL(dataUrl);
    });
}
