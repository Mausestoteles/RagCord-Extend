/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { fetchBuffer, fetchJson } from "@main/utils/http";
import { writeFileAtomic } from "@main/utils/safeWriteFile";
import { IpcEvents } from "@shared/IpcEvents";
import { RAGCORD_USER_AGENT } from "@shared/vencordUserAgent";
import { createHash } from "crypto";
import { ipcMain } from "electron";
import { join } from "path";

import gitHash from "~git-hash";
import gitRemote from "~git-remote";

import { serializeErrors, VENCORD_FILES } from "./common";

// Allow Mausi (or whoever forks this) to point the auto-updater at a
// different GitHub repo via env var. `gitRemote` (baked in from the local
// `git remote get-url origin` at build time) is the fallback so the
// default behaviour is identical to upstream Vencord. Format must be
// `owner/repo` — same as a GitHub slug.
function resolveUpdateRepo(): string {
    const override = process.env.RAGCORD_UPDATE_REPO?.trim();
    if (override && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(override)) {
        return override;
    }
    return gitRemote;
}

const UPDATE_REPO = resolveUpdateRepo();
const API_BASE = `https://api.github.com/repos/${UPDATE_REPO}`;

// Hard cap per asset (the largest current Vencord asset is the renderer
// bundle at ~5 MB; 50 MB leaves plenty of headroom while preventing a
// hostile or corrupt release from filling the disk).
const MAX_ASSET_BYTES = 50 * 1024 * 1024;

// Hosts we are willing to download release assets from. GitHub serves
// release assets via objects.githubusercontent.com after a redirect, so
// both must be allowed.
const ALLOWED_DOWNLOAD_HOSTS = new Set([
    "github.com",
    "objects.githubusercontent.com",
]);

let PendingUpdates = [] as [string, string][];
// Map of asset name → expected SHA-256 hex, populated by fetchUpdates() if
// the release ships a SHA256SUMS file. null means the release published no
// checksums and we are falling back to raw HTTPS trust (with a warning).
let pendingSums: Map<string, string> | null = null;

async function githubGet<T = any>(endpoint: string) {
    return fetchJson<T>(API_BASE + endpoint, {
        headers: {
            Accept: "application/vnd.github+json",
            // "All API requests MUST include a valid User-Agent header.
            // Requests with no User-Agent header will be rejected."
            "User-Agent": RAGCORD_USER_AGENT
        }
    });
}

function isAllowedDownloadHost(url: string) {
    try {
        const { hostname } = new URL(url);
        return ALLOWED_DOWNLOAD_HOSTS.has(hostname);
    } catch {
        return false;
    }
}

function isSafeAssetName(name: string) {
    // Reject any path separators or traversal sequences. Release assets are
    // always flat filenames; anything else means the metadata is malformed
    // or hostile.
    return !/[\\/]/.test(name) && !name.includes("..") && name.length > 0 && name.length < 256;
}

function extractReleaseHash(data: any): string {
    // Newer releases set target_commitish to the full SHA; older releases
    // embedded the short hash in the release name. Try both, fall back to
    // tag_name, and as a last resort sniff the last whitespace-separated
    // token of the name (the previous behaviour).
    const candidates: string[] = [];
    if (typeof data.target_commitish === "string") candidates.push(data.target_commitish);
    if (typeof data.tag_name === "string") candidates.push(data.tag_name);
    if (typeof data.name === "string") {
        const tail = data.name.slice(data.name.lastIndexOf(" ") + 1);
        if (tail) candidates.push(tail);
    }
    for (const c of candidates) {
        // Accept any candidate that starts with the local hash — handles both
        // short (7-char) and long (40-char) SHAs without false negatives.
        if (c.startsWith(gitHash) || gitHash.startsWith(c)) return c;
    }
    return candidates[0] ?? "";
}

async function fetchSha256Sums(release: any): Promise<Map<string, string> | null> {
    const sumsAsset = release.assets.find(
        (a: any) => a.name === "SHA256SUMS" || a.name === "SHA256SUMS.txt"
    );
    if (!sumsAsset) return null;
    if (!isAllowedDownloadHost(sumsAsset.browser_download_url)) return null;
    if (typeof sumsAsset.size === "number" && sumsAsset.size > 1024 * 1024) return null;

    const text = (await fetchBuffer(sumsAsset.browser_download_url)).toString("utf-8");
    const map = new Map<string, string>();
    // Standard sha256sum line format: <hex>  <filename>  (two spaces) or
    // <hex> *<filename> (binary marker). Tolerant of either + any leading/
    // trailing whitespace.
    for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s*([a-f0-9]{64})\s+\*?(.+?)\s*$/i);
        if (m) map.set(m[2], m[1].toLowerCase());
    }
    return map.size ? map : null;
}

async function calculateGitChanges() {
    const isOutdated = await fetchUpdates();
    if (!isOutdated) return [];

    const data = await githubGet(`/compare/${gitHash}...HEAD`);

    return data.commits.map((c: any) => ({
        // github api only sends the long sha
        hash: c.sha.slice(0, 7),
        author: c.author.login,
        message: c.commit.message.split("\n")[0]
    }));
}

async function fetchUpdates() {
    const data = await githubGet("/releases/latest");

    const releaseHash = extractReleaseHash(data);
    if (releaseHash && (releaseHash === gitHash || releaseHash.startsWith(gitHash))) {
        return false;
    }

    // Reset any partial state from a previous interrupted check.
    PendingUpdates = [];
    pendingSums = null;

    for (const asset of data.assets ?? []) {
        const { name, browser_download_url, size } = asset;
        if (typeof name !== "string" || typeof browser_download_url !== "string") continue;
        if (!VENCORD_FILES.some(s => name.startsWith(s))) continue;
        if (!isSafeAssetName(name)) {
            console.warn(`[Vencord Updater] skipping suspicious asset name: ${name}`);
            continue;
        }
        if (typeof size === "number" && size > MAX_ASSET_BYTES) {
            console.warn(`[Vencord Updater] skipping oversized asset ${name} (${size} bytes)`);
            continue;
        }
        if (!isAllowedDownloadHost(browser_download_url)) {
            console.warn(`[Vencord Updater] skipping asset from untrusted host: ${browser_download_url}`);
            continue;
        }
        PendingUpdates.push([name, browser_download_url]);
    }

    pendingSums = await fetchSha256Sums(data).catch(() => null);
    if (!pendingSums) {
        console.warn(
            "[Vencord Updater] release published no SHA256SUMS file — " +
            "integrity cannot be verified, falling back to raw HTTPS trust"
        );
    }

    return PendingUpdates.length > 0;
}

async function applyUpdates() {
    const downloads: Array<[string, Buffer]> = [];

    try {
        for (const [name, url] of PendingUpdates) {
            const contents = await fetchBuffer(url);
            if (contents.byteLength > MAX_ASSET_BYTES) {
                throw new Error(`Asset ${name} exceeds the ${MAX_ASSET_BYTES}-byte cap`);
            }
            if (pendingSums) {
                const expected = pendingSums.get(name);
                if (!expected) {
                    throw new Error(`Asset ${name} is not listed in SHA256SUMS — refusing to install`);
                }
                const got = createHash("sha256").update(contents).digest("hex");
                if (got !== expected) {
                    throw new Error(`Asset ${name} hash mismatch (expected ${expected}, got ${got})`);
                }
            }
            downloads.push([join(__dirname, name), contents]);
        }
    } catch (e) {
        // Abort cleanly on any verification failure — never partially apply
        // an update, that's worse than not updating at all.
        PendingUpdates = [];
        pendingSums = null;
        throw e;
    }

    // Atomic writes so a crash mid-update doesn't leave a half-written file
    // that bricks the next launch. Each file is staged via .tmp + rename.
    await Promise.all(downloads.map(([filename, contents]) =>
        writeFileAtomic(filename, contents)
    ));

    PendingUpdates = [];
    pendingSums = null;
    return true;
}

ipcMain.handle(IpcEvents.GET_REPO, serializeErrors(() => `https://github.com/${UPDATE_REPO}`));
ipcMain.handle(IpcEvents.GET_UPDATES, serializeErrors(calculateGitChanges));
ipcMain.handle(IpcEvents.UPDATE, serializeErrors(fetchUpdates));
ipcMain.handle(IpcEvents.BUILD, serializeErrors(applyUpdates));
