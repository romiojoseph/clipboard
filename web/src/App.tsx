import { useEffect, useMemo, useState, useRef } from 'react';
import {
    Power as PowerIcon,
    CaretDown as CaretDownIcon,
    Funnel as FunnelIcon,
    SortAscending as SortIcon,
    Trash as TrashIcon,
    Plus as PlusIcon,
    CheckSquare as CheckSquareIcon,
    Square as SquareIcon,
    Tag as TagIcon,
    Copy as CopyIcon,
    PushPin as PushPinIcon,
    Export as ExportIcon,
    ArrowsMerge as MergeIcon,
    WarningCircle as WarningCircleIcon
} from '@phosphor-icons/react';
import SearchBar from './components/SearchBar';
import ClipList from './components/ClipList';
import RecordingToggle from './components/RecordingToggle';
import ManualClipForm from './components/ManualClipForm';
import AlertModal from './components/AlertModal';
import Button from './components/Button';
import type { Clip } from './types';
import { getTagIcon } from './utils/tagIcons';
import styles from './App.module.css';

// Hardcoded tags - easily add or remove tags here.
export const AVAILABLE_TAGS = [
    'Work',
    'Personal',
    'Important',
    'Todo',
    'Code',
    'Design',
    'Finance',
    'Shopping',
    'Travel',
    'Health',
    'Education',
    'Research',
    'Reference',
    'Communication',
    'Social',
    'Creative',
    'Media',
    'Legal',
    'Passwords',
    'Addresses',
    'Links',
    'Ideas',
    'Notes',
    'Drafts',
    'Receipts',
    'Paths',
    'Commands',
];

const apiBase = '/api';

function App() {
    const [clips, setClips] = useState<Clip[]>([]);
    const [query, setQuery] = useState('');
    const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState('recent');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [recording, setRecording] = useState(true);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
    const [bulkTagDropdownOpen, setBulkTagDropdownOpen] = useState(false);
    const [addModalOpen, setAddModalOpen] = useState(false);

    const tagsButtonRef = useRef<HTMLButtonElement>(null);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
    const [pendingTags, setPendingTags] = useState<Record<string, 'all' | 'some' | 'none'>>({});

    const handleToggleBulkTagMenu = () => {
        if (!bulkTagDropdownOpen && tagsButtonRef.current) {
            const rect = tagsButtonRef.current.getBoundingClientRect();
            setDropdownPosition({
                top: rect.top,
                right: window.innerWidth - rect.left + 8,
            });

            // Initialize pending states based on selection
            const selectedClips = clips.filter((c) => selectedIds.includes(c.id));
            const initial: Record<string, 'all' | 'some' | 'none'> = {};
            AVAILABLE_TAGS.forEach((tag) => {
                const count = selectedClips.filter((c) => {
                    const assigned = c.tags ? c.tags.split(',').filter(Boolean) : [];
                    return assigned.includes(tag);
                }).length;
                if (count === selectedClips.length) {
                    initial[tag] = 'all';
                } else if (count > 0) {
                    initial[tag] = 'some';
                } else {
                    initial[tag] = 'none';
                }
            });
            setPendingTags(initial);
        }
        setBulkTagDropdownOpen(!bulkTagDropdownOpen);
    };

    // Custom Modal State
    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: 'success' | 'warning' | 'error';
        confirmLabel?: string;
        cancelLabel?: string;
        onConfirm: () => void;
        onCancel?: () => void;
    }>({
        isOpen: false,
        title: '',
        message: '',
        type: 'success',
        onConfirm: () => { },
    });

    const showAlert = (title: string, message: string, type: 'success' | 'warning' | 'error' = 'success') => {
        setModalConfig({
            isOpen: true,
            title,
            message,
            type,
            confirmLabel: 'OK',
            onConfirm: () => setModalConfig((prev) => ({ ...prev, isOpen: false })),
        });
    };

    const showConfirm = (
        title: string,
        message: string,
        type: 'warning' | 'error',
        onConfirm: () => void
    ) => {
        setModalConfig({
            isOpen: true,
            title,
            message,
            type,
            confirmLabel: 'Yes',
            cancelLabel: 'No',
            onConfirm: () => {
                setModalConfig((prev) => ({ ...prev, isOpen: false }));
                onConfirm();
            },
            onCancel: () => setModalConfig((prev) => ({ ...prev, isOpen: false })),
        });
    };

    const fetchClips = async (q = '', isBackground = false, signal?: AbortSignal) => {
        if (!isBackground) setLoading(true);
        setError(null);
        try {
            const params = q ? `?q=${encodeURIComponent(q)}` : '';
            const res = await fetch(`${apiBase}/clips${params}`, { signal });
            if (!res.ok) throw new Error('Failed to load clips');
            const data = await res.json();
            setClips(data || []);
            if (!isBackground) {
                setSelectedIds([]);
            }
        } catch (err) {
            if (err instanceof Error && err.name !== 'AbortError') {
                if (!isBackground) setError(err.message);
            }
        } finally {
            if (!isBackground) setLoading(false);
        }
    };

    const fetchSettings = async () => {
        try {
            const res = await fetch(`${apiBase}/settings`);
            if (!res.ok) throw new Error('Failed to load settings');
            const data = await res.json();
            setRecording(data.recording === 'true');
        } catch (err) {
            console.error('Failed to fetch settings:', err);
        }
    };

    const toggleRecording = async (value: boolean) => {
        try {
            await fetch(`${apiBase}/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recording: value ? 'true' : 'false' }),
            });
            setRecording(value);
        } catch (err) {
            console.error('Failed to toggle recording:', err);
        }
    };

    const handleAddClip = async (content: string) => {
        if (content) {
            try {
                await fetch(`${apiBase}/clips`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content }),
                });
                setAddModalOpen(false);
            } catch (err) {
                console.error('Failed to add clip:', err);
            }
        }
        updateClips();
    };

    const handleClearAll = async () => {
        showConfirm(
            'Clear All Unpinned',
            'Clear all unpinned clips? Pinned clips will be kept.',
            'warning',
            async () => {
                try {
                    const res = await fetch(`${apiBase}/clips`, { method: 'DELETE' });
                    if (!res.ok) throw new Error('Failed to clear unpinned clips');
                    updateClips();
                } catch (err) {
                    showAlert('Error', 'Failed to clear unpinned clips.', 'error');
                }
            }
        );
    };

    const handleShutdown = async () => {
        showConfirm(
            'Shutdown Clipboard',
            'Are you sure you want to shutdown Clipboard? This will terminate all background processes and close the application.',
            'error',
            async () => {
                try {
                    const res = await fetch(`${apiBase}/shutdown`, { method: 'POST' });
                    if (!res.ok) throw new Error(`Server error: ${res.status}`);
                } catch (err: any) {
                    // A network error (ERR_CONNECTION_REFUSED) means the server already
                    // shut down — that's success, not a failure.
                    if (err?.name !== 'TypeError') {
                        showAlert('Error', 'Shutdown failed.', 'error');
                        return;
                    }
                }
                window.close();
                showAlert('Shutdown', 'Clipboard has been shut down. You can close this tab now.', 'success');
            }
        );
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    useEffect(() => {
        fetchClips(query, false);

        let abortController = new AbortController();
        const interval = setInterval(() => {
            abortController.abort();
            abortController = new AbortController();
            fetchClips(query, true, abortController.signal);
        }, 1500);

        return () => {
            clearInterval(interval);
            abortController.abort();
        };
    }, [query]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setSelectedIds([]);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    const sortedClips = useMemo(() => {
        let sorted = [...clips];
        switch (sortBy) {
            case 'oldest':
                sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                break;
            case 'alphabetical':
                sorted.sort((a, b) => a.content.localeCompare(b.content));
                break;
            case 'pinned':
                sorted.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
                break;
            case 'recent':
            default:
                sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }
        return sorted;
    }, [clips, sortBy]);

    const filteredClips = useMemo(() => {
        let result = sortedClips;
        if (selectedTagFilter) {
            result = result.filter((clip) => {
                const assigned = clip.tags ? clip.tags.split(',').filter(Boolean) : [];
                return assigned.includes(selectedTagFilter);
            });
        }
        return result;
    }, [sortedClips, selectedTagFilter]);

    const tagCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        AVAILABLE_TAGS.forEach(tag => {
            counts[tag] = 0;
        });
        clips.forEach(clip => {
            if (clip.tags) {
                clip.tags.split(',').forEach(tag => {
                    const trimmed = tag.trim();
                    if (trimmed) {
                        counts[trimmed] = (counts[trimmed] || 0) + 1;
                    }
                });
            }
        });
        return counts;
    }, [clips]);

    const selectAll = () => {
        if (selectedIds.length === filteredClips.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredClips.map((c) => c.id));
        }
    };

    const bulkDelete = async () => {
        if (!selectedIds.length) return;

        showConfirm(
            'Bulk Delete',
            `Are you sure you want to delete ${selectedIds.length} selected clip(s)?`,
            'error',
            async () => {
                try {
                    await Promise.allSettled(
                        selectedIds.map((id) =>
                            fetch(`${apiBase}/clips/${id}`, { method: 'DELETE' })
                        )
                    );
                    updateClips();
                    setSelectedIds([]);
                } catch (err) {
                    showAlert('Error', 'Bulk delete failed.', 'error');
                }
            }
        );
    };

    const bulkPin = async () => {
        if (!selectedIds.length) return;

        try {
            await Promise.allSettled(
                selectedIds.map((id) => {
                    const clip = clips.find((c) => c.id === id);
                    if (!clip) return Promise.resolve();
                    return fetch(`${apiBase}/clips/${id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ pinned: !clip.pinned }),
                    });
                })
            );
            updateClips();
            showAlert('Success', `Toggled pin for ${selectedIds.length} clip(s).`, 'success');
        } catch (err) {
            showAlert('Error', 'Bulk pin failed.', 'error');
        }
    };

    const bulkCopy = async () => {
        if (!selectedIds.length) return;

        try {
            const selectedClips = clips.filter((c) => selectedIds.includes(c.id));
            const text = selectedClips.map((c) => c.content).join('\n---\n');
            await navigator.clipboard.writeText(text);
            showAlert('Copied', `Copied ${selectedIds.length} clip(s) to clipboard.`, 'success');
        } catch (err) {
            showAlert('Error', 'Bulk copy failed.', 'error');
        }
    };

    const bulkExport = () => {
        if (!selectedIds.length) return;

        try {
            const selectedClips = clips.filter((c) => selectedIds.includes(c.id));
            const text = selectedClips.map((c) => {
                const pinPrefix = c.pinned ? "[PINNED] " : "";
                return `${pinPrefix}${c.content}`;
            }).join('\n---\n');

            const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'selected_clips.txt';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            showAlert('Exported', `Exported ${selectedIds.length} clip(s) to selected_clips.txt.`, 'success');
        } catch (err) {
            showAlert('Error', 'Bulk export failed.', 'error');
        }
    };

    const togglePendingTag = (tag: string) => {
        setPendingTags((prev) => {
            const current = prev[tag];
            const next = current === 'all' || current === 'some' ? 'none' : 'all';
            return { ...prev, [tag]: next };
        });
    };

    const saveBulkTags = async () => {
        if (!selectedIds.length) return;
        const selectedClips = clips.filter((c) => selectedIds.includes(c.id));

        try {
            await Promise.allSettled(
                selectedClips.map((clip) => {
                    const assigned = clip.tags ? clip.tags.split(',').filter(Boolean) : [];
                    let updated = [...assigned];

                    Object.entries(pendingTags).forEach(([tag, state]) => {
                        if (state === 'all') {
                            if (!updated.includes(tag)) {
                                updated.push(tag);
                            }
                        } else if (state === 'none') {
                            updated = updated.filter((t) => t !== tag);
                        }
                    });

                    return fetch(`${apiBase}/clips/${clip.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tags: updated.join(',') }),
                    });
                })
            );

            fetchClips(query, true);
            setSelectedIds([]);
            setBulkTagDropdownOpen(false);
            showAlert('Success', 'Tags updated successfully.', 'success');
        } catch (err) {
            showAlert('Error', 'Failed to save tags.', 'error');
        }
    };

    const bulkMerge = async () => {
        if (selectedIds.length < 2) return;

        // Preserve order as they appear in the current sorted/filtered view
        const selectedClips = filteredClips.filter((c) => selectedIds.includes(c.id));
        const merged = selectedClips.map((c) => c.content).join('\n');

        showConfirm(
            'Merge Clips',
            `Merge ${selectedIds.length} clips into one? The originals will be deleted.`,
            'warning',
            async () => {
                try {
                    // Create the merged clip first
                    await fetch(`${apiBase}/clips`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content: merged }),
                    });
                    // Then delete the originals
                    for (const id of selectedIds) {
                        await fetch(`${apiBase}/clips/${id}`, { method: 'DELETE' });
                    }
                    updateClips();
                    setSelectedIds([]);
                    showAlert('Merged', `${selectedIds.length} clips merged into one.`, 'success');
                } catch (err) {
                    showAlert('Error', 'Merge failed.', 'error');
                }
            }
        );
    };

    const updateClips = () => fetchClips(query, true);

    const sortLabels: Record<string, string> = {
        recent: 'Recent First',
        oldest: 'Oldest First',
        pinned: 'Pinned First',
        alphabetical: 'Alphabetical'
    };

    return (
        <div className={styles.shell}>
            {/* Left Panel: Logo + Tags Sidebar */}
            <aside className={styles.leftPanel}>
                <div className={styles.headerControl}>
                    <img src={"/logo.svg"} alt="logo" className={styles.logo} height={24} />
                    <RecordingToggle recording={recording} onToggle={toggleRecording} />
                </div>
                <div className={styles.tagFilterList}>
                    <button
                        className={`${styles.tagFilterBtn} ${selectedTagFilter === null ? styles.tagFilterBtnActive : ''}`}
                        onClick={() => setSelectedTagFilter(null)}
                    >
                        <TagIcon size={16} weight="duotone" />
                        <span>All Tags</span>
                        <span className={styles.tagFilterCount}>{clips.length}</span>
                    </button>
                    {AVAILABLE_TAGS.map((tag) => {
                        const count = tagCounts[tag] || 0;
                        if (count === 0) return null;
                        const TagIconComponent = getTagIcon(tag);
                        return (
                            <button
                                key={tag}
                                className={`${styles.tagFilterBtn} ${selectedTagFilter === tag ? styles.tagFilterBtnActive : ''}`}
                                onClick={() => setSelectedTagFilter(tag)}
                            >
                                <TagIconComponent size={16} weight={selectedTagFilter === tag ? 'fill' : 'duotone'} />
                                <span>{tag}</span>
                                <span className={styles.tagFilterCount}>{count}</span>
                            </button>
                        );
                    })}
                </div>
            </aside>

            {/* Center Area: Clips List only, no header */}
            <div className={styles.centerArea}>
                <main className={styles.centerPanel}>
                    {error && <div className={styles.error}>{error}</div>}
                    {loading && <div className={styles.status}>Loading…</div>}
                    <ClipList
                        clips={filteredClips}
                        availableTags={AVAILABLE_TAGS}
                        onRefresh={updateClips}
                        apiBase={apiBase}
                        selectedIds={selectedIds}
                        onSelectionChange={setSelectedIds}
                        onShowAlert={showAlert}
                        onShowConfirm={showConfirm}
                    />
                </main>
            </div>

            {/* Right Panel: Add + Search + Sort + Selection + Shutdown */}
            <aside className={styles.rightPanel}>
                {/* Scrollable content */}
                <div className={styles.rightPanelScroll}>
                    {/* Add Clip + Clear row */}
                    <div className={styles.topActionsRow}>
                        <Button onClick={() => setAddModalOpen(true)} variant="primary" className={styles.addClipBtn}>
                            <PlusIcon size={16} weight="bold" />
                            <span>Add Clip</span>
                        </Button>
                        <Button onClick={handleClearAll} variant="outline" semantic="default" className={styles.clearBtn}>
                            <TrashIcon size={16} weight="duotone" />
                            <span>Clear All</span>
                        </Button>
                    </div>

                    <div className={styles.panelDivider} />

                    {/* Search */}
                    <SearchBar query={query} onQueryChange={setQuery} />

                    {/* Sort */}
                    <div className={styles.rightPanelGroup}>
                        <div className={styles.dropdownWrapper}>
                            <button
                                className={styles.sortTriggerBtn}
                                onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
                            >
                                <span>{sortLabels[sortBy]}</span>
                                <CaretDownIcon size={16} weight="bold" />
                            </button>
                            {sortDropdownOpen && (
                                <>
                                    <div className={styles.dropdownOverlay} onClick={() => setSortDropdownOpen(false)} />
                                    <div className={styles.dropdownMenu}>
                                        {Object.entries(sortLabels).map(([value, label]) => (
                                            <button
                                                key={value}
                                                className={`${styles.dropdownItem} ${sortBy === value ? styles.dropdownItemActive : ''}`}
                                                onClick={() => {
                                                    setSortBy(value);
                                                    setSortDropdownOpen(false);
                                                }}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Selection Manager */}
                    <div className={styles.rightPanelGroup}>
                        <div className={styles.selectionManagerBox}>
                            <button onClick={selectAll} className={styles.selectAllBtn}>
                                {selectedIds.length === filteredClips.length && filteredClips.length > 0 ? (
                                    <CheckSquareIcon size={20} weight="fill" className={styles.selectIcon} />
                                ) : (
                                    <SquareIcon size={20} weight="duotone" className={styles.selectIcon} />
                                )}
                                <span className={styles.selectAllText}>
                                    Select All ({selectedIds.length}/{filteredClips.length})
                                </span>
                            </button>

                            <div className={styles.selectionActionsStack}>
                                <button
                                    onClick={bulkCopy}
                                    disabled={selectedIds.length === 0}
                                    className={styles.selectionActionBtn}
                                    title="Copy Selected"
                                >
                                    <CopyIcon size={18} weight="duotone" />
                                    <span>Copy</span>
                                </button>
                                <button
                                    onClick={bulkPin}
                                    disabled={selectedIds.length === 0}
                                    className={styles.selectionActionBtn}
                                    title="Toggle Pin Selected"
                                >
                                    <PushPinIcon size={18} weight="duotone" />
                                    <span>Pin</span>
                                </button>

                                {/* Bulk Tags Menu */}
                                <div className={styles.bulkTagWrapper}>
                                    <button
                                        ref={tagsButtonRef}
                                        onClick={handleToggleBulkTagMenu}
                                        disabled={selectedIds.length === 0}
                                        className={styles.selectionActionBtn}
                                        title="Assign Tags to Selected"
                                    >
                                        <TagIcon size={18} weight="duotone" />
                                        <span>Tags</span>
                                    </button>
                                    {bulkTagDropdownOpen && selectedIds.length > 0 && (
                                        <>
                                            <div
                                                className={styles.dropdownOverlay}
                                                onClick={() => setBulkTagDropdownOpen(false)}
                                            />
                                            <div
                                                className={styles.bulkTagDropdownMenu}
                                                style={{ top: dropdownPosition.top, right: dropdownPosition.right }}
                                            >
                                                <div className={styles.bulkTagDropdownList}>
                                                    {AVAILABLE_TAGS.map((tag) => {
                                                        const tagState = pendingTags[tag] || 'none';
                                                        const isActive = tagState === 'all';
                                                        const isPartial = tagState === 'some';

                                                        return (
                                                            <div
                                                                key={tag}
                                                                className={`${styles.bulkTagDropdownItem} ${isActive ? styles.bulkTagDropdownItemActive : ''}`}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    togglePendingTag(tag);
                                                                }}
                                                            >
                                                                {isActive ? (
                                                                    <CheckSquareIcon size={18} weight="fill" className={styles.tagSelectIconActive} />
                                                                ) : isPartial ? (
                                                                    <CheckSquareIcon size={18} weight="duotone" className={styles.tagSelectIconActive} style={{ opacity: 0.7 }} />
                                                                ) : (
                                                                    <SquareIcon size={18} weight="duotone" className={styles.tagSelectIcon} />
                                                                )}
                                                                <span style={{ flex: 1 }}>{tag}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                <div className={styles.bulkTagDropdownFooter}>
                                                    <button
                                                        className={styles.bulkTagFooterBtnOk}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            saveBulkTags();
                                                        }}
                                                    >
                                                        OK
                                                    </button>
                                                    <button
                                                        className={styles.bulkTagFooterBtnCancel}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setBulkTagDropdownOpen(false);
                                                        }}
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>

                                <button
                                    onClick={bulkExport}
                                    disabled={selectedIds.length === 0}
                                    className={styles.selectionActionBtn}
                                    title="Export Selected"
                                >
                                    <ExportIcon size={18} weight="duotone" />
                                    <span>Export</span>
                                </button>
                                <button
                                    onClick={bulkMerge}
                                    disabled={selectedIds.length < 2}
                                    className={styles.selectionActionBtn}
                                    title="Merge into one clip"
                                >
                                    <MergeIcon size={18} weight="duotone" />
                                    <span>Merge</span>
                                </button>
                                <button
                                    onClick={bulkDelete}
                                    disabled={selectedIds.length === 0}
                                    className={`${styles.selectionActionBtn} ${selectedIds.length > 0 ? styles.selectionActionBtnDanger : ''}`}
                                    title="Delete Selected"
                                >
                                    <TrashIcon size={18} weight="duotone" />
                                    <span>Delete</span>
                                </button>
                            </div>
                        </div>
                    </div>

                </div>{/* end rightPanelScroll */}

                {/* Shutdown — pinned to bottom */}
                <Button onClick={handleShutdown} variant="outline" semantic="danger" title="Shutdown Application" className={styles.shutdownBtn}>
                    <PowerIcon size={20} weight="duotone" />
                    <span>Shutdown</span>
                </Button>
            </aside>

            {/* Add Manual Clip Modal */}
            {addModalOpen && (
                <>
                    <div className={styles.modalOverlay} onClick={() => setAddModalOpen(false)} />
                    <div className={styles.modalContent}>
                        <div className={styles.modalHeader}>
                            <h2>Add Clip Manually</h2>
                            <button className={styles.modalCloseBtn} onClick={() => setAddModalOpen(false)}>&times;</button>
                        </div>
                        <div className={styles.modalBody}>
                            <ManualClipForm onAdd={handleAddClip} apiBase={apiBase} onShowAlert={showAlert} />
                        </div>
                    </div>
                </>
            )}

            <AlertModal
                isOpen={modalConfig.isOpen}
                title={modalConfig.title}
                message={modalConfig.message}
                type={modalConfig.type}
                confirmLabel={modalConfig.confirmLabel}
                cancelLabel={modalConfig.cancelLabel}
                onConfirm={modalConfig.onConfirm}
                onCancel={modalConfig.onCancel}
            />

            {/* Screen Size Warning Overlay (Active under 1024px width) */}
            <div className={styles.sizeWarningOverlay}>
                <WarningCircleIcon size={64} weight="duotone" className={styles.warningIcon} />
                <h2 className={styles.warningHeading}>Window Too Small</h2>
                <p className={styles.warningSubtitle}>
                    This application requires a minimum screen width of 1024px. Please expand your window to continue using Clipboard.
                </p>
            </div>
        </div>
    );
}

export default App;
