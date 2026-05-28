/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import gitHash from "~git-hash";
import gitRemote from "~git-remote";

export { gitHash, gitRemote };

export const RAGCORD_USER_AGENT = `RagCordExtend/${gitHash}${gitRemote ? ` (https://github.com/${gitRemote})` : ""}`;

// Legacy alias for any consumer still importing the upstream name; remove
// once all callers have switched over.
export const VENCORD_USER_AGENT = RAGCORD_USER_AGENT;
