import LocalSearchImage from './LocalSearchImage';

/**
 * Phase 35 — Semantic Search Results Grid
 *
 * Visualizes the privacy separation:
 * 1. Pinecone determines which photos are semantically relevant (returns imageId + score).
 * 2. LocalSearchImage executes the local resolution pipeline:
 *    imageId -> IndexedDB (folderId + relativePath) -> FileSystemDirectoryHandle -> File -> Blob URL -> <img>
 *
 * No photos ever touch the cloud or network.
 */
export default function SemanticSearchResults({
    results = [],
    query = '',
    loading = false,
    onClear = () => {}
}) {
    if (loading) {
        return (
            <div style={{
                textAlign: 'center',
                padding: '48px 24px',
                backgroundColor: 'var(--bg-surface)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border-color)',
                marginBottom: '24px'
            }}>
                <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🔮</div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Searching semantic vectors in Pinecone...
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Computing dense text embedding and querying private user namespace.
                </p>
            </div>
        );
    }

    return (
        <div style={{ marginBottom: '32px' }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius)',
                padding: '16px 20px',
                marginBottom: '20px',
                boxShadow: 'var(--shadow-subtle)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.4rem' }}>✨</span>
                    <div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            Semantic Search Results for: &ldquo;{query}&rdquo;
                        </h3>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            Found {results.length} match{results.length === 1 ? '' : 'es'} ranked by vector similarity &bull; 🔒 Rendered locally on device
                        </p>
                    </div>
                </div>

                <button
                    onClick={onClear}
                    className="btn-logout"
                    style={{ fontSize: '0.85rem', padding: '6px 14px' }}
                >
                    ✕ Clear Search
                </button>
            </div>

            {results.length === 0 ? (
                <div style={{
                    textAlign: 'center',
                    padding: '40px 24px',
                    backgroundColor: 'var(--bg-surface)',
                    borderRadius: 'var(--radius)',
                    border: '1px dashed var(--border-color)',
                    color: 'var(--text-muted)'
                }}>
                    <span style={{ fontSize: '2rem' }}>🔍</span>
                    <p style={{ fontSize: '0.95rem', fontWeight: 500, marginTop: '8px' }}>
                        No photos matched &ldquo;{query}&rdquo;
                    </p>
                    <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                        Try a different natural language description (e.g. &ldquo;beach sunset&rdquo;, &ldquo;people laughing&rdquo;, &ldquo;mountain hike&rdquo;).
                    </p>
                </div>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: '20px'
                }}>
                    {results.map((item) => (
                        <div
                            key={item.imageId}
                            style={{
                                backgroundColor: 'var(--bg-surface)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius)',
                                overflow: 'hidden',
                                display: 'flex',
                                flexDirection: 'column',
                                boxShadow: 'var(--shadow-subtle)',
                                position: 'relative'
                            }}
                        >
                            {/* Similarity Score Badge */}
                            <div style={{
                                position: 'absolute',
                                top: '10px',
                                right: '10px',
                                zIndex: 2,
                                backgroundColor: 'rgba(15, 23, 42, 0.85)',
                                backdropFilter: 'blur(4px)',
                                color: '#38bdf8',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                padding: '3px 8px',
                                borderRadius: '12px',
                                border: '1px solid rgba(56, 189, 248, 0.3)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}>
                                <span>🎯</span>
                                <span>{Math.round((item.score || 0) * 100)}%</span>
                            </div>

                            {/* Phase 35: Local Search Image Resolver */}
                            <div style={{ width: '100%', height: '190px', backgroundColor: '#0f172a' }}>
                                <LocalSearchImage
                                    imageId={item.imageId}
                                    alt={item.caption || 'Search result photo'}
                                />
                            </div>

                            {/* Metadata Card Footer */}
                            <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                        ID: {item.imageId.slice(0, 12)}...
                                    </span>
                                    <span style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 600 }}>
                                        ✓ Local
                                    </span>
                                </div>

                                {item.caption && (
                                    <p style={{
                                        fontSize: '0.82rem',
                                        color: 'var(--text-primary)',
                                        lineHeight: 1.4,
                                        marginTop: '4px',
                                        display: '-webkit-box',
                                        WebkitLineClamp: 3,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden'
                                    }}>
                                        &ldquo;{item.caption}&rdquo;
                                    </p>
                                )}

                                {item.keywords && item.keywords.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
                                        {item.keywords.slice(0, 3).map((kw) => (
                                            <span
                                                key={kw}
                                                style={{
                                                    fontSize: '0.65rem',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    backgroundColor: '#f1f5f9',
                                                    color: '#475569',
                                                    border: '1px solid #e2e8f0'
                                                }}
                                            >
                                                #{kw}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
