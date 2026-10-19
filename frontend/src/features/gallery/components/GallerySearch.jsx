export default function GallerySearch({ searchQuery, setSearchQuery, totalItems }) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
            marginBottom: '24px'
        }}>
            <div style={{ position: 'relative', flex: '1', minWidth: '240px', maxWidth: '420px' }}>
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
                    placeholder="Search files or folders..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ paddingLeft: '34px' }}
                />
            </div>
            {totalItems !== undefined && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <span>{totalItems} item{totalItems === 1 ? '' : 's'}</span>
                </div>
            )}
        </div>
    );
}
