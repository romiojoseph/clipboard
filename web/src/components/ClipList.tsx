import { useMemo, useState } from 'react';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import {
    PushPin as PushPinIcon,
    Trash as TrashIcon,
    CheckSquare as CheckSquareIcon,
    Square as SquareIcon,
    Tag as TagIcon,
    FileImage as FileImageIcon,
    ClipboardText as ClipboardTextIcon,
    Plus as PlusIcon,
    Copy as CopyIcon,
    Export as ExportIcon,
    Eye as EyeIcon,
    EyeSlash as EyeSlashIcon,
    Pencil as EditIcon,
    ArrowSquareOut as ArrowSquareOutIcon,
    FolderOpen as FolderOpenIcon,
    BracketsCurly as BracketsCurlyIcon,
    XIcon
} from '@phosphor-icons/react';
import type { Clip } from '../types';
import Button from './Button';
import { formatDate } from '../utils/date';
import styles from './ClipList.module.css';

// Helper to check if a string is a URL
function isUrl(content: string): boolean {
    const trimmed = content.trim();
    return /^(?:https?|ftp):\/\/\S+/i.test(trimmed) || /^www\.\S+/i.test(trimmed);
}

// Helper to check if a string is a file or directory path
function isFilePath(content: string): boolean {
    const trimmed = content.trim();
    // Absolute Windows drive path (e.g., C:\path or D:/path) or Windows network UNC path (e.g., \\server\share)
    return /^[a-zA-Z]:[\\/]/i.test(trimmed) || /^\\\\[^\\]+\\[^\\]+/.test(trimmed);
}

// Helper to check if a string is JSON
function isJson(content: string): boolean {
    const trimmed = content.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return false;
    }
    try {
        JSON.parse(trimmed);
        return true;
    } catch (e) {
        return false;
    }
}

// Helper function to detect sensitive clipboard content
function isSensitive(content: string): boolean {
    if (!content) return false;

    // Do not mask URLs or file paths
    if (isUrl(content) || isFilePath(content)) {
        return false;
    }

    // 1. Common API token patterns
    const apiKeyRegex = /(?:ghp_[a-zA-Z0-9]{36}|sk-[a-zA-Z0-9]{20,}|AWS[A-Z0-9]{16,}|rk_[a-z0-9]{24,}|sq0idp-[a-zA-Z0-9_-]{22,})/i;
    if (apiKeyRegex.test(content)) return true;

    // 2. High-entropy single words (typical passwords, hashes, or credentials)
    const singleWord = content.trim();
    if (!/\s/.test(singleWord) && singleWord.length >= 12 && singleWord.length <= 128) {
        const hasUpper = /[A-Z]/.test(singleWord);
        const hasLower = /[a-z]/.test(singleWord);
        const hasDigit = /[0-9]/.test(singleWord);
        const hasSpecial = /[^A-Za-z0-9]/.test(singleWord);
        const categories = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;
        if (categories >= 3) return true;
    }

    // 3. Common key-value config lines containing sensitive terms
    const sensitiveKeysRegex = /(?:password|passwd|secret|passphrase|api_key|apikey|private_key|token|credentials)\b\s*[:=]\s*['"]?[a-zA-Z0-9_.-]{4,}['"]?/i;
    if (sensitiveKeysRegex.test(content)) return true;

    // 4. Secure passphrases (e.g. 4+ words separated by hyphens)
    const passphraseRegex = /^[a-zA-Z]+[-_][a-zA-Z]+[-_][a-zA-Z]+[-_][a-zA-Z]+$/;
    if (passphraseRegex.test(singleWord)) return true;

    // 5. Private Key blocks
    if (content.includes('BEGIN PRIVATE KEY') || content.includes('BEGIN RSA PRIVATE KEY')) return true;

    return false;
}

// Helper to detect CSS colors (Hex, RGB, HSL)
function isColor(content: string): boolean {
    const trimmed = content.trim().toLowerCase();
    if (/^#(?:[0-9a-f]{3,4}){1,2}$/i.test(trimmed)) return true;
    if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)$/i.test(trimmed)) return true;
    if (/^hsla?\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*(?:,\s*[\d.]+\s*)?\)$/i.test(trimmed)) return true;
    return false;
}

// Helper to detect if content is code
function isCode(content: string): boolean {
    const trimmed = content.trim();
    if (!trimmed || trimmed.length < 30) return false;

    const lines = trimmed.split('\n');
    if (lines.length < 2) return false;

    let score = 0;

    if (lines.some(l => /^[ \t]+\S/.test(l))) score++;
    if (/^(import|export|const|let|var|function|class|interface|type|def|if|for|while|return|#include|using|namespace|package)\b/im.test(trimmed)) score++;
    if (/;\s*$/m.test(trimmed)) score++;
    if (/\/\/|\/\*|#\s/.test(trimmed)) score++;
    if (/=>|::|->|!==|===|&&|\|\||\+=|-=|\*=|<\/|<\/?[a-z]+[^>]*>/i.test(trimmed)) score++;
    if (/[{}]/.test(trimmed)) score++;

    return score >= 3;
}

function CodeBlock({ content }: { content: string }) {
    const html = useMemo(() => hljs.highlightAuto(content.trim()).value, [content]);
    return (
        <pre className={styles.codeBlock}>
            <code dangerouslySetInnerHTML={{ __html: html }} />
        </pre>
    );
}

type ClipListProps = {
    clips: Clip[];
    availableTags: string[];
    onRefresh: () => void;
    apiBase: string;
    selectedIds: number[];
    onSelectionChange: (ids: number[]) => void;
    onShowAlert: (title: string, message: string, type?: 'success' | 'warning' | 'error') => void;
    onShowConfirm: (title: string, message: string, type: 'warning' | 'error', onConfirm: () => void) => void;
};

export default function ClipList({
    clips,
    availableTags,
    onRefresh,
    apiBase,
    selectedIds,
    onSelectionChange,
    onShowAlert,
    onShowConfirm,
}: ClipListProps) {
    const [activeTagMenuId, setActiveTagMenuId] = useState<number | null>(null);
    const [unmaskedIds, setUnmaskedIds] = useState<number[]>([]);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editText, setEditText] = useState('');

    const handleOpenLink = (url: string) => {
        let target = url.trim();
        if (/^www\./i.test(target)) {
            target = `https://${target}`;
        }
        window.open(target, '_blank', 'noopener,noreferrer');
    };

    const handleReveal = async (path: string) => {
        try {
            const res = await fetch(`${apiBase}/reveal`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: path.trim() }),
            });
            if (!res.ok) {
                const errText = await res.text();
                throw new Error(errText || 'Failed to reveal path');
            }
        } catch (err: any) {
            onShowAlert('Error', err.message || 'Failed to reveal in Explorer.', 'error');
        }
    };

    const handleFormatJson = async (id: number, content: string) => {
        try {
            const parsed = JSON.parse(content.trim());
            const formatted = JSON.stringify(parsed, null, 4);
            const res = await fetch(`${apiBase}/clips/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: formatted }),
            });
            if (!res.ok) throw new Error('Failed to save formatted JSON');
            onRefresh();
            onShowAlert('Success', 'JSON formatted successfully.', 'success');
        } catch (err) {
            onShowAlert('Error', 'Failed to format JSON. Invalid structure.', 'error');
        }
    };

    const toggleMask = (id: number) => {
        if (unmaskedIds.includes(id)) {
            setUnmaskedIds(unmaskedIds.filter((uid) => uid !== id));
        } else {
            setUnmaskedIds([...unmaskedIds, id]);
        }
    };

    const handleSaveEdit = async (id: number) => {
        if (!editText.trim()) return;
        try {
            const res = await fetch(`${apiBase}/clips/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: editText }),
            });
            if (!res.ok) throw new Error('Failed to save edit');
            setEditingId(null);
            onRefresh();
        } catch (err) {
            onShowAlert('Error', 'Failed to save edits.', 'error');
        }
    };

    const copyToClipboard = async (content: string) => {
        const cleanContent = content.startsWith('[FILE]:') ? content.substring(7) : content;
        try {
            await navigator.clipboard.writeText(cleanContent);
            onShowAlert('Copied', 'Clip successfully copied to clipboard.', 'success');
        } catch {
            onShowAlert('Error', 'Unable to copy clip to clipboard.', 'error');
        }
    };

    const copyImageToClipboard = async (filePath: string) => {
        try {
            const response = await fetch(`${apiBase}/view-image?path=${encodeURIComponent(filePath)}`);
            if (!response.ok) throw new Error('Failed to fetch image');
            const blob = await response.blob();
            // Wrap in ClipboardItem and write actual image data to clipboard
            const pngBlob = blob.type === 'image/png' ? blob : new Blob([blob], { type: 'image/png' });
            await navigator.clipboard.write([
                new ClipboardItem({
                    [pngBlob.type]: pngBlob
                })
            ]);
            onShowAlert('Copied Image', 'Actual image copied to clipboard successfully.', 'success');
        } catch (err) {
            console.error('Failed to copy image:', err);
            onShowAlert('Error', 'Unable to copy actual image to clipboard.', 'error');
        }
    };

    const deleteClip = async (id: number) => {
        onShowConfirm('Delete Clip', 'Are you sure you want to delete this clip?', 'error', async () => {
            try {
                const res = await fetch(`${apiBase}/clips/${id}`, { method: 'DELETE' });
                if (!res.ok) throw new Error('Delete failed');
                onRefresh();
            } catch (err) {
                onShowAlert('Error', 'Failed to delete clip.', 'error');
            }
        });
    };

    const togglePin = async (id: number, pinned: boolean) => {
        try {
            const res = await fetch(`${apiBase}/clips/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pinned: !pinned }),
            });
            if (!res.ok) throw new Error('Toggle pin failed');
            onRefresh();
        } catch (err) {
            onShowAlert('Error', 'Failed to toggle pin.', 'error');
        }
    };

    const handleToggleTag = async (clip: Clip, tag: string) => {
        const assigned = clip.tags ? clip.tags.split(',').filter(Boolean) : [];
        const updated = assigned.includes(tag)
            ? assigned.filter((t) => t !== tag)
            : [...assigned, tag];
        const tagsString = updated.join(',');

        try {
            const res = await fetch(`${apiBase}/clips/${clip.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tags: tagsString }),
            });
            if (!res.ok) throw new Error('Update tags failed');
            onRefresh();
        } catch (err) {
            onShowAlert('Error', 'Failed to update tags.', 'error');
        }
    };

    const handleRemoveTag = async (clip: Clip, tagToRemove: string) => {
        const assigned = clip.tags ? clip.tags.split(',').filter(Boolean) : [];
        const updated = assigned.filter((t) => t !== tagToRemove);
        const tagsString = updated.join(',');

        try {
            const res = await fetch(`${apiBase}/clips/${clip.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tags: tagsString }),
            });
            if (!res.ok) throw new Error('Remove tag failed');
            onRefresh();
        } catch (err) {
            onShowAlert('Error', 'Failed to remove tag.', 'error');
        }
    };

    const toggleSelection = (id: number) => {
        if (selectedIds.includes(id)) {
            onSelectionChange(selectedIds.filter((sid) => sid !== id));
        } else {
            onSelectionChange([...selectedIds, id]);
        }
    }; if (clips.length === 0) {
        return (
            <div className={styles.emptyState}>
                <ClipboardTextIcon size={64} weight="duotone" className={styles.emptyIcon} />
                <h3>No Clips Captured</h3>
                <p>Start copying text or taking screenshots to build up your history.</p>
            </div>
        );
    }

    return (
        <div className={styles.list}>
            {clips.map((clip) => {
                const isSelected = selectedIds.includes(clip.id);
                const assignedTags = clip.tags ? clip.tags.split(',').filter(Boolean) : [];
                const sensitive = isSensitive(clip.content);
                const isMasked = sensitive && !unmaskedIds.includes(clip.id);

                return (
                    <div key={clip.id} className={`${styles.card} ${isSelected ? styles.cardSelected : ''}`}>
                        <div className={styles.content}>
                            {editingId === clip.id ? (
                                <div className={styles.editForm} onClick={(e) => e.stopPropagation()}>
                                    <textarea
                                        title='inlinedit'
                                        value={editText}
                                        onChange={(e) => setEditText(e.target.value)}
                                        className={styles.editTextarea}
                                        rows={4}
                                        autoFocus
                                    />
                                    <div className={styles.editActions}>
                                        <Button onClick={() => handleSaveEdit(clip.id)} size="sm" variant="primary">
                                            Save
                                        </Button>
                                        <Button onClick={() => setEditingId(null)} size="sm" variant="outline">
                                            Cancel
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div onClick={() => copyToClipboard(clip.content)} style={{ cursor: 'pointer' }}>
                                        {clip.content.startsWith('[FILE]:') ? (
                                            (() => {
                                                const filePath = clip.content.substring(7);
                                                return (
                                                    <div className={styles.imagePreviewContainer}>
                                                        <img
                                                            src={`${apiBase}/view-image?path=${encodeURIComponent(filePath)}`}
                                                            alt="Screenshot"
                                                            className={styles.imagePreview}
                                                            loading="lazy"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                copyImageToClipboard(filePath);
                                                            }}
                                                        />
                                                        <div className={styles.filePathLabel} title={filePath}>
                                                            <FileImageIcon size={18} weight="duotone" />
                                                            <span>{filePath.split(/[\\/]/).pop()}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })()
                                        ) : isCode(clip.content) && !isMasked ? (
                                            <CodeBlock content={clip.content} />
                                        ) : (
                                            <p className={styles.contentText}>
                                                {isColor(clip.content) && !isMasked && (
                                                    <span
                                                        className={styles.colorSwatch}
                                                        style={{ backgroundColor: clip.content.trim() }}
                                                    />
                                                )}
                                                {isMasked ? '•••••••••••••••• (Masked)' : clip.content}
                                            </p>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                        <div className={styles.tagsContainer}>
                            {assignedTags.map((tag) => (
                                <span key={tag} className={styles.tagBadge}>
                                    <TagIcon size={12} weight="duotone" />
                                    <span>{tag}</span>
                                    <button
                                        className={styles.removeTagBtn}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveTag(clip, tag);
                                        }}
                                        title={`Remove ${tag}`}
                                    >
                                        <XIcon size={12} weight="bold" />
                                    </button>
                                </span>
                            ))}
                            <div className={styles.tagSelectorWrapper}>
                                <button
                                    className={styles.addTagButton}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveTagMenuId(activeTagMenuId === clip.id ? null : clip.id);
                                    }}
                                >
                                    <PlusIcon size={12} weight="bold" />
                                    <span>Tag</span>
                                </button>
                                {activeTagMenuId === clip.id && (
                                    <>
                                        <div
                                            style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveTagMenuId(null);
                                            }}
                                        />
                                        <div className={styles.tagDropdown} style={{ zIndex: 100 }}>
                                            {availableTags.map((tag) => {
                                                const isAssigned = assignedTags.includes(tag);
                                                return (
                                                    <div
                                                        key={tag}
                                                        className={`${styles.tagDropdownItem} ${isAssigned ? styles.tagDropdownItemActive : ''
                                                            }`}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleToggleTag(clip, tag);
                                                        }}
                                                    >
                                                        {isAssigned ? (
                                                            <CheckSquareIcon size={18} weight="fill" className={styles.tagSelectIconActive} />
                                                        ) : (
                                                            <SquareIcon size={18} weight="duotone" className={styles.tagSelectIcon} />
                                                        )}
                                                        <span>{tag}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className={styles.actions}>
                            <button
                                onClick={() => toggleSelection(clip.id)}
                                className={styles.rowSelectBtn}
                                aria-label="Select clip"
                            >
                                {isSelected ? (
                                    <CheckSquareIcon size={24} weight="fill" className={styles.rowSelectIconActive} />
                                ) : (
                                    <SquareIcon size={24} weight="duotone" className={styles.rowSelectIcon} />
                                )}
                            </button>
                            {editingId !== clip.id && isUrl(clip.content) && (
                                <Button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenLink(clip.content);
                                    }}
                                    variant="outline"
                                    size="sm"
                                    className={styles.actionBtn}
                                    title="Open Link in Browser"
                                >
                                    <ArrowSquareOutIcon size={16} weight="duotone" />
                                    <span>Open Link</span>
                                </Button>
                            )}
                            {editingId !== clip.id && isFilePath(clip.content) && (
                                <Button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleReveal(clip.content);
                                    }}
                                    variant="outline"
                                    size="sm"
                                    className={styles.actionBtn}
                                    title="Reveal in File Explorer"
                                >
                                    <FolderOpenIcon size={16} weight="duotone" />
                                    <span>Reveal</span>
                                </Button>
                            )}
                            {editingId !== clip.id && isJson(clip.content) && (
                                <Button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleFormatJson(clip.id, clip.content);
                                    }}
                                    variant="outline"
                                    size="sm"
                                    className={styles.actionBtn}
                                    title="Format JSON"
                                >
                                    <BracketsCurlyIcon size={16} weight="duotone" />
                                    <span>Format JSON</span>
                                </Button>
                            )}
                            {!clip.content.startsWith('[FILE]:') && editingId !== clip.id && (
                                <Button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingId(clip.id);
                                        setEditText(clip.content);
                                    }}
                                    variant="outline"
                                    size="sm"
                                    className={styles.actionBtn}
                                    title="Edit Clip"
                                >
                                    <EditIcon size={16} weight="duotone" />
                                    <span>Edit</span>
                                </Button>
                            )}
                            {sensitive && editingId !== clip.id && (
                                <Button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleMask(clip.id);
                                    }}
                                    variant="outline"
                                    size="sm"
                                    className={styles.actionBtn}
                                    title={isMasked ? "Show Content" : "Hide Content"}
                                >
                                    {isMasked ? (
                                        <>
                                            <EyeIcon size={16} weight="duotone" />
                                            <span>Show</span>
                                        </>
                                    ) : (
                                        <>
                                            <EyeSlashIcon size={16} weight="duotone" />
                                            <span>Hide</span>
                                        </>
                                    )}
                                </Button>
                            )}
                            {editingId !== clip.id && (
                                <Button
                                    onClick={() => togglePin(clip.id, clip.pinned)}
                                    variant={clip.pinned ? 'primary' : 'outline'}
                                    semantic={clip.pinned ? 'warning' : 'default'}
                                    size="sm"
                                    className={styles.actionBtn}
                                >
                                    <PushPinIcon size={16} weight={clip.pinned ? 'fill' : 'duotone'} />
                                    <span>{clip.pinned ? 'Unpin' : 'Pin'}</span>
                                </Button>
                            )}
                            {editingId !== clip.id && (
                                <Button
                                    onClick={() => deleteClip(clip.id)}
                                    variant="outline"
                                    semantic="danger"
                                    size="sm"
                                    className={styles.actionBtn}
                                >
                                    <TrashIcon size={16} weight="duotone" />
                                    <span>Delete</span>
                                </Button>
                            )}
                        </div>
                        <small className={styles.date}>{formatDate(clip.createdAt)}</small>
                    </div>
                );
            })}
        </div>
    );
}

