import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import Navbar from '../../auth/components/Navbar';
import ConnectFolder from '../components/ConnectFolder';
import GalleryGrid from '../components/GalleryGrid';
import GallerySearch from '../components/GallerySearch';
import SemanticSearchResults from '../components/SemanticSearchResults';
import PrivateAiBanner from '../components/PrivateAiBanner';
import AiIndexingBanner from '../components/AiIndexingBanner';
import { useGallery } from '../hooks/useGallery';
import { isMobileOrTabletDevice } from '../services/fileSystem';
import { semanticSearch } from '../services/gallery.api';

export default function Gallery() {
    const isMobile = isMobileOrTabletDevice();
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
    const [semanticResults, setSemanticResults] = useState(null);
    const [isSemanticSearching, setIsSemanticSearching] = useState(false);
    const [semanticQuery, setSemanticQuery] = useState('');
    const navigate = useNavigate();

    const handleSemanticSearch = async (queryText) => {
        if (!queryText || !queryText.trim()) return;
        setIsSemanticSearching(true);
        setSemanticQuery(queryText.trim());
        try {
            const data = await semanticSearch(queryText.trim(), 30);
            setSemanticResults(data.results || []);
        } catch (err) {
            console.error('Semantic search error:', err);
            setSemanticResults([]);
        } finally {
            setIsSemanticSearching(false);
        }
    };

    const handleClearSemanticSearch = () => {
        setSemanticResults(null);
        setSemanticQuery('');
    };

    return (
        <div className="page-container">
            <Navbar />

            <main style={{ maxWidth: '1100px', margin: '32px auto', padding: '0 24px', width: '100%' }}>
                <PrivateAiBanner />
                <AiIndexingBanner />

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
                            {!isMobile && (
                                <button onClick={addFolder} className="btn-logout" style={{ fontSize: '0.9rem' }}>
                                    + Connect Another Folder
                                </button>
                            )}
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
                                    onSemanticSearch={handleSemanticSearch}
                                    isSemanticSearching={isSemanticSearching}
                                />

                                {semanticResults !== null ? (
                                    <SemanticSearchResults
                                        results={semanticResults}
                                        query={semanticQuery}
                                        loading={isSemanticSearching}
                                        onClear={handleClearSemanticSearch}
                                    />
                                ) : (
                                    <GalleryGrid
                                        entries={activeFolder.entries || []}
                                        flatFiles={activeFolder.flatFiles || []}
                                        imageRecords={activeFolder.imageRecords || []}
                                        rootHandle={activeFolder.handle}
                                        searchQuery={searchQuery}
                                    />
                                )}
                            </>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
