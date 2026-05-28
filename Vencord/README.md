# RagCord Extend

A Discord client modification for the RagnaMod community. Patches the
official Discord desktop app with a login gate against the RagnaMod auth
service, a curated plugin set, and a red/black UI theme.

Internal fork. Not affiliated with, endorsed by, or sponsored by any
upstream Discord client mod or by Discord Inc.

## What it does

- **Login gate.** Discord refuses to start until you've authenticated with
  your RagnaMod account against `http://46.17.217.79:8000`. The session
  token is persisted (encrypted via the OS keystore where available) so
  the second launch goes straight through without re-prompting.
- **Curated plugins.** The phone-home plugins from upstream (donor badges,
  ReviewDB, USRBG, Decor) and the upstream support-server prompts are
  removed. What's left is the inert tooling: chat utilities, message
  decorators, UX fixes.
- **No telemetry.** All upstream cloud-sync / donor-badge / sponsor calls
  are gone. The only outbound traffic from RagCord Extend itself is the
  auth API and any plugin you explicitly enable.
- **Red/black theme.** The upstream pink accent is replaced with a flat
  red on a black/dark-gray surface. Minimalist, no gradients.

## Setup

1. Install the build prerequisites:
   ```
   pnpm install
   ```
2. Build:
   ```
   pnpm build
   ```
3. Inject into Discord:
   ```
   pnpm inject
   ```
4. Restart Discord. The RagCord login window appears before the main
   Discord window.

If you need to revert:
```
pnpm uninject
```

## Auth flow

```
       launch Discord
              │
              ▼
   patcher.ts hooks app.whenReady
              │
              ▼
   loginGate.runLoginGate()
              │
       ┌──────┴──────┐
       │             │
       ▼             ▼
 stored session?   no session
       │             │
       ▼             ▼
   POST /api/verify  show login window
       │             │
       │             ▼
       │       user enters RagnaMod creds
       │             │
       │             ▼
       │       POST /api/login → token + user
       │             │
       │             ▼
       │       saveSession() encrypted to disk
       │             │
       └──────┬──────┘
              │
              ▼
        Discord boots normally
```

If the auth API is unreachable, the login window surfaces the network
error and the user can retry. Closing the login window without success
calls `app.quit()` — there is no offline-bypass.

## Notable internal paths

| Path | What's there |
|---|---|
| [src/main/ragcord/auth.ts](src/main/ragcord/auth.ts) | Session storage (atomic write, OS-keystore encryption), API client |
| [src/main/ragcord/loginGate.ts](src/main/ragcord/loginGate.ts) | Orchestrates verify → window → save → unblock |
| [src/main/ragcord/loginPageHtml.ts](src/main/ragcord/loginPageHtml.ts) | Login HTML/CSS/JS, red/black theme |
| [src/main/patcher.ts](src/main/patcher.ts) | Wraps `app.whenReady` so Discord waits on the gate |
| [SECURITY.md](SECURITY.md) | Hardening notes (atomic writes, updater SHA256, CSP boundary) |

## Configuration

The auth endpoint defaults to `http://46.17.217.79:8000`. Override at
launch time with the environment variable `RAGCORD_AUTH_BASE` if you
need to point at a staging instance:

```
RAGCORD_AUTH_BASE=https://auth-staging.example/ Discord ...
```

## License

GPL-3.0-or-later, inherited from the upstream codebase.
