/*
 * RagCord Extend, a Vencord fork for the RagnaMod community
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { DataStore } from "@api/index";
import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { findComponentByCodeLazy } from "@webpack";
import { Popout, useEffect, useRef, useState } from "@webpack/common";
import type { PropsWithChildren } from "react";

import type { RagCordNotification } from "../../VencordNative";

// ──────────────────────────────────────────────
// Konstanten
// ──────────────────────────────────────────────
// Punycode-Basis (= ragnarök.eu) plus der /neu-Pfad zum aktuellen Forum-
// Mount. Wenn das Forum mal woanders sitzt, hier eine Zeile anpassen.
const SITE_HOST = "https://www.xn--ragnark-f1a.eu";
const FORUM_PATH = "/neu/forum";
const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 min
const FIRST_POLL_DELAY_MS = 15 * 1000;
const TOAST_BODY_MAX = 220;
const FIRST_RUN_MAX_TOASTS = 3;
const STORE_LAST_TOASTED_KEY = "ragcord-forum-last-toasted-id-v3";

// Discord-Header-Bar-Icon Komponente (gleicher Find wie VencordToolbox).
const HeaderBarIcon = findComponentByCodeLazy(".HEADER_BAR_BADGE_BOTTOM,", 'position:"bottom"');

// ──────────────────────────────────────────────
// Globaler Polling-State (1x pro Plugin-Lebenszeit)
// ──────────────────────────────────────────────
// Header-Button + Popover-Liste teilen sich dieselbe Datenquelle — wir
// pollen einmal, dispatchen an alle Listener. Damit fällt das doppelte
// Polling weg, das wir mit zwei separaten Plugins gehabt hätten.

interface InboxState {
    items: RagCordNotification[];
    unreadCount: number;
    lastFetchAt: number | null;
}

let currentState: InboxState = { items: [], unreadCount: 0, lastFetchAt: null };
const stateListeners = new Set<(s: InboxState) => void>();

function setState(next: InboxState) {
    currentState = next;
    stateListeners.forEach(l => { try { l(next); } catch (_) { /* one listener crashing must not block others */ } });
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
let firstPollTimer: ReturnType<typeof setTimeout> | null = null;

function deepLink(n: RagCordNotification): string {
    if (n.topic_id) {
        return SITE_HOST + FORUM_PATH + "/topic.php?id=" + n.topic_id
            + "&n=" + n.id
            + (n.comment_id ? "#comment-" + n.comment_id : "");
    }
    return SITE_HOST + FORUM_PATH + "/";
}

function forumIndexUrl(): string {
    return SITE_HOST + FORUM_PATH + "/";
}

function truncate(s: string | null | undefined, max: number): string {
    const v = s || "";
    if (v.length <= max) return v;
    return v.slice(0, max - 1).trimEnd() + "…";
}

async function poll(): Promise<void> {
    const data = await VencordNative.ragcord.fetchNotifications();
    if (!data) return; // No-Session / Netzfehler

    const items = data.items || [];
    setState({
        items,
        unreadCount: data.count ?? items.filter(n => !n.is_read).length,
        lastFetchAt: Date.now(),
    });

    // Toast-Logik (kann pro Setting deaktiviert werden).
    if (!settings.store.showToasts) return;

    const lastToasted = (await DataStore.get<number>(STORE_LAST_TOASTED_KEY)) ?? 0;
    const isFirstRun = lastToasted === 0;

    let fresh = items
        .filter(n => !n.is_read && n.id > lastToasted)
        .sort((a, b) => a.id - b.id);

    if (isFirstRun) {
        // Beim ersten Lauf nicht alle Altlasten auf einmal werfen — nur die
        // N neuesten ungelesen-Items, dann Marke nach oben schieben.
        fresh = fresh.slice(-FIRST_RUN_MAX_TOASTS);
    }

    if (fresh.length === 0) {
        // Marke trotzdem aktualisieren beim Erstlauf, sonst würden beim
        // nächsten Poll dieselben Items als "neu" gelten.
        if (isFirstRun && items.length > 0) {
            const max = items.reduce((m, n) => Math.max(m, n.id), 0);
            await DataStore.set(STORE_LAST_TOASTED_KEY, max);
        }
        return;
    }

    for (const n of fresh) {
        const title = n.from
            ? `Forum: ${n.from} hat geantwortet`
            : "Forum: neue Antwort";
        showNotification({
            title,
            body: truncate(n.text, TOAST_BODY_MAX),
            onClick: () => openForumLink(deepLink(n)),
        });
    }

    const newMax = fresh[fresh.length - 1].id;
    await DataStore.set(STORE_LAST_TOASTED_KEY, newMax);
}

function openForumLink(url: string): void {
    try {
        VencordNative.native.openExternal(url);
    } catch (_) {
        // Fallback: ein direktes window.open. Wird von Discord's internem
        // URL-Handler abgefangen und an den Default-Browser geroutet.
        try { window.open(url, "_blank"); }
        catch (__) { /* nichts zu tun */ }
    }
}

// ──────────────────────────────────────────────
// React-Hook: subscribt auf globalen State
// ──────────────────────────────────────────────
function useInboxState(): InboxState {
    const [s, setS] = useState(currentState);
    useEffect(() => {
        stateListeners.add(setS);
        return () => { stateListeners.delete(setS); };
    }, []);
    return s;
}

// ──────────────────────────────────────────────
// Popover-Inhalt: Liste der Benachrichtigungen
// ──────────────────────────────────────────────
function InboxPopover({ onClose }: { onClose: () => void; }) {
    const { items, unreadCount, lastFetchAt } = useInboxState();
    const sorted = [...items].sort((a, b) => {
        // Ungelesen zuerst, dann nach ID absteigend (neueste oben).
        if (a.is_read !== b.is_read) return a.is_read ? 1 : -1;
        return b.id - a.id;
    });

    function fmtTime(iso: string | null): string {
        if (!iso) return "";
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
        if (diffMin < 1) return "gerade eben";
        if (diffMin < 60) return `vor ${diffMin} min`;
        if (diffMin < 60 * 24) return `vor ${Math.floor(diffMin / 60)} h`;
        return d.toLocaleDateString("de-DE", { day: "numeric", month: "short" });
    }

    return (
        <div className="ragcord-inbox-popover">
            <div className="ragcord-inbox-header">
                <div className="ragcord-inbox-title">RagnaMod-Forum</div>
                <div className="ragcord-inbox-meta">
                    {unreadCount > 0
                        ? `${unreadCount} ungelesen`
                        : items.length > 0 ? "alles gelesen" : "leer"}
                </div>
            </div>

            <div className="ragcord-inbox-list">
                {items.length === 0 && (
                    <div className="ragcord-inbox-empty">
                        {lastFetchAt ? "Keine Benachrichtigungen." : "Lade …"}
                    </div>
                )}
                {sorted.map(n => (
                    <button
                        key={n.id}
                        className={"ragcord-inbox-item" + (n.is_read ? " is-read" : "")}
                        onClick={() => {
                            openForumLink(deepLink(n));
                            onClose();
                        }}
                    >
                        <div className="ragcord-inbox-item-text">
                            {n.text || "(kein Text)"}
                        </div>
                        <div className="ragcord-inbox-item-meta">
                            {n.from ? `${n.from} · ` : ""}{fmtTime(n.created_at)}
                        </div>
                    </button>
                ))}
            </div>

            <div className="ragcord-inbox-footer">
                <button
                    className="ragcord-inbox-footer-link"
                    onClick={() => {
                        openForumLink(forumIndexUrl());
                        onClose();
                    }}
                >
                    Forum öffnen ↗
                </button>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────
// Header-Bar-Icon (das R im roten Kreis + Badge)
// ──────────────────────────────────────────────
function InboxIcon() {
    return (
        <svg viewBox="0 0 24 24" width={20} height={20} className="ragcord-inbox-icon">
            <path fill="currentColor"
                d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1.5 14.5L6 12l1.41-1.41 3.09 3.09L16.59 7.5 18 8.91l-7.5 7.59z" />
        </svg>
    );
}

function InboxBadge({ count }: { count: number; }) {
    if (count <= 0) return null;
    return (
        <div className="ragcord-inbox-badge">
            {count > 99 ? "99+" : String(count)}
        </div>
    );
}

function InboxButton() {
    const { unreadCount } = useInboxState();
    const buttonRef = useRef(null);
    const [show, setShow] = useState(false);

    return (
        <div className="ragcord-inbox-wrap">
            <Popout
                position="bottom"
                align="right"
                animation={Popout.Animation.NONE}
                shouldShow={show}
                onRequestClose={() => setShow(false)}
                targetElementRef={buttonRef}
                renderPopout={() => <InboxPopover onClose={() => setShow(false)} />}
            >
                {(_, { isShown }) => (
                    <HeaderBarIcon
                        ref={buttonRef}
                        className="ragcord-inbox-btn"
                        onClick={() => {
                            // Bei Klick gleich nochmal pollen, falls der
                            // letzte Tick lange her ist — der User erwartet
                            // beim Inbox-Öffnen den aktuellen Stand.
                            if (currentState.lastFetchAt == null
                                || Date.now() - currentState.lastFetchAt > 30_000) {
                                void poll();
                            }
                            setShow(v => !v);
                        }}
                        tooltip={isShown
                            ? null
                            : unreadCount > 0
                                ? `RagnaMod-Forum · ${unreadCount} ungelesen`
                                : "RagnaMod-Forum"}
                        icon={() => <InboxIcon />}
                        selected={isShown || unreadCount > 0}
                    />
                )}
            </Popout>
            <InboxBadge count={unreadCount} />
        </div>
    );
}

// ──────────────────────────────────────────────
// Plugin-Definition
// ──────────────────────────────────────────────
const settings = definePluginSettings({
    showToasts: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Zusätzlich einen Toast unten rechts bei neuen Antworten zeigen.",
    },
});

export default definePlugin({
    name: "RagCordForumInbox",
    description:
        "Forum-Postfach als rotes Icon mit Zähler im Discord-Header. Klick öffnet die Liste; Eintrag-Klick öffnet das Topic im Browser.",
    authors: [Devs.Mausi],
    enabledByDefault: true,
    settings,

    // Gleicher Header-Bar-Patch wie VencordToolbox (siehe
    // src/plugins/vencordToolbox/index.tsx:88) — fügt das Icon im
    // "trailing"-Bereich rechts oben ein.
    patches: [
        {
            find: '?"BACK_FORWARD_NAVIGATION":',
            replacement: {
                match: /(trailing:.{0,50}?)\i\.Fragment,(?=\{children:\[)/,
                replace: "$1$self.TrailingWrapper,",
            },
        },
    ],

    TrailingWrapper({ children }: PropsWithChildren) {
        return (
            <>
                {children}
                <ErrorBoundary key="ragcord-inbox" noop>
                    <InboxButton />
                </ErrorBoundary>
            </>
        );
    },

    start() {
        firstPollTimer = setTimeout(() => {
            void poll();
            pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);
        }, FIRST_POLL_DELAY_MS);
    },

    stop() {
        if (pollTimer) clearInterval(pollTimer);
        if (firstPollTimer) clearTimeout(firstPollTimer);
        pollTimer = null;
        firstPollTimer = null;
        stateListeners.clear();
    },
});
