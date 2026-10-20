import { useState, useEffect, useRef } from 'react';
import { getFileFromHandle, resolveFileByPath } from '../services/fileSystem';

function TreeItem({ item, depth = 0 }) {
    const isDir = item.kind === 'directory';

    return (
        <div style={{ marginLeft: `${depth * 20}px`, marginTop: '4px' }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 10px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: isDir ? 'rgba(15, 23, 42, 0.02)' : 'transparent',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                color: isDir ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: isDir ? 600 : 400
            }}>
                <span>{isDir ? '📁' : (item.isImage ? '🖼️' : '📄')}</span>
                <span>{item.name}{isDir ? '/' : ''}</span>
            </div>

            {isDir && item.children && (
                <div>
                    {item.children.map((child, idx) => (
                        <TreeItem key={child.path || idx} item={child} depth={depth + 1} />
                    ))}
                </div>
            )}
        </div>
    );
}

function ThumbnailCard({ record, fileItem, rootHandle }) {
    const [imgUrl, setImgUrl] = useState(null);
    const [isVisible, setIsVisible] = useState(false);
    const cardRef = useRef(null);
    const activeUrlRef = useRef(null);

    const displayName = record?.fileName || fileItem?.name || record?.relativePath || 'Photo';
    const displayPath = record?.relativePath || fileItem?.path || '';
    const displaySize = record?.size || fileItem?.size || 0;

    const formatSize = (bytes) => {
        if (!bytes) return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    // Viewport-based IntersectionObserver: only resolve file and create Blob URL when on screen
    useEffect(() => {
        const el = cardRef.current;
        if (!el) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                setIsVisible(entry.isIntersecting);
            },
            { rootMargin: '200px' } // Pre-load 200px before scrolling into view
        );

        observer.observe(el);

        return () => {
            observer.disconnect();
            if (activeUrlRef.current) {
                URL.revokeObjectURL(activeUrlRef.current);
                activeUrlRef.current = null;
            }
        };
    }, []);

    // Resolve file and manage Blob URL lifetime strictly tied to viewport visibility
    useEffect(() => {
        let isMounted = true;

        if (isVisible) {
            const loadPreview = async () => {
                try {
                    let file = null;
                    if (rootHandle && record?.relativePath) {
                        file = await resolveFileByPath(rootHandle, record.relativePath);
                    } else if (fileItem?.handle) {
                        file = await getFileFromHandle(fileItem.handle);
                    }

                    if (!file || !isMounted) return;

                    // Revoke old URL if any
                    if (activeUrlRef.current) {
                        URL.revokeObjectURL(activeUrlRef.current);
                    }

                    const createdUrl = URL.createObjectURL(file);
                    activeUrlRef.current = createdUrl;
                    setImgUrl(createdUrl);
                } catch (err) {
                    console.warn('Could not load thumbnail for:', displayName, err);
                }
            };

            loadPreview();
        } else {
            // Off-screen: revoke Blob URL immediately to free memory
            if (activeUrlRef.current) {
                URL.revokeObjectURL(activeUrlRef.current);
                activeUrlRef.current = null;
                setImgUrl(null);
            }
        }

        return () => {
            isMounted = false;
        };
    }, [isVisible, record?.relativePath, rootHandle, fileItem]);

    return (
        <div
            ref={cardRef}
            style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: 'var(--shadow-subtle)',
                minHeight: '260px'
            }}
        >
            <div style={{
                width: '100%',
                height: '180px',
                backgroundColor: '#f3f4f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden'
            }}>
                {imgUrl ? (
                    <img
                        src={imgUrl}
                        alt={displayName}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        loading="lazy"
                    />
                ) : (
                    <span style={{ fontSize: '2rem', opacity: isVisible ? 0.6 : 0.2 }}>🖼️</span>
                )}
            </div>
            <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <p style={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                }} title={displayName}>
                    {displayName}
                </p>
                <p style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginTop: '2px'
                }}>
                    {displayPath}
                </p>

                {/* AI Caption & Keyword Tags */}
                {record?.caption && (
                    <p style={{
                        fontSize: '0.78rem',
                        color: 'var(--text-secondary)',
                        fontStyle: 'italic',
                        marginTop: '6px',
                        lineHeight: 1.3,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                    }} title={record.caption}>
                        "{record.caption}"
                    </p>
                )}

                {record?.keywords && record.keywords.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                        {record.keywords.slice(0, 4).map(kw => (
                            <span key={kw} style={{
                                fontSize: '0.65rem',
                                padding: '1px 5px',
                                borderRadius: '3px',
                                backgroundColor: '#f1f5f9',
                                color: '#475569',
                                border: '1px solid #e2e8f0'
                            }}>
                                #{kw}
                            </span>
                        ))}
                    </div>
                )}

                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 'auto',
                    paddingTop: '8px',
                    borderTop: '1px solid #f1f5f9',
                    fontSize: '0.72rem',
                    color: 'var(--text-muted)'
                }}>
                    <span>{formatSize(displaySize)}</span>
                    <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: record?.indexingStatus === 'indexed' ? '#ecfdf5' : '#fffbeb',
                        color: record?.indexingStatus === 'indexed' ? '#059669' : '#b45309',
                        border: `1px solid ${record?.indexingStatus === 'indexed' ? '#a7f3d0' : '#fde68a'}`
                    }}>
                        {record?.indexingStatus === 'indexed' ? '✨ Indexed' : (record ? '⏳ Pending AI' : 'Ready')}
                    </span>
                </div>
            </div>
        </div>
    );
}

export default function GalleryGrid({
    entries = [],
    flatFiles = [],
    imageRecords = [],
    rootHandle = null,
    searchQuery = ''
}) {
    const [viewMode, setViewMode] = useState('grid');
    const [visibleCount, setVisibleCount] = useState(60);
    const sentinelRef = useRef(null);

    // Build unified item list: prefer imageRecords (lightweight DB models), fallback to flatFiles
    const recordMap = new Map(imageRecords.map(r => [r.relativePath, r]));

    const sourceItems = imageRecords.length > 0
        ? imageRecords.map(rec => ({
            id: rec.id || rec.relativePath,
            record: rec,
            fileItem: null,
            name: rec.fileName || rec.relativePath,
            path: rec.relativePath
        }))
        : flatFiles.map((file, idx) => ({
            id: file.path || idx,
            record: recordMap.get(file.path),
            fileItem: file,
            name: file.name,
            path: file.path
        }));

    // Filter items based on user search query
    const filteredItems = searchQuery
        ? sourceItems.filter(item => {
            const query = searchQuery.toLowerCase();
            const matchesName = item.name.toLowerCase().includes(query) || item.path.toLowerCase().includes(query);
            const matchesCaption = item.record?.caption?.toLowerCase().includes(query);
            const matchesKeywords = item.record?.keywords?.some(k => k.toLowerCase().includes(query));
            return matchesName || matchesCaption || matchesKeywords;
        })
        : sourceItems;

    // Windowed slice of items currently rendered in DOM
    const visibleItems = filteredItems.slice(0, visibleCount);

    // Sentinel observer to load next batch when scrolling near bottom
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setVisibleCount(prev => Math.min(prev + 60, filteredItems.length));
            }
        }, { rootMargin: '400px' });

        observer.observe(sentinel);

        return () => observer.disconnect();
    }, [filteredItems.length]);

    // Reset pagination when search query or source items change significantly
    useEffect(() => {
        setVisibleCount(60);
    }, [searchQuery, filteredItems.length]);

    return (
        <div>
            {/* View Switcher & Counter */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px',
                paddingBottom: '12px',
                borderBottom: '1px solid var(--border-color)'
            }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => setViewMode('tree')}
                        className={viewMode === 'tree' ? 'btn-nav-primary' : 'btn-logout'}
                        style={{ fontSize: '0.825rem', padding: '6px 14px' }}
                    >
                        Tree View
                    </button>
                    <button
                        onClick={() => setViewMode('grid')}
                        className={viewMode === 'grid' ? 'btn-nav-primary' : 'btn-logout'}
                        style={{ fontSize: '0.825rem', padding: '6px 14px' }}
                    >
                        Photo Grid
                    </button>
                </div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {filteredItems.length} photo{filteredItems.length === 1 ? '' : 's'}
                    {filteredItems.length > visibleCount && ` (showing ${visibleItems.length})`}
                </span>
            </div>

            {viewMode === 'tree' ? (
                /* Hierarchical enumeration view */
                <div style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius)',
                    padding: '24px',
                    boxShadow: 'var(--shadow-subtle)'
                }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>
                        Folder Contents
                    </h3>
                    {entries.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Folder is empty</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {entries.map((item, idx) => (
                                <TreeItem key={item.path || idx} item={item} depth={0} />
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                /* Virtualized image thumbnail grid view */
                <div>
                    {filteredItems.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '40px 0' }}>
                            No photos found.
                        </p>
                    ) : (
                        <>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                gap: '16px'
                            }}>
                                {visibleItems.map(item => (
                                    <ThumbnailCard
                                        key={item.id}
                                        record={item.record}
                                        fileItem={item.fileItem}
                                        rootHandle={rootHandle}
                                    />
                                ))}
                            </div>

                            {/* Sentinel for infinite scroll pagination */}
                            {visibleCount < filteredItems.length && (
                                <div
                                    ref={sentinelRef}
                                    style={{
                                        textAlign: 'center',
                                        padding: '24px 0',
                                        color: 'var(--text-muted)',
                                        fontSize: '0.85rem'
                                    }}
                                >
                                    Loading more photos...
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
