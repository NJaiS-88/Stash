export default function ConnectFolder({ onConnectFolder, loading, error }) {
    return (
        <div className="auth-wrapper" style={{ minHeight: '65vh' }}>
            <div className="auth-card" style={{ maxWidth: '440px', textAlign: 'center', padding: '44px 36px' }}>
                <div style={{ fontSize: '2rem', marginBottom: '12px' }}>📁</div>
                
                <h2 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '8px', color: 'var(--text-primary)' }}>
                    My Private Gallery
                </h2>

                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <span>🔒</span>
                    <span>Images remain on your device</span>
                </p>

                {error && (
                    <div className="alert-error" style={{ textAlign: 'left', marginBottom: '20px' }}>
                        <span>⚠</span>
                        <span>{error}</span>
                    </div>
                )}

                <button 
                    onClick={onConnectFolder}
                    disabled={loading}
                    className="auth-btn"
                    style={{ 
                        fontSize: '0.95rem', 
                        padding: '12px 24px', 
                        cursor: loading ? 'not-allowed' : 'pointer',
                        opacity: loading ? 0.7 : 1
                    }}
                >
                    {loading ? 'Reading folder...' : 'Connect Folder'}
                </button>

                <p style={{ marginTop: '20px', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                    Select a local folder on your computer. Stash never uploads your photos to any server.
                </p>
            </div>
        </div>
    );
}
