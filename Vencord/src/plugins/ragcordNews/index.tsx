/*
 * RagCord Extend, a Vencord fork for the RagnaMod community
 * Copyright (c) 2025 Mausi / RagnaMod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { showNotification } from "@api/Notifications";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

import type { RagCordNewsItem } from "../../VencordNative";
import { openNewsModal } from "./NewsModal";

// 10 minutes between polls. The forum_news table is hand-edited, so a
// faster cadence would burn requests for no signal.
const POLL_INTERVAL_MS = 10 * 60 * 1000;
// First poll runs shortly after start so a fresh login surfaces any
// queued-up news without waiting a full interval.
const FIRST_POLL_DELAY_MS = 30 * 1000;
// Hard cap on the body snippet inside the toast. Full text is shown when
// the user opens the modal.
const TOAST_BODY_MAX = 180;

const STORE_HIGHEST_SEEN_KEY = "ragcord-news-highest-seen-id";
const STORE_READ_IDS_KEY = "ragcord-news-read-ids";

// Module-scope state, lives for the duration of the plugin's run.
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let firstPollTimer: ReturnType<typeof setTimeout> | null = null;
let latestNews: RagCordNewsItem[] = [];

export async function getCachedNews(): Promise<RagCordNewsItem[]> {
    if (latestNews.length) return latestNews;
    // Cold open from the modal — do one fetch on demand so the user
    // doesn't see an empty list while waiting for the next poll.
    const fresh = await VencordNative.ragcord.fetchNews();
    if (fresh) {
        latestNews = fresh;
    }
    return latestNews;
}

export async function getReadIds(): Promise<Set<number>> {
    const raw = await DataStore.get<number[]>(STORE_READ_IDS_KEY);
    return new Set(raw ?? []);
}

export async function markRead(id: number): Promise<void> {
    const set = await getReadIds();
    if (set.has(id)) return;
    set.add(id);
    await DataStore.set(STORE_READ_IDS_KEY, Array.from(set));
}

export async function markAllRead(): Promise<void> {
    const ids = latestNews.map(n => n.id);
    await DataStore.set(STORE_READ_IDS_KEY, ids);
}

function truncate(s: string, max: number): string {
    if (s.length <= max) return s;
    return s.slice(0, max - 1).trimEnd() + "…";
}

async function poll(): Promise<void> {
    const news = await VencordNative.ragcord.fetchNews();
    if (!news) return; // no session / network error — skip
    latestNews = news;

    const highestSeen = (await DataStore.get<number>(STORE_HIGHEST_SEEN_KEY)) ?? 0;
    const newOnes = news.filter(n => n.id > highestSeen);

    // First poll after a fresh install: pretend everything is already
    // seen so the user isn't blasted with a backlog of every old news
    // post on day one.
    if (highestSeen === 0) {
        const max = news.reduce((m, n) => Math.max(m, n.id), 0);
        await DataStore.set(STORE_HIGHEST_SEEN_KEY, max);
        return;
    }

    if (newOnes.length === 0) return;

    // Sort by id ascending so toasts come out in posting order, even when
    // the API returns pinned-first.
    newOnes.sort((a, b) => a.id - b.id);

    for (const item of newOnes) {
        const title = item.pinned ? `📌 ${item.title}` : item.title;
        showNotification({
            title: `RagnaMod News: ${title}`,
            body: truncate(item.body, TOAST_BODY_MAX),
            onClick: openNewsModal,
        });
    }

    const newMax = newOnes[newOnes.length - 1].id;
    await DataStore.set(STORE_HIGHEST_SEEN_KEY, newMax);
}

export default definePlugin({
    name: "RagCordNews",
    description:
        "Holt regelmäßig die RagnaMod-Forum-News und benachrichtigt bei neuen Einträgen. Öffnet eine Übersicht via Settings → Quick Actions.",
    authors: [Devs.Mausi],
    // Kerngrund warum die Mod existiert — Forum-News by default an.
    enabledByDefault: true,

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
        latestNews = [];
    },
});

export { openNewsModal };
