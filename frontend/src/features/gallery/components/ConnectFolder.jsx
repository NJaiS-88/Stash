import { isMobileOrTabletDevice } from '../services/fileSystem';

export default function ConnectFolder({ onConnectFolder, loading, error }) {
    const isMobile = isMobileOrTabletDevice();

    return (
        <div className="auth-wrapper" style={{ minHeight: '65vh' }}>
            <div className="auth-card" style={{ maxWidth: '460px', textAlign: 'center', padding: '44px 36px' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '14px' }}>
                    {isMobile ? '💻' : '📁'}
                </div>
                
                <h2 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '8px', color: 'var(--text-primary)' }}>
                    {isMobile ? 'Desktop Computer Required' : 'My Private Gallery'}
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

                {isMobile ? (
                    <div style={{
                        backgroundColor: '#fffbeb',
                        border: '1px solid #fde68a',
                        borderRadius: 'var(--radius)',
                        padding: '16px 20px',
                        marginBottom: '20px',
                        textAlign: 'left'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                            <span style={{ fontSize: '1.2rem' }}>📱</span>
                            <div style={{ fontSize: '0.85rem', color: '#92400e', lineHeight: '1.5' }}>
                                <strong>Mobile & tablet browsers do not support local folder access.</strong>
                                <p style={{ margin: '6px 0 0 0', color: '#b45309' }}>
                                    To connect local photo folders and run private AI indexing, please open Stash on your desktop or laptop computer (Windows, macOS, or Linux).
                                </p>
                            </div>
                        </div>
                    </div>
                ) : (
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
                )}

                <p style={{ marginTop: '20px', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                    {isMobile 
                        ? 'Stash never uploads your photos to any cloud. Access from a desktop browser with Chrome, Edge, or Brave.'
                        : 'Select a local folder on your computer. Stash never uploads your photos to any server.'}
                </p>
            </div>
        </div>
    );
}

