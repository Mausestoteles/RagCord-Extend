/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { renameSync, unlinkSync, writeFileSync } from "fs";
import { rename, unlink, writeFile } from "fs/promises";

/**
 * Write a file in two steps — write to `<path>.tmp` then rename onto `path`.
 *
 * On POSIX `rename(2)` is atomic; on Windows `MoveFileEx` with the default
 * replace-existing flag is atomic in the file-system metadata sense. Either
 * way, a crash or power loss mid-write can leave the `.tmp` file behind but
 * the target file remains intact at its previous valid contents.
 *
 * This matters for settings.json / native-settings.json / quickCss.css — a
 * crashing Discord during a write was previously enough to make Vencord
 * fail to boot on the next launch.
 */
export function writeFileAtomicSync(path: string, data: string | NodeJS.ArrayBufferView) {
    const tmp = path + ".tmp";
    try {
        writeFileSync(tmp, data);
        renameSync(tmp, path);
    } catch (e) {
        // Best-effort cleanup of the temp file; ignore if it doesn't exist.
        try { unlinkSync(tmp); } catch { /* ignore */ }
        throw e;
    }
}

export async function writeFileAtomic(path: string, data: string | NodeJS.ArrayBufferView) {
    const tmp = path + ".tmp";
    try {
        await writeFile(tmp, data);
        await rename(tmp, path);
    } catch (e) {
        try { await unlink(tmp); } catch { /* ignore */ }
        throw e;
    }
}
