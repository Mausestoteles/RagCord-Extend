/*
 * RagCord Extend, a Vencord fork for the RagnaMod community
 * Copyright (c) 2025 Mausi / RagnaMod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app } from "electron";
import { cpSync, existsSync, statSync } from "fs";
import { join } from "path";

/**
 * One-shot import of upstream Vencord's data directory into RagCord's.
 *
 * Upstream Vencord stores settings/themes/quickCss in
 * `<userData>/../Vencord/`. A user switching to this fork would otherwise
 * lose all of that — their plugin settings, theme files, QuickCSS — and
 * have to recreate it from scratch.
 *
 * The copy only runs when:
 *   - the new RagCord directory does NOT already exist (so we never clobber
 *     an in-progress RagCord install or a previously migrated set), AND
 *   - the upstream Vencord directory DOES exist as a directory.
 *
 * If the user explicitly overrode DATA_DIR via the `RAGCORD_USER_DATA_DIR`
 * or `VENCORD_USER_DATA_DIR` environment variable, they're managing their
 * own paths and we leave them alone.
 */
export function migrateFromUpstreamIfNeeded(): void {
    if (process.env.RAGCORD_USER_DATA_DIR || process.env.VENCORD_USER_DATA_DIR) {
        return;
    }

    const baseDir = join(app.getPath("userData"), "..");
    const ragcordDir = join(baseDir, "RagCord");
    const vencordDir = join(baseDir, "Vencord");

    if (existsSync(ragcordDir)) return;
    if (!existsSync(vencordDir)) return;
    try {
        if (!statSync(vencordDir).isDirectory()) return;
    } catch {
        return;
    }

    try {
        cpSync(vencordDir, ragcordDir, {
            recursive: true,
            errorOnExist: false,
            // Don't follow symlinks — upstream Vencord doesn't create any,
            // and refusing to follow protects us from a weird user setup
            // that links the upstream dir somewhere unexpected.
            dereference: false,
        });
        console.log(
            `[RagCord] Migrated upstream Vencord settings from ${vencordDir} → ${ragcordDir}`
        );
    } catch (e) {
        console.error("[RagCord] Failed to migrate upstream Vencord settings:", e);
    }
}
