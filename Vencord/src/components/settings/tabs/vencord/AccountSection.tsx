/*
 * RagCord Extend, a Vencord fork for the RagnaMod community
 * Copyright (c) 2025 Mausi / RagnaMod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Card } from "@components/Card";
import { Margins } from "@utils/margins";
import { relaunch } from "@utils/native";
import { Button, ConfirmModal, Forms, openModal, React, useEffect, useState } from "@webpack/common";

import type { RagCordSessionUser } from "../../../../VencordNative";

function formatExpiresIn(expiresAt: string): { text: string; isExpired: boolean; isExpiringSoon: boolean } {
    const expires = Date.parse(expiresAt);
    if (Number.isNaN(expires)) {
        return { text: "Unbekannt", isExpired: false, isExpiringSoon: false };
    }
    const ms = expires - Date.now();
    if (ms <= 0) {
        return { text: "abgelaufen", isExpired: true, isExpiringSoon: false };
    }
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    const hours = Math.floor(ms / (60 * 60 * 1000));
    const isExpiringSoon = ms < 2 * 24 * 60 * 60 * 1000;
    if (days >= 2) return { text: `in ${days} Tagen`, isExpired: false, isExpiringSoon };
    if (hours >= 1) return { text: `in ${hours} Stunden`, isExpired: false, isExpiringSoon: true };
    return { text: "in < 1 Stunde", isExpired: false, isExpiringSoon: true };
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div style={{ display: "flex", gap: 12, padding: "4px 0" }}>
            <span style={{
                minWidth: 100,
                color: "var(--text-muted)",
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
            }}>
                {label}
            </span>
            <span style={{ color: "var(--text-normal)", fontSize: 14 }}>{value}</span>
        </div>
    );
}

function confirmLogout(): void {
    openModal(props => (
        <ConfirmModal
            {...props}
            title="Abmelden?"
            subtitle="Du musst dich beim nächsten Discord-Start neu mit deinem RagnaMod-Account anmelden."
            confirmText="Abmelden"
            cancelText="Abbrechen"
            variant="danger"
            onConfirm={async () => {
                try {
                    await VencordNative.ragcord.logout();
                } catch {
                    // Even if the server-side /api/logout call fails, the
                    // local session has already been cleared by the main
                    // process. Still safe to relaunch.
                }
                relaunch();
            }}
        />
    ));
}

export function AccountSection() {
    const [session, setSession] = useState<RagCordSessionUser | null | undefined>(undefined);

    useEffect(() => {
        let cancelled = false;
        VencordNative.ragcord.getSession().then(s => {
            if (!cancelled) setSession(s);
        }).catch(() => {
            if (!cancelled) setSession(null);
        });
        return () => { cancelled = true; };
    }, []);

    if (session === undefined) {
        return (
            <section className={Margins.bottom16}>
                <Card style={{ padding: 16 }}>
                    <Forms.FormText>Lade RagnaMod-Sitzung…</Forms.FormText>
                </Card>
            </section>
        );
    }

    if (session === null) {
        return (
            <section className={Margins.bottom16}>
                <Card style={{ padding: 16, borderLeft: "3px solid var(--ragcord-error, #ff5050)" }}>
                    <Forms.FormTitle tag="h5">Keine aktive Sitzung</Forms.FormTitle>
                    <Forms.FormText>
                        Es ist kein RagnaMod-Login gespeichert. Starte Discord neu, um dich anzumelden.
                    </Forms.FormText>
                </Card>
            </section>
        );
    }

    const expires = formatExpiresIn(session.expires_at);
    const headUrl = session.mcname
        ? `https://mc-heads.net/avatar/${encodeURIComponent(session.mcname)}/48.png`
        : null;

    const expiryColor = expires.isExpired
        ? "var(--ragcord-error, #ff5050)"
        : expires.isExpiringSoon
            ? "var(--ragcord-accent, #dc1818)"
            : "var(--text-normal)";

    return (
        <section className={Margins.bottom16}>
            <Card style={{
                padding: 16,
                borderLeft: "3px solid var(--ragcord-accent, #dc1818)",
            }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                    {headUrl && (
                        <img
                            src={headUrl}
                            width={48}
                            height={48}
                            style={{
                                borderRadius: 4,
                                imageRendering: "pixelated",
                                boxShadow: "0 0 0 1px rgba(0,0,0,0.35)",
                            }}
                            alt={session.mcname ?? ""}
                        />
                    )}
                    <div style={{ flex: 1 }}>
                        <Forms.FormTitle tag="h5" style={{ marginBottom: 4 }}>
                            {session.name || session.username}
                        </Forms.FormTitle>
                        <Forms.FormText style={{ color: "var(--text-muted)", fontSize: 12 }}>
                            RagnaMod-Sitzung aktiv
                        </Forms.FormText>

                        <div style={{ marginTop: 12 }}>
                            <Row label="Username" value={session.username} />
                            <Row label="Member-ID" value={String(session.member_id)} />
                            {session.mcname && <Row label="Minecraft" value={session.mcname} />}
                            {session.level && <Row label="Level" value={session.level} />}
                            {session.role && <Row label="Rolle" value={session.role} />}
                            <Row
                                label="Token gültig"
                                value={<span style={{ color: expiryColor }}>{expires.text}</span>}
                            />
                        </div>

                        <div style={{ marginTop: 16 }}>
                            <Button
                                size={Button.Sizes.SMALL}
                                color={Button.Colors.RED}
                                onClick={confirmLogout}
                            >
                                Abmelden
                            </Button>
                        </div>
                    </div>
                </div>
            </Card>
        </section>
    );
}
