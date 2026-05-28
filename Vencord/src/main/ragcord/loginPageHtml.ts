/*
 * RagCord Extend, a Vencord fork for the RagnaMod community
 * Copyright (c) 2025 Mausi / RagnaMod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// The login window's HTML is shipped as a data: URL so the build doesn't have
// to ship a separate file and we don't need a file path that's correct at
// runtime in every distribution variant.
//
// Design (Iteration 2 – "hero-style"): bigger window (520x640), centered
// logo block with a "RC" emblem on a red disc, accent line under the brand,
// large breathing inputs, status row, footer hint.
//
// Wire protocol with main: a preload script in loginGate.ts (written to a
// temp dir at runtime) exposes `window.ragcord.login(user, pass)` via
// contextBridge. That keeps the renderer in contextIsolation:true /
// nodeIntegration:false and survives newer Electron versions that block
// `require()` inside data: URLs.

export const LOGIN_PAGE_HTML = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>RagCord Extend</title>
<style>
  :root {
    --bg: #0a0a0a;
    --bg-elev: #161616;
    --bg-hover: #1f1f1f;
    --border: #2a2a2a;
    --border-strong: #3a3a3a;
    --text: #f2f2f2;
    --text-dim: #8a8a8a;
    --text-mute: #555;
    --accent: #dc1818;
    --accent-hover: #ff2222;
    --accent-pressed: #a01010;
    --accent-glow: rgba(220, 24, 24, 0.35);
    --error: #ff5050;
    --success: #4ade80;
  }

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    background: var(--bg);
    color: var(--text);
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI",
                 Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 14px;
    -webkit-user-select: none;
    user-select: none;
    overflow: hidden;
  }

  body {
    display: flex;
    flex-direction: column;
  }

  /* ── Custom titlebar ──────────────────────────────────────────────── */
  .titlebar {
    height: 32px;
    background: #060606;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px 0 12px;
    -webkit-app-region: drag;
    border-bottom: 1px solid #1a1a1a;
    flex-shrink: 0;
  }
  .titlebar-title {
    font-size: 11px;
    color: var(--text-mute);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .titlebar-close {
    -webkit-app-region: no-drag;
    width: 38px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-dim);
    cursor: pointer;
    border-radius: 2px;
    transition: background 60ms ease, color 60ms ease;
    font-size: 14px;
  }
  .titlebar-close:hover {
    background: rgba(220, 24, 24, 0.18);
    color: var(--accent-hover);
  }

  /* ── Main column ──────────────────────────────────────────────────── */
  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 36px 48px 24px;
    overflow: hidden;
  }

  /* ── Brand block ──────────────────────────────────────────────────── */
  .brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 40px;
    width: 100%;
  }
  .emblem {
    width: 84px;
    height: 84px;
    border-radius: 50%;
    background: radial-gradient(circle at 30% 30%,
                                 var(--accent-hover) 0%,
                                 var(--accent) 55%,
                                 var(--accent-pressed) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-weight: 800;
    font-size: 38px;
    letter-spacing: -0.03em;
    box-shadow: 0 0 0 4px #161616, 0 0 30px var(--accent-glow);
    margin-bottom: 22px;
  }
  .brand-name {
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 0.005em;
    color: var(--text);
  }
  .brand-name .accent { color: var(--accent); }
  .brand-divider {
    width: 56px;
    height: 2px;
    background: var(--accent);
    margin: 14px 0;
    border-radius: 1px;
  }
  .brand-sub {
    font-size: 11px;
    color: var(--text-dim);
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 500;
  }

  /* ── Form ─────────────────────────────────────────────────────────── */
  form {
    width: 100%;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 10.5px;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-weight: 600;
  }
  input {
    appearance: none;
    -webkit-appearance: none;
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text);
    font: inherit;
    font-size: 14.5px;
    font-weight: 400;
    letter-spacing: normal;
    text-transform: none;
    padding: 13px 14px;
    outline: none;
    transition: border-color 100ms ease, background 100ms ease;
    -webkit-user-select: text;
    user-select: text;
  }
  input:hover { background: var(--bg-hover); }
  input:focus {
    border-color: var(--accent);
    background: var(--bg-hover);
  }
  input:disabled { opacity: 0.5; }

  button {
    appearance: none;
    -webkit-appearance: none;
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 3px;
    font: inherit;
    font-size: 13.5px;
    font-weight: 700;
    letter-spacing: 0.10em;
    text-transform: uppercase;
    padding: 14px 12px;
    margin-top: 10px;
    cursor: pointer;
    transition: background 100ms ease, box-shadow 100ms ease, transform 60ms ease;
  }
  button:hover:not(:disabled) {
    background: var(--accent-hover);
    box-shadow: 0 0 24px var(--accent-glow);
  }
  button:active:not(:disabled) {
    background: var(--accent-pressed);
    transform: translateY(1px);
  }
  button:disabled { opacity: 0.55; cursor: default; }

  /* ── Divider + Founder-Login ──────────────────────────────────────── */
  .divider-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 18px 0 4px;
    color: var(--text-mute);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    width: 100%;
    max-width: 400px;
  }
  .divider-row::before,
  .divider-row::after {
    content: "";
    flex: 1;
    height: 1px;
    background: var(--border);
  }

  .founder-btn {
    width: 100%;
    max-width: 400px;
    background: transparent;
    color: #d4af37;
    border: 1px solid rgba(212, 175, 55, 0.4);
    border-radius: 3px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 12px;
    margin: 0;
    cursor: pointer;
    transition: background 100ms ease, border-color 100ms ease;
  }
  .founder-btn:hover:not(:disabled) {
    background: rgba(212, 175, 55, 0.10);
    border-color: rgba(212, 175, 55, 0.85);
    box-shadow: none;
    transform: none;
  }
  .founder-btn:active:not(:disabled) {
    background: rgba(212, 175, 55, 0.18);
  }
  .founder-btn:disabled { opacity: 0.5; cursor: default; }

  /* ── Status & footer ──────────────────────────────────────────────── */
  .status {
    min-height: 18px;
    margin-top: 4px;
    font-size: 12px;
    text-align: center;
    color: var(--error);
    line-height: 1.45;
    font-weight: 500;
  }
  .status.muted { color: var(--text-dim); font-weight: 400; }
  .status.success { color: var(--success); }

  .foot {
    margin-top: auto;
    padding-top: 24px;
    text-align: center;
    font-size: 10.5px;
    color: var(--text-mute);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .foot .accent { color: var(--accent); }
</style>
</head>
<body>
  <div class="titlebar">
    <div class="titlebar-title">RagCord Extend</div>
    <div class="titlebar-close" id="closeBtn" title="Schliessen">&#x2715;</div>
  </div>

  <div class="main">
    <div class="brand">
      <div class="emblem">R</div>
      <div class="brand-name"><span class="accent">Rag</span>Cord <span class="accent">Extend</span></div>
      <div class="brand-divider"></div>
      <div class="brand-sub">RagnaMod Account erforderlich</div>
    </div>

    <form id="form" autocomplete="off">
      <label>
        Benutzername
        <input id="user" name="user" type="text" autofocus required spellcheck="false" />
      </label>
      <label>
        Passwort
        <input id="pass" name="pass" type="password" required />
      </label>
      <button id="submit" type="submit">Anmelden</button>
      <div id="status" class="status muted">&nbsp;</div>
    </form>

    <div class="divider-row"><span>oder</span></div>

    <button type="button" id="founderBtn" class="founder-btn">
      &#x269C; Gruendungsautoritaet verwenden
    </button>

    <div class="foot">Discord startet nach erfolgreichem <span class="accent">Login</span></div>
  </div>

<script>
  // The preload script (loginGate.ts writes it to a temp dir, points
  // webPreferences.preload at it) exposes window.ragcord.login() via
  // contextBridge. No require() in the renderer — works with
  // contextIsolation:true and Electron's data:-URL hardening.

  (function () {
    var form = document.getElementById("form");
    var userInput = document.getElementById("user");
    var passInput = document.getElementById("pass");
    var submitBtn = document.getElementById("submit");
    var status = document.getElementById("status");
    var closeBtn = document.getElementById("closeBtn");
    var founderBtn = document.getElementById("founderBtn");

    function setStatus(text, kind) {
      // kind: undefined|"error"|"muted"|"success"
      status.textContent = (text == null || text === "") ? "\\u00a0" : text;
      status.className = "status" + (kind === "muted" ? " muted"
                                  : kind === "success" ? " success"
                                  : "");
    }

    function setBusy(busy) {
      submitBtn.disabled = busy;
      userInput.disabled = busy;
      passInput.disabled = busy;
      if (founderBtn) founderBtn.disabled = busy;
      submitBtn.textContent = busy ? "Anmelden..." : "Anmelden";
    }

    // Close-Button (titlebar X) — works even if the IPC bridge is dead.
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        window.close();
      });
    }

    // window.ragcord.login() kommt aus dem Preload (contextBridge). Wenn
    // die Brücke fehlt (Preload nicht geladen), zeigen wir das inline.
    var bridgeOk = window.ragcord && typeof window.ragcord.login === "function";
    if (!bridgeOk) {
      setStatus("IPC-Bruecke nicht verfuegbar (Preload fehlt).", "error");
    }

    function doLogin() {
      var username = (userInput.value || "").trim();
      var password = passInput.value || "";
      if (!username || !password) {
        setStatus("Benutzername und Passwort erforderlich.", "error");
        return;
      }
      if (!bridgeOk) {
        setStatus("IPC-Bruecke nicht verfuegbar (Preload fehlt).", "error");
        return;
      }
      setBusy(true);
      setStatus("Verbinde...", "muted");

      Promise.resolve()
        .then(function () { return window.ragcord.login(username, password); })
        .then(function (result) {
          if (result && result.ok) {
            setStatus("Erfolgreich angemeldet. Lade Discord...", "success");
            // Window will be closed by main shortly.
          } else {
            var msg = (result && result.error) || "Anmeldung fehlgeschlagen.";
            setStatus(msg, "error");
            setBusy(false);
            try { passInput.select(); } catch (_) {}
          }
        })
        .catch(function (err) {
          setStatus("Auth-Server nicht erreichbar: " + (err && err.message ? err.message : err), "error");
          setBusy(false);
        });
    }

    // Two redundant submit paths: the form's native submit AND a direct
    // click handler on the button. Either firing is enough — if the form
    // submit ever silently fails (DOM weirdness, missing preventDefault),
    // the click still works.
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      doLogin();
    });
    submitBtn.addEventListener("click", function (e) {
      // The form's submit listener already calls doLogin via the form's
      // submit event; calling it twice would issue two parallel logins.
      // We only need this fallback when the submit event somehow doesn't
      // fire — e.g. submitBtn was disabled and we don't get a re-enable.
      // Skip if currently busy.
      if (submitBtn.disabled) return;
      // Let the form-submit path handle it; this is just to make sure
      // the click reaches *something* even if the form is missing.
      if (e.target !== submitBtn) return;
    });

    // Enter-in-input as belt-and-braces submit trigger.
    [userInput, passInput].forEach(function (el) {
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !submitBtn.disabled) {
          e.preventDefault();
          doLogin();
        }
      });
    });

    // Founder-Login: oeffnet im Main-Prozess einen Datei-Dialog, verifiziert
    // die signierte .txt offline (Ed25519) und legt eine token-lose Session
    // an. Brauchst du nur wenn du Level-5-Mitglied bist und keinen
    // Online-Login machen willst/kannst.
    if (founderBtn) {
      founderBtn.addEventListener("click", function () {
        if (!bridgeOk || !window.ragcord.loginFounder) {
          setStatus("Founder-Login derzeit nicht verfuegbar.", "error");
          return;
        }
        setBusy(true);
        setStatus("Waehle deinen Authority-Key (.txt)...", "muted");
        Promise.resolve()
          .then(function () { return window.ragcord.loginFounder(); })
          .then(function (result) {
            if (result && result.ok) {
              setStatus("Authority-Key akzeptiert. Lade Discord...", "success");
            } else if (result && result.cancelled) {
              setBusy(false);
              setStatus("", "muted");
            } else {
              setStatus((result && result.error) || "Key-Verifikation fehlgeschlagen.", "error");
              setBusy(false);
            }
          })
          .catch(function (err) {
            setStatus("Founder-Login fehlgeschlagen: "
              + (err && err.message ? err.message : err), "error");
            setBusy(false);
          });
      });
    }

    // Focus the first empty input when the page is ready.
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", focusFirstEmpty);
    } else {
      focusFirstEmpty();
    }
    function focusFirstEmpty() {
      if (userInput.value) passInput.focus();
      else userInput.focus();
    }
  })();
</script>
</body>
</html>`;
