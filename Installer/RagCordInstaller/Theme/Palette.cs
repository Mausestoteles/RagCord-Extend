// ──────────────────────────────────────────────
// Rot/Schwarz-Palette – passend zum Login-Gate
// ──────────────────────────────────────────────
// Hex-Werte deckungsgleich mit src/main/ragcord/loginPageHtml.ts und
// src/ragcordTheme.css. Wenn das Login-Gate-CSS jemals verschiebt, hier
// nachziehen — die UI soll sich anfühlen wie ein einziges Produkt.

using System.Drawing;

namespace RagCordInstaller.Theme;

internal static class Palette
{
    public static readonly Color Bg          = ColorTranslator.FromHtml("#0a0a0a");
    public static readonly Color BgElev      = ColorTranslator.FromHtml("#161616");
    public static readonly Color BgHover     = ColorTranslator.FromHtml("#1f1f1f");
    public static readonly Color Border      = ColorTranslator.FromHtml("#2a2a2a");
    public static readonly Color Text        = ColorTranslator.FromHtml("#f2f2f2");
    public static readonly Color TextDim     = ColorTranslator.FromHtml("#888888");
    public static readonly Color Accent      = ColorTranslator.FromHtml("#dc1818");
    public static readonly Color AccentHover = ColorTranslator.FromHtml("#ff2222");
    public static readonly Color AccentPress = ColorTranslator.FromHtml("#a01010");
    public static readonly Color Error       = ColorTranslator.FromHtml("#ff5050");
    public static readonly Color Success     = ColorTranslator.FromHtml("#4ade80");
}
