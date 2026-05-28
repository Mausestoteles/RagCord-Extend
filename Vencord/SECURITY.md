# Security Hardening (Patched Fork)

This fork of Vencord ships a small set of defensive patches on top of the
upstream codebase. They target real bugs (corruption-on-crash, unverified
auto-updates, missing input validation) — not the architectural trade-offs
that are inherent to what a Discord client mod *is*.

## Threat model

Vencord runs as code inside Discord's Electron renderer process with the
sandbox disabled (`webPreferences.sandbox = false` in
[src/main/patcher.ts](src/main/patcher.ts)) and full Node.js access. Plugins
share that privilege. The relevant security boundaries that remain are:

| Boundary | Crossed by | Trust assumption |
|---|---|---|
| Filesystem (settings, themes, QuickCSS) | renderer → main IPC | renderer is trusted, but the **on-disk format must be robust to crashes mid-write** |
| External URLs / protocols | renderer → main via `OPEN_EXTERNAL` | allowlist of protocols |
| CSP overrides | plugin → user dialog | explicit user confirmation with checkbox |
| Auto-updater | network → disk | **the binaries we install must be authentic** |
| User-installed plugins (`src/userplugins/`) | filesystem → build | trust-the-user model — outside scope |

Everything else (renderer↔preload, webpack patcher, plugin manager) lives
within a single trust domain by design.

## Patches in this fork

### 1. Atomic settings & QuickCSS writes
- [src/main/utils/safeWriteFile.ts](src/main/utils/safeWriteFile.ts) — new
  `writeFileAtomicSync` / `writeFileAtomic` helpers that write to
  `<path>.tmp` and rename onto the target.
- [src/main/settings.ts](src/main/settings.ts) — both `settings.json` and
  `native-settings.json` are now written atomically.
- [src/main/ipcMain.ts](src/main/ipcMain.ts) — `quickCss.css` is written
  atomically via the same helper.

Previously a Discord crash, power loss, or full-disk during a settings
write could leave the file truncated and Vencord would fail to boot on
the next launch.

### 2. Input validation + size cap on `SET_QUICK_CSS`
[src/main/ipcMain.ts](src/main/ipcMain.ts) — the IPC handler now:
- Rejects non-string payloads (`typeof css !== "string"`)
- Caps the body at **5 MiB** (`MAX_QUICK_CSS_BYTES`)

A buggy or malicious renderer-side plugin previously had an open-ended
filesystem-write primitive — useful for filling the disk or jamming the
file-watcher with a multi-gigabyte change event.

### 3. HTTP-updater hardening
[src/main/updater/http.ts](src/main/updater/http.ts) — significant rewrite:

- **SHA-256 verification with graceful fallback.** If the GitHub release
  ships a `SHA256SUMS` or `SHA256SUMS.txt` asset, each downloaded file is
  hashed and compared. If a release publishes no checksums, the updater
  logs a loud warning and falls back to raw HTTPS trust (so updates keep
  working with current upstream releases — but once this fork ships
  SHA256SUMS, every install will be verified).
- **Robust release-name parsing.** The old code did
  `data.name.slice(data.name.lastIndexOf(" ") + 1)`, which broke if the
  release-name format ever changed. The new code prefers
  `target_commitish`, then `tag_name`, then falls back to the legacy
  sniff — and tolerates both short and long SHAs.
- **Asset-name validation.** Asset names with path separators (`/`, `\`),
  traversal sequences (`..`), or excessive length (>= 256 chars) are
  rejected with a warning. Prevents a malformed release manifest from
  writing files outside `__dirname`.
- **Download-host allowlist.** Only `github.com` and
  `objects.githubusercontent.com` are accepted as asset hosts. Defends
  against tampered release metadata that points at a third-party CDN.
- **Per-asset size cap (50 MiB)** — both the metadata-reported size and
  the actually-downloaded byte count are checked.
- **Atomic file writes** — downloaded files are written through
  `writeFileAtomic` so an interrupted update doesn't brick the next
  launch with a half-written `renderer.js`.
- **All-or-nothing application.** If any asset fails verification, the
  pending list is cleared and the function throws — never a partial
  update.

## By-design limitations (NOT patched)

These are listed for transparency. Fixing them would break Vencord's
ability to function as a Discord client mod.

- **`sandbox: false`** on the main renderer
  ([src/main/patcher.ts](src/main/patcher.ts)) — plugins legitimately need
  Node access. Restoring the sandbox would break almost every plugin.
- **`DANGEROUS_ENABLE_DEVTOOLS_ONLY_ENABLE_IF_YOU_KNOW_WHAT_YOURE_DOING`**
  forced on — required for plugin debugging.
- **CSP modifications** ([src/main/csp/index.ts](src/main/csp/index.ts)) —
  Vencord adds `'unsafe-inline'`/`'unsafe-eval'` to the renderer CSP
  because Discord itself uses them. The CSP override IPC handler does
  require user confirmation with a checkbox, which is the right behaviour.
- **`PRELOAD_GET_RENDERER_JS`** reads `renderer.js` from disk and pipes
  it through `webFrame.executeJavaScript` — this *is* the injection
  mechanism. Anyone with write access to the install directory already
  owns the Discord process; no extra defence is meaningful at this layer.
- **Plugin native IPC methods** ([src/main/ipcPlugins.ts](src/main/ipcPlugins.ts))
  are addressable by any renderer-side caller, not just the plugin that
  registered them. Since all plugins share the renderer process anyway,
  isolation here would be theatre.

## Recommendations for users of this fork

- **Don't drop unreviewed plugins into `src/userplugins/`.** That
  directory has full main-process IPC access and no review gate. Read
  the source first; it's the most powerful privilege you can grant.
- **If you publish releases from this fork**, also publish a
  `SHA256SUMS` asset alongside the binaries — the patched updater will
  pick it up automatically and refuse mismatched downloads.
- **Don't enable cloud-sync against a third-party endpoint** unless you
  trust the operator. The default vencord.dev endpoint sees your full
  plugin configuration.
