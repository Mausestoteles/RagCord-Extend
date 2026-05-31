/*
 * RagCord Extend, a Vencord fork for the RagnaMod community
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * RagCordRemote — Renderer-Seite. Pollt den (Main-seitigen) Control-Endpoint
 * nach Aufträgen von RagnaAI, löst den Ziel-Nutzer auf (Freunde / bekannte
 * Nutzer), öffnet den DM-Kanal und sendet die Nachricht über Discords interne
 * Module. Sendet ausschließlich über den eigenen, eingeloggten Account.
 */
import definePlugin, { type PluginNative } from "@utils/types";
import { ChannelActionCreators, MessageActions, RelationshipStore, UserStore } from "@webpack/common";

// Native-Bridge (Main-Prozess) — gleiche Konvention wie andere Vencord-Plugins.
const Native = VencordNative.pluginHelpers.RagCordRemote as PluginNative<typeof import("./native")>;

interface Command {
    id: string;
    user: string;
    text: string;
}

let timer: ReturnType<typeof setInterval> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function nameVariants(u: any): string[] {
    return [u?.username, u?.globalName, u?.global_name, u?.nick].filter(Boolean).map((n: string) => n.toLowerCase());
}

function resolveUserId(query: string): string | null {
    const q = query.trim().toLowerCase();
    if (!q) return null;

    const candidates: string[] = [];
    // 1) Freunde zuerst (am ehesten gemeint + DM erlaubt).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const friendIds: string[] = (RelationshipStore as any).getFriendIDs?.() ?? [];
    candidates.push(...friendIds);
    // 2) Alle gecachten Nutzer.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all = (UserStore as any).getUsers?.() ?? {};
    candidates.push(...Object.keys(all));

    // exakter Treffer hat Vorrang, sonst enthält.
    let contains: string | null = null;
    for (const id of candidates) {
        const u = UserStore.getUser(id);
        if (!u) continue;
        const names = nameVariants(u);
        if (names.includes(q)) return id;
        if (!contains && names.some(n => n.includes(q))) contains = id;
    }
    return contains;
}

async function sendDM(user: string, text: string): Promise<string> {
    const userId = resolveUserId(user);
    if (!userId) {
        throw new Error(`Nutzer "${user}" nicht gefunden (nur Freunde/bekannte Nutzer adressierbar).`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channelId: string = await (ChannelActionCreators as any).openPrivateChannel(userId);
    if (!channelId) throw new Error("DM-Kanal konnte nicht geöffnet werden.");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (MessageActions as any).sendMessage(channelId, {
        content: text,
        tts: false,
        invalidEmojis: [],
        validNonShortcutEmojis: []
    });
    const u = UserStore.getUser(userId);
    return nameVariants(u)[0] ? (u as any).globalName || (u as any).username || user : user;
}

async function tick(): Promise<void> {
    let cmd: Command | null;
    try {
        cmd = await Native.poll();
    } catch {
        return;
    }
    if (!cmd) return;
    try {
        const to = await sendDM(cmd.user, cmd.text);
        await Native.report(cmd.id, true, undefined, to);
    } catch (err) {
        await Native.report(cmd.id, false, err instanceof Error ? err.message : String(err));
    }
}

export default definePlugin({
    name: "RagCordRemote",
    description: "Erlaubt RagnaAI, über einen lokalen, token-geschützten Endpoint Discord-DMs zu senden (eigener Account).",
    authors: [{ name: "RagnaMod", id: 0n }],

    async start() {
        try {
            await Native.ensureServer();
        } catch {
            /* Server-Start fehlgeschlagen → Plugin bleibt passiv */
        }
        timer = setInterval(() => void tick(), 700);
    },

    stop() {
        if (timer) clearInterval(timer);
        timer = null;
    }
});
