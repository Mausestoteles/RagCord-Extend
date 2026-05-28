/*
 * RagCord Extend, a Vencord fork for the RagnaMod community
 * Copyright (c) 2025 Mausi / RagnaMod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Founder-Key-Verifikation, 1:1 portiert aus
// ragnamod-src/src/main/founder-key.js. Wenn dort jemals der Public Key
// rotiert wird, hier nachziehen.
//
// Format einer Key-Datei (siehe Website/member/founder/download.php):
//   -----BEGIN RAGNAROK FOUNDER KEY-----
//   <payloadBase64>.<signatureBase64>
//   -----END RAGNAROK FOUNDER KEY-----
//
// `payloadBase64` decoded ergibt JSON mit:
//   { v, type: "founder", account_id, member_id, username, name,
//     mcname, level: 5, issued_at }

import { createPublicKey, verify as cryptoVerify } from "crypto";
import { readFileSync } from "fs";

import { Session } from "./auth";

const FOUNDER_PUBLIC_KEY_B64 = "d5UmjKMSMH19P0HDt7f74lWgE3v83C9pi0tXnWOypUk=";
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

const KEY_BLOCK_RE =
    /-----BEGIN RAGNAROK FOUNDER KEY-----([\s\S]*?)-----END RAGNAROK FOUNDER KEY-----/;

export class FounderKeyError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "FounderKeyError";
    }
}

interface FounderPayload {
    v: number;
    type: string;
    account_id: number;
    member_id: number;
    username: string;
    name?: string | null;
    mcname?: string | null;
    level: number;
    issued_at: number;
}

function publicKeyObject() {
    const raw = Buffer.from(FOUNDER_PUBLIC_KEY_B64, "base64");
    const der = Buffer.concat([ED25519_SPKI_PREFIX, raw]);
    return createPublicKey({ key: der, format: "der", type: "spki" });
}

function parseToken(content: string): [string, string] {
    let body = String(content || "");
    const m = body.match(KEY_BLOCK_RE);
    if (m) body = m[1];
    const token = body.replace(/\s+/g, "");
    const parts = token.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new FounderKeyError("Ungültiges Key-Format.");
    }
    return [parts[0], parts[1]];
}

export function verifyFounderKeyContent(content: string): FounderPayload {
    const [payloadB64, sigB64] = parseToken(content);

    const valid = cryptoVerify(
        null,
        Buffer.from(payloadB64, "utf8"),
        publicKeyObject(),
        Buffer.from(sigB64, "base64"),
    );
    if (!valid) {
        throw new FounderKeyError("Signatur ungültig — dieser Key wird nicht akzeptiert.");
    }

    let payload: FounderPayload;
    try {
        payload = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf8")) as FounderPayload;
    } catch {
        throw new FounderKeyError("Key-Inhalt nicht lesbar.");
    }

    if (payload.type !== "founder" || Number(payload.level) !== 5) {
        throw new FounderKeyError("Dieser Key besitzt keine gültige Gründungsautorität.");
    }
    if (!payload.member_id || !payload.username) {
        throw new FounderKeyError("Key enthält keine gültige Member-Identität.");
    }
    return payload;
}

/**
 * Liest die Datei, verifiziert sie und baut eine token-lose
 * Founder-Session. Die zurückgegebene Session ist 1:1 das, was
 * `saveSession()` erwartet.
 */
export function buildFounderSessionFromFile(filePath: string): Session {
    const content = readFileSync(filePath, "utf8");
    const payload = verifyFounderKeyContent(content);
    return {
        token: "",
        expires_at: "",
        user: {
            member_id: payload.member_id,
            username: payload.username,
            name: payload.name ?? null,
            mcname: payload.mcname ?? null,
            level: String(payload.level),
            role: null,
        },
        founder: true,
        source: "founder",
    };
}

/**
 * Wir brauchen den Key-Inhalt auch noch RAW, um ihn an
 * `/api/discord/link-founder` weiterzureichen — sonst kann der Bot die
 * Founder-Verifikation nicht nachvollziehen.
 */
export function readFounderKeyContent(filePath: string): string {
    return readFileSync(filePath, "utf8");
}
