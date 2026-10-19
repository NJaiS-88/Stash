import { useState, useEffect } from 'react';
import { getFileFromHandle } from '../services/fileSystem';

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

function ThumbnailCard({ fileItem, record }) {
    const [imgUrl, setImgUrl] = useState(null);

    const formatSize = (bytes) => {
        if (!bytes) return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    useEffect(() => {
        let isMounted = true;
        let createdUrl = null;

        const loadPreview = async () => {
            if (!fileItem.isImage || !fileItem.handle) return;
            try {
                const file = await getFileFromHandle(fileItem.handle);
                createdUrl = URL.createObjectURL(file);
                if (isMounted) setImgUrl(createdUrl);
            } catch (err) {
                console.warn('Could not load thumbnail for:', fileItem.name, err);
            }
        };

        loadPreview();

        return () => {
            isMounted = false;
            if (createdUrl) URL.revokeObjectURL(createdUrl);
        };
    }, [fileItem]);

    return (
        <div style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: 'var(--shadow-subtle)'
        }}>
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
                        alt={fileItem.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        loading="lazy"
                    />
                ) : (
                    <span style={{ fontSize: '2rem' }}>🖼️</span>
                )}
            </div>
            <div style={{ padding: '12px 14px' }}>
                <p style={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                }} title={fileItem.name}>
                    {fileItem.name}
                </p>
                <p style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginTop: '2px'
                }}>
                    {fileItem.path}
                </p>

                {/* Phase 14: In-Browser AI Caption & Keyword Tags */}
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

                {record && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: '8px',
                        paddingTop: '8px',
                        borderTop: '1px solid #f1f5f9',
                        fontSize: '0.72rem',
                        color: 'var(--text-muted)'
                    }}>
                        <span>{formatSize(record.size)}</span>
                        <span style={{
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: record.indexingStatus === 'indexed' ? '#ecfdf5' : '#fffbeb',
                            color: record.indexingStatus === 'indexed' ? '#059669' : '#b45309',
                            border: `1px solid ${record.indexingStatus === 'indexed' ? '#a7f3d0' : '#fde68a'}`
                        }}>
                            {record.indexingStatus === 'indexed' ? '✨ Indexed' : '⏳ Pending AI'}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function GalleryGrid({ entries, flatFiles, imageRecords = [], searchQuery = '' }) {
    const [viewMode, setViewMode] = useState('grid');

    const recordMap = new Map(imageRecords.map(r => [r.relativePath, r]));

    const filteredFiles = searchQuery
        ? flatFiles.filter(f => {
            const query = searchQuery.toLowerCase();
            const rec = recordMap.get(f.path);
            const matchesName = f.name.toLowerCase().includes(query) || f.path.toLowerCase().includes(query);
            const matchesCaption = rec?.caption?.toLowerCase().includes(query);
            const matchesKeywords = rec?.keywords?.some(k => k.toLowerCase().includes(query));
            return matchesName || matchesCaption || matchesKeywords;
        })
        : flatFiles;

    return (
        <div>
            {/* View Switcher */}
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
                    {flatFiles.length} file{flatFiles.length === 1 ? '' : 's'} detected
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
                /* Image thumbnail grid view */
                <div>
                    {filteredFiles.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '40px 0' }}>
                            No files found.
                        </p>
                    ) : (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                            gap: '16px'
                        }}>
                            {filteredFiles.map((file, idx) => (
                                <ThumbnailCard
                                    key={file.path || idx}
                                    fileItem={file}
                                    record={recordMap.get(file.path)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
