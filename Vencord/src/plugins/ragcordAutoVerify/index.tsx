/*
 * RagCord Extend, a Vencord fork for the RagnaMod community
 * Copyright (c) 2025 Mausi / RagnaMod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { UserStore } from "@webpack/common";

// Nach dem ersten erfolgreichen Login schicken wir die Discord-User-ID an
// die Auth-API. Backend speichert sie in `discord_links`; der RagnaMod-
// Discord-Bot liest das beim nächsten Member-Sync und vergibt die
// Verified-Rolle + setzt den Nickname auf den MC-Namen.
//
// Lokal merken wir uns, dass das schon erledigt ist, damit wir bei jedem
// Discord-Start nicht erneut die API mit dem gleichen Mapping bombardieren.
// Wenn der User Discord-Account wechselt, ändert sich die ID → wir
// erkennen das (Vergleich gegen den gespeicherten Wert) und linken neu.

const STORE_LAST_LINKED_KEY = "ragcord-auto-verify-last-linked";

interface LastLinkedRecord {
    member_id: number;
    discord_id: string;
    linked_at: number;
}

async function maybeLink(): Promise<void> {
    const session = await VencordNative.ragcord.getSession();
    if (!session?.member_id) return; // kein Login → nichts zu tun

    const currentUser = UserStore.getCurrentUser();
    if (!currentUser?.id) return; // Webpack noch nicht ready

    const last = await DataStore.get<LastLinkedRecord>(STORE_LAST_LINKED_KEY);
    if (last
        && last.member_id === session.member_id
        && last.discord_id === currentUser.id) {
        // Bereits verknüpft — kein API-Call, nichts zu tun.
        return;
    }

    // Discord-Anzeigenamen mitschicken. `globalName` (neuer Display-Name)
    // bevorzugen, sonst `username`. Diskriminator (#1234) ist in den
    // meisten Accounts inzwischen auf `0` reduziert und nicht hilfreich
    // fürs Adminpanel.
    const displayName = (currentUser as any).globalName
                     || currentUser.username
                     || null;

    const result = await VencordNative.ragcord.linkDiscord(currentUser.id, displayName);
    if (result.ok) {
        await DataStore.set(STORE_LAST_LINKED_KEY, {
            member_id: session.member_id,
            discord_id: currentUser.id,
            linked_at: Date.now(),
        });
        console.log("[RagCordAutoVerify] Discord-Verknüpfung gesetzt",
            { member_id: session.member_id, discord_id: currentUser.id });
    } else {
        console.warn("[RagCordAutoVerify] Verknüpfung fehlgeschlagen:", result.error);
    }
}

export default definePlugin({
    name: "RagCordAutoVerify",
    description:
        "Sendet die Discord-User-ID nach dem RagnaMod-Login an die Auth-API. Der RagnaMod-Bot vergibt damit automatisch die Verified-Rolle und setzt den Nickname auf den MC-Namen.",
    authors: [Devs.Mausi],
    required: true, // gehört zur Kern-Auto-Verify-Mechanik, keine Opt-out

    async start() {
        // Erster Versuch nach kurzem Delay — UserStore ist sicher gefüllt,
        // sobald die Renderer-React-Tree warm ist (Vencord-Plugins starten
        // ja bereits in der WebpackReady-Phase, aber UserStore-Data kommt
        // erst ein paar ms später vom Login-Flow).
        setTimeout(() => { void maybeLink(); }, 4000);

        // Späterer Re-Sync (z.B. wenn der User Discord-Account während
        // der Session wechselt — selten, aber möglich via "Switch Accounts"
        // in Discord-Settings). Einmal pro Stunde reicht völlig.
        setInterval(() => { void maybeLink(); }, 60 * 60 * 1000);
    },
});
