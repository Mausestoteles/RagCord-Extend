/*
 * RagCord Extend, a Vencord fork for the RagnaMod community
 * Copyright (c) 2025 Mausi / RagnaMod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { closeModal, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { Button, Forms, React, Text, useEffect, useState } from "@webpack/common";

import type { RagCordNewsItem } from "../../VencordNative";
import { getCachedNews, getReadIds, markAllRead, markRead } from "./index";

function formatDate(iso: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("de-DE", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

function NewsRow({ item, isRead, onMarkRead }: {
    item: RagCordNewsItem;
    isRead: boolean;
    onMarkRead: () => void;
}) {
    const accent = item.pinned ? "var(--ragcord-accent, #dc1818)" : "transparent";

    return (
        <div
            onClick={() => {
                if (!isRead) onMarkRead();
            }}
            style={{
                padding: "12px 14px",
                marginBottom: 8,
                background: isRead ? "var(--background-tertiary)" : "var(--background-secondary)",
                borderLeft: `3px solid ${accent}`,
                borderRadius: 4,
                cursor: isRead ? "default" : "pointer",
                opacity: isRead ? 0.7 : 1,
                transition: "opacity 100ms ease",
            }}
        >
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 8,
                marginBottom: 4,
            }}>
                <Text variant="text-md/semibold" style={{ color: "var(--header-primary)" }}>
                    {item.pinned ? "📌 " : ""}{item.title}
                </Text>
                <Text
                    variant="text-xs/normal"
                    style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}
                >
                    {formatDate(item.created_at)}
                </Text>
            </div>
            <Text
                variant="text-sm/normal"
                style={{ color: "var(--text-normal)", whiteSpace: "pre-wrap" }}
            >
                {item.body}
            </Text>
            <div style={{ marginTop: 6, color: "var(--text-muted)", fontSize: 11 }}>
                — {item.author}
            </div>
        </div>
    );
}

function NewsModalBody(props: ModalProps) {
    const [items, setItems] = useState<RagCordNewsItem[] | null>(null);
    const [readIds, setReadIds] = useState<Set<number>>(new Set());

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const [list, read] = await Promise.all([getCachedNews(), getReadIds()]);
            if (cancelled) return;
            setItems(list);
            setReadIds(read);
        })();
        return () => { cancelled = true; };
    }, []);

    // Sort: pinned first, then newest first.
    const sorted = React.useMemo(() => {
        if (!items) return [];
        return [...items].sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            return b.id - a.id;
        });
    }, [items]);

    const unreadCount = items
        ? items.filter(i => !readIds.has(i.id)).length
        : 0;

    return (
        <ModalRoot {...props} size={ModalSize.MEDIUM}>
            <ModalHeader>
                <Forms.FormTitle tag="h4" style={{ margin: 0 }}>
                    RagnaMod News
                </Forms.FormTitle>
                <ModalCloseButton onClick={props.onClose} />
            </ModalHeader>

            <ModalContent style={{ padding: "16px 16px 8px" }}>
                {items === null && <Forms.FormText>Lade Forum-News…</Forms.FormText>}
                {items !== null && items.length === 0 && (
                    <Forms.FormText>Keine News vorhanden.</Forms.FormText>
                )}
                {items !== null && items.length > 0 && sorted.map(item => (
                    <NewsRow
                        key={item.id}
                        item={item}
                        isRead={readIds.has(item.id)}
                        onMarkRead={async () => {
                            await markRead(item.id);
                            setReadIds(prev => new Set(prev).add(item.id));
                        }}
                    />
                ))}
            </ModalContent>

            <ModalFooter>
                <Button
                    color={Button.Colors.PRIMARY}
                    look={Button.Looks.LINK}
                    onClick={async () => {
                        await markAllRead();
                        setReadIds(new Set(items?.map(i => i.id) ?? []));
                    }}
                    disabled={unreadCount === 0}
                >
                    Alle als gelesen markieren{unreadCount > 0 ? ` (${unreadCount})` : ""}
                </Button>
                <Button color={Button.Colors.BRAND} onClick={props.onClose}>
                    Schließen
                </Button>
            </ModalFooter>
        </ModalRoot>
    );
}

let openKey: string | null = null;

export function openNewsModal(): void {
    if (openKey) {
        // Avoid stacking modals on rapid toast clicks.
        closeModal(openKey);
    }
    openKey = openModal(props => <NewsModalBody {...props} />);
}
