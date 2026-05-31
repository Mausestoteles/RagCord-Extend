/*
 * RagCord Extend, a Vencord fork for the RagnaMod community
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * RagCordRemote — Main-Seite. Ein winziger localhost-Control-Endpoint, über den
 * der RagnaAI-Orchestrator Discord-Aktionen anstößt (aktuell: DM senden). Das
 * eigentliche Senden passiert im Renderer (Discord-Module) — dieser Teil nimmt
 * den Auftrag entgegen, legt ihn in eine Queue und wartet, bis der Renderer das
 * Ergebnis meldet.
 *
 * Sicherheit: nur 127.0.0.1, Pflicht-Header X-Rag-Token, Discovery-Datei
 * (Port + Token) im RagCord-Datenordner. Ohne RagnaAI lauscht der Server nur
 * auf loopback und ist harmlos.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";
import { randomBytes } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

import { app, type IpcMainInvokeEvent } from "electron";

const DISCOVERY_FILENAME = "ragnaai-control.json";
const MAX_BODY_BYTES = 64 * 1024;
const RESULT_TIMEOUT_MS = 20000;

interface Command {
    id: string;
    user: string;
    text: string;
}
interface Result {
    ok: boolean;
    error?: string;
    to?: string;
}

let server: Server | null = null;
let token = "";
const queue: Command[] = [];
const pending = new Map<string, (r: Result) => void>();

function dataDir(): string {
    // RagCord setzt DATA_DIR (patcher.ts); Fallback wie in auth.ts.
    return process.env.DATA_DIR ?? join(app.getPath("userData"), "..", "RagCord");
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(payload);
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => {
            size += c.length;
            if (size > MAX_BODY_BYTES) {
                reject(new Error("Body zu groß"));
                req.destroy();
                return;
            }
            chunks.push(c);
        });
        req.on("end", () => {
            if (!chunks.length) return resolve({});
            try {
                const parsed = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
                resolve(parsed && typeof parsed === "object" ? parsed : {});
            } catch {
                reject(new Error("Ungültiges JSON"));
            }
        });
        req.on("error", reject);
    });
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if ((req.headers["x-rag-token"] || "") !== token) {
        return sendJson(res, 401, { ok: false, error: "Unauthorized" });
    }
    const url = (req.url || "").split("?")[0];

    if (req.method === "GET" && url === "/health") {
        return sendJson(res, 200, { ok: true, app: "ragcord" });
    }

    if (req.method === "POST" && url === "/send-message") {
        let body: Record<string, unknown>;
        try {
            body = await readBody(req);
        } catch (err) {
            return sendJson(res, 400, { ok: false, error: err instanceof Error ? err.message : "Bad Request" });
        }
        const user = String(body.user || "").trim();
        const text = String(body.text || "").trim();
        if (!user || !text) return sendJson(res, 400, { ok: false, error: "user und text erforderlich" });

        const id = randomBytes(8).toString("hex");
        queue.push({ id, user, text });
        const result = await new Promise<Result>(resolve => {
            pending.set(id, resolve);
            setTimeout(() => {
                if (pending.delete(id)) {
                    resolve({ ok: false, error: "Renderer hat nicht geantwortet — ist das RagCordRemote-Plugin aktiv?" });
                }
            }, RESULT_TIMEOUT_MS);
        });
        return sendJson(res, 200, result);
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
}

function startServer(): void {
    if (server) return;
    token = randomBytes(24).toString("hex");
    server = createServer((req, res) => {
        void handle(req, res).catch(() => {
            try { sendJson(res, 500, { ok: false, error: "intern" }); } catch { /* ignore */ }
        });
    });
    server.on("error", () => { /* Port belegt o.ä. — nicht fatal */ });
    server.listen(0, "127.0.0.1", () => {
        const addr = server!.address();
        if (addr && typeof addr === "object") {
            try {
                const dir = dataDir();
                mkdirSync(dir, { recursive: true });
                // Token NICHT loggen.
                writeFileSync(join(dir, DISCOVERY_FILENAME), JSON.stringify({ app: "ragcord", port: addr.port, token }), "utf-8");
            } catch { /* ignore */ }
        }
    });
}

// ── Native-Funktionen (vom Renderer via Native-Proxy aufgerufen) ──
export function ensureServer(_: IpcMainInvokeEvent): boolean {
    startServer();
    return true;
}

export function poll(_: IpcMainInvokeEvent): Command | null {
    return queue.shift() ?? null;
}

export function report(_: IpcMainInvokeEvent, id: string, ok: boolean, error?: string, to?: string): boolean {
    const resolve = pending.get(id);
    if (resolve) {
        pending.delete(id);
        resolve({ ok, error, to });
    }
    return true;
}
