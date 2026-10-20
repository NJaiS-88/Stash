import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import Navbar from '../../auth/components/Navbar';
import ConnectFolder from '../components/ConnectFolder';
import GalleryGrid from '../components/GalleryGrid';
import GallerySearch from '../components/GallerySearch';
import PrivateAiBanner from '../components/PrivateAiBanner';
import { useGallery } from '../hooks/useGallery';

export default function Gallery() {
    const {
        folders,
        activeFolder,
        selectFolder,
        addFolder,
        removeFolder,
        indexingState,
        isAIPaused,
        pauseAIIndexing,
        resumeAIIndexing,
        loading,
        error
    } = useGallery();

    const [searchQuery, setSearchQuery] = useState('');
    const navigate = useNavigate();

    return (
        <div className="page-container">
            <Navbar />

            <main style={{ maxWidth: '1100px', margin: '32px auto', padding: '0 24px', width: '100%' }}>
                <PrivateAiBanner />

                {!activeFolder ? (
                    folders.length === 0 ? (
                        <ConnectFolder 
                            onConnectFolder={addFolder} 
                            loading={loading} 
                            error={error} 
                        />
                    ) : (
                        <div style={{ textAlign: 'center', padding: '40px 0' }}>
                            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '8px' }}>
                                Select a Connected Folder
                            </h2>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.9rem' }}>
                                Choose one of your connected folders or connect a new one.
                            </p>
                            <div className="dashboard-grid" style={{ maxWidth: '800px', margin: '0 auto 24px' }}>
                                {folders.map(f => (
                                    <div key={f.id} className="dashboard-card" style={{ textAlign: 'left' }}>
                                        <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>📁</div>
                                        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '4px' }}>{f.name}</h3>
                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                                            {f.fileCount} photos detected
                                        </p>
                                        <button 
                                            onClick={() => selectFolder(f.id)} 
                                            className="btn-nav-primary"
                                            style={{ width: '100%', fontSize: '0.85rem' }}
                                        >
                                            Open Folder
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <button onClick={addFolder} className="btn-logout" style={{ fontSize: '0.9rem' }}>
                                + Connect Another Folder
                            </button>
                        </div>
                    )
                ) : (
                    <div>
                        {/* Connected folder banner */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '16px',
                            backgroundColor: 'var(--bg-surface)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius)',
                            padding: '20px 24px',
                            marginBottom: '24px',
                            boxShadow: 'var(--shadow-subtle)'
                        }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '1.25rem' }}>📁</span>
                                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                        {activeFolder.name}
                                    </h2>

                                    {/* Real-time AI Indexing Status Badge */}
                                    {indexingState?.isIndexing && (
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            backgroundColor: indexingState.activeEngine === 'local' ? '#f0fdf4' : '#eff6ff',
                                            border: `1px solid ${indexingState.activeEngine === 'local' ? '#bbf7d0' : '#bfdbfe'}`,
                                            borderRadius: '20px',
                                            padding: '3px 10px',
                                            fontSize: '0.75rem',
                                            color: indexingState.activeEngine === 'local' ? '#166534' : '#1d4ed8'
                                        }}>
                                            <span style={{ fontWeight: 600 }}>
                                                {indexingState.activeEngine === 'local' ? '🟢 Local AI' : '⚡ Browser AI'}: {indexingState.current}/{indexingState.total}
                                            </span>
                                            <button
                                                onClick={pauseAIIndexing}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    color: indexingState.activeEngine === 'local' ? '#15803d' : '#2563eb',
                                                    textDecoration: 'underline',
                                                    fontSize: '0.72rem',
                                                    padding: 0
                                                }}
                                            >
                                                Pause
                                            </button>
                                        </div>
                                    )}

                                    {isAIPaused && (
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            backgroundColor: '#fffbeb',
                                            border: '1px solid #fde68a',
                                            borderRadius: '20px',
                                            padding: '3px 10px',
                                            fontSize: '0.75rem',
                                            color: '#b45309'
                                        }}>
                                            <span>⏸ Paused</span>
                                            <button
                                                onClick={resumeAIIndexing}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    color: '#b45309',
                                                    textDecoration: 'underline',
                                                    fontSize: '0.72rem',
                                                    padding: 0
                                                }}
                                            >
                                                Resume
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                    🔒 Local files only — never uploaded to any server.
                                </p>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                {folders.length > 1 && (
                                    <select
                                        value={activeFolder.id}
                                        onChange={(e) => selectFolder(e.target.value)}
                                        className="form-input"
                                        style={{ padding: '6px 12px', fontSize: '0.85rem', width: 'auto' }}
                                    >
                                        {folders.map(f => (
                                            <option key={f.id} value={f.id}>
                                                📁 {f.name}
                                            </option>
                                        ))}
                                    </select>
                                )}

                                <button
                                    onClick={addFolder}
                                    className="btn-nav-primary"
                                    style={{ fontSize: '0.85rem' }}
                                >
                                    + Add Folder
                                </button>

                                <Link
                                    to="/dashboard"
                                    className="btn-logout"
                                    style={{ fontSize: '0.85rem' }}
                                >
                                    Dashboard
                                </Link>

                                <button
                                    onClick={() => removeFolder(activeFolder.id)}
                                    className="btn-logout"
                                    style={{ fontSize: '0.85rem' }}
                                    title="Disconnect this folder"
                                >
                                    Disconnect
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="alert-error">
                                <span>⚠</span>
                                <span>{error}</span>
                            </div>
                        )}

                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)' }}>
                                Scanning directory...
                            </div>
                        ) : (
                            <>
                                <GallerySearch
                                    searchQuery={searchQuery}
                                    setSearchQuery={setSearchQuery}
                                    totalItems={activeFolder.imageRecords?.length || activeFolder.fileCount || 0}
                                />
                                <GalleryGrid
                                    entries={activeFolder.entries || []}
                                    flatFiles={activeFolder.flatFiles || []}
                                    imageRecords={activeFolder.imageRecords || []}
                                    rootHandle={activeFolder.handle}
                                    searchQuery={searchQuery}
                                />
                            </>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
