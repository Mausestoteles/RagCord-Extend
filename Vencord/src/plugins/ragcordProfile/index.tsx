/*
 * RagCord Extend, a Vencord fork for the RagnaMod community
 * Copyright (c) 2025 Mausi / RagnaMod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addProfileBadge, BadgePosition, BadgeUserArgs, ProfileBadge, removeProfileBadge } from "@api/Badges";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { UserStore } from "@webpack/common";

import type { RagCordSessionUser } from "../../VencordNative";

// mc-heads.net accepts a Minecraft username or UUID and returns a PNG of
// the player's head at the requested size. The /16 variant is just enough
// pixels for a profile badge.
const HEAD_URL = (name: string) =>
    `https://mc-heads.net/avatar/${encodeURIComponent(name)}/16.png`;

let registeredBadge: ProfileBadge | null = null;
let currentUserId: string | null = null;

async function fetchSession(): Promise<RagCordSessionUser | null> {
    try {
        return await VencordNative.ragcord.getSession();
    } catch {
        return null;
    }
}

export default definePlugin({
    name: "RagCordProfile",
    description:
        "Shows your RagnaMod Minecraft account as a small badge on your own Discord profile.",
    authors: [Devs.Mausi],
    // MC-Head-Badge im eigenen Profil — by default an, weil's das Brand-
    // Element der Mod ist. Wer's nicht will, schaltet's in den Settings ab.
    enabledByDefault: true,

    async start() {
        const session = await fetchSession();
        const mcname = session?.mcname?.trim();
        if (!mcname) return;

        // Cache the Discord user id at start time. UserStore is already
        // populated when plugins start (WebpackReady phase), and the id
        // doesn't change without a full restart of Discord — which would
        // re-run start() anyway.
        currentUserId = UserStore.getCurrentUser()?.id ?? null;
        if (!currentUserId) return;

        registeredBadge = {
            id: "ragcord-mcname",
            description: `Minecraft: ${mcname}`,
            iconSrc: HEAD_URL(mcname),
            position: BadgePosition.END,
            shouldShow: ({ userId }: BadgeUserArgs) => userId === currentUserId,
            props: {
                style: {
                    borderRadius: 2,
                    // Slight outline so the head reads on light + dark themes.
                    boxShadow: "0 0 0 1px rgba(0,0,0,0.35)",
                },
            },
        };
        addProfileBadge(registeredBadge);
    },

    stop() {
        if (registeredBadge) {
            removeProfileBadge(registeredBadge);
            registeredBadge = null;
        }
        currentUserId = null;
    },
});
