export default function GallerySearch({
    searchQuery,
    setSearchQuery,
    totalItems,
    onSemanticSearch = null,
    isSemanticSearching = false
}) {
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && onSemanticSearch && searchQuery.trim()) {
            e.preventDefault();
            onSemanticSearch(searchQuery.trim());
        }
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
            marginBottom: '24px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1', minWidth: '280px', maxWidth: '520px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                    <span style={{
                        position: 'absolute',
                        left: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--text-muted)',
                        fontSize: '0.9rem',
                        pointerEvents: 'none'
                    }}>
                        🔍
                    </span>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Search photos or describe (e.g. beach at sunset)..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        style={{ paddingLeft: '34px' }}
                    />
                </div>

                {onSemanticSearch && (
                    <button
                        onClick={() => searchQuery.trim() && onSemanticSearch(searchQuery.trim())}
                        disabled={!searchQuery.trim() || isSemanticSearching}
                        className="btn-nav-primary"
                        style={{
                            fontSize: '0.82rem',
                            padding: '8px 14px',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: (!searchQuery.trim() || isSemanticSearching) ? 'not-allowed' : 'pointer',
                            opacity: (!searchQuery.trim() || isSemanticSearching) ? 0.6 : 1
                        }}
                        title="Search using Pinecone semantic vector AI"
                    >
                        <span>✨</span>
                        <span>{isSemanticSearching ? 'Searching...' : 'AI Search'}</span>
                    </button>
                )}
            </div>

            {totalItems !== undefined && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <span>{totalItems} item{totalItems === 1 ? '' : 's'}</span>
                </div>
            )}
        </div>
    );
}
