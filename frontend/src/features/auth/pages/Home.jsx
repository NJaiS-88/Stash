import Navbar from '../components/Navbar';
import { Link, useNavigate } from 'react-router';
import { useGallery } from '../../gallery/hooks/useGallery';

const Home = () => {
    const { folders, addFolder, selectFolder, removeFolder, loading } = useGallery();
    const navigate = useNavigate();

    const handleConnectNew = async () => {
        const added = await addFolder();
        if (added) {
            navigate('/gallery');
        }
    };

    const handleOpenFolder = async (folderId) => {
        await selectFolder(folderId);
        navigate('/gallery');
    };

    const handleDisconnect = async (folderId, e) => {
        e.stopPropagation();
        await removeFolder(folderId);
    };

    return (
        <div className="page-container">
            <Navbar />

            {/* Hero Section */}
            <section className="hero-section" style={{ paddingBottom: '32px' }}>
                <div className="hero-pill">
                    <span>🔒</span>
                    <span>100% Private & Local-First</span>
                </div>
                <h1 className="hero-title">
                    Your photos. Your device. Powered by local AI.
                </h1>
                <p className="hero-subtitle">
                    Connect your local folders to index, search, and browse your photo collection without uploading a single byte to the cloud.
                </p>
                <div className="hero-cta" style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button
                        onClick={handleConnectNew}
                        disabled={loading}
                        className="btn-nav-primary"
                        style={{ padding: '12px 24px', fontSize: '0.95rem' }}
                    >
                        {loading ? 'Connecting...' : '+ Connect Local Folder'}
                    </button>
                    <Link
                        to="/dashboard"
                        className="btn-logout"
                        style={{ padding: '12px 24px', fontSize: '0.95rem' }}
                    >
                        View Dashboard →
                    </Link>
                </div>
            </section>

            {/* Connected Folders Section */}
            <section style={{ maxWidth: '1000px', margin: '0 auto 48px auto', padding: '0 24px', width: '100%' }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '16px',
                    borderBottom: '1px solid var(--border-color)',
                    paddingBottom: '12px'
                }}>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Connected Folders ({folders.length})
                    </h2>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {folders.length > 0 ? 'Click any folder to browse in Gallery' : 'No folders connected'}
                    </span>
                </div>

                {folders.length === 0 ? (
                    <div style={{
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px dashed var(--border-color)',
                        borderRadius: 'var(--radius)',
                        padding: '40px 20px',
                        textAlign: 'center'
                    }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>📁</div>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                            No local folders connected yet
                        </h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '18px' }}>
                            Select any folder on your computer to instantly view and index your photos locally.
                        </p>
                        <button
                            onClick={handleConnectNew}
                            disabled={loading}
                            className="btn-nav-primary"
                            style={{ padding: '9px 18px', fontSize: '0.875rem' }}
                        >
                            Connect Your First Folder
                        </button>
                    </div>
                ) : (
                    <div className="dashboard-grid">
                        {folders.map(folder => (
                            <div
                                key={folder.id}
                                className="dashboard-card"
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    cursor: 'pointer',
                                    transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                                }}
                                onClick={() => handleOpenFolder(folder.id)}
                            >
                                <div>
                                    <div style={{ fontSize: '2rem', marginBottom: '10px' }}>📁</div>
                                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                                        {folder.name}
                                    </h3>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', marginBottom: '16px' }}>
                                        {folder.fileCount ? `${folder.fileCount} photos detected` : 'Local gallery folder'}
                                    </p>
                                </div>

                                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }} onClick={e => e.stopPropagation()}>
                                    <button
                                        onClick={() => handleOpenFolder(folder.id)}
                                        className="btn-nav-primary"
                                        style={{ flex: 1, fontSize: '0.825rem', padding: '8px 12px' }}
                                    >
                                        Open Gallery →
                                    </button>
                                    <button
                                        onClick={(e) => handleDisconnect(folder.id, e)}
                                        className="btn-logout"
                                        style={{ fontSize: '0.825rem', padding: '8px 12px' }}
                                        title="Disconnect this folder"
                                    >
                                        Disconnect
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Feature Highlights */}
            <section className="hero-cards" style={{ maxWidth: '1000px', margin: '0 auto 60px auto', padding: '0 24px' }}>
                <div className="feature-card">
                    <div className="feature-icon">🛡️</div>
                    <h3 className="feature-title">Zero Cloud Uploads</h3>
                    <p className="feature-desc">
                        Your original images never leave your local machine. IndexedDB stores only lightweight file metadata.
                    </p>
                </div>
                <div className="feature-card">
                    <div className="feature-icon">🔍</div>
                    <h3 className="feature-title">Smart Local Discovery</h3>
                    <p className="feature-desc">
                        Hierarchical tree enumeration and fast photo grid views let you explore subdirectories effortlessly.
                    </p>
                </div>
                <div className="feature-card">
                    <div className="feature-icon">⚡</div>
                    <h3 className="feature-title">RAM-Optimized Previews</h3>
                    <p className="feature-desc">
                        Photos load on-demand directly from your local disk with automatic cleanup to keep memory usage minimal.
                    </p>
                </div>
            </section>
        </div>
    );
};

export default Home;