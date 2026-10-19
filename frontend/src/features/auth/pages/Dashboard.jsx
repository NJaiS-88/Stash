import { useState } from 'react';
import Navbar from '../components/Navbar';
import { useAuth } from '../hooks/useAuth';
import { useGallery } from '../../gallery/hooks/useGallery';
import { useNavigate } from 'react-router';

const Dashboard = () => {
    const { user } = useAuth();
    const { folders, addFolder, selectFolder, removeFolder, scanAll, loading } = useGallery();
    const [scanning, setScanning] = useState(false);
    const [scanMessage, setScanMessage] = useState(null);
    const navigate = useNavigate();

    const handleOpenFolder = async (folderId) => {
        await selectFolder(folderId);
        navigate('/gallery');
    };

    const handleConnectNew = async () => {
        const added = await addFolder();
        if (added) {
            navigate('/gallery');
        }
    };

    const handleDisconnect = async (folderId, e) => {
        e.stopPropagation();
        await removeFolder(folderId);
    };

    const handleRescanAll = async () => {
        setScanning(true);
        setScanMessage(null);
        try {
            const { snapshot } = await scanAll();
            setScanMessage(`Global scan complete: Discovered ${snapshot.length} photos across ${folders.length} folder${folders.length === 1 ? '' : 's'}.`);
        } catch (err) {
            console.error('Scan error:', err);
        } finally {
            setScanning(false);
        }
    };

    const totalPhotos = folders.reduce((sum, f) => sum + (f.fileCount || 0), 0);

    return (
        <div className="page-container">
            <Navbar />
            <main className="dashboard-container">
                <div className="dashboard-header" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '16px'
                }}>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '6px' }}>
                            Welcome back{user?.username ? `, ${user.username}` : ''}!
                        </h1>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            Manage your connected local photo folders. All images remain privately on your device.
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {folders.length > 0 && (
                            <button
                                onClick={handleRescanAll}
                                disabled={loading || scanning}
                                className="btn-logout"
                                style={{ padding: '10px 18px', fontSize: '0.9rem' }}
                                title="Run Global Multi-Folder Scan"
                            >
                                {scanning ? '🔄 Scanning All...' : '🔄 Rescan All Folders'}
                            </button>
                        )}

                        <button
                            onClick={handleConnectNew}
                            disabled={loading || scanning}
                            className="btn-nav-primary"
                            style={{ padding: '10px 18px', fontSize: '0.9rem' }}
                        >
                            {loading ? 'Connecting...' : '+ Connect New Folder'}
                        </button>
                    </div>
                </div>

                {scanMessage && (
                    <div style={{
                        backgroundColor: '#ecfdf5',
                        color: '#065f46',
                        border: '1px solid #a7f3d0',
                        padding: '12px 18px',
                        borderRadius: 'var(--radius)',
                        marginBottom: '20px',
                        fontSize: '0.875rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <span>✓ {scanMessage}</span>
                        <button
                            onClick={() => setScanMessage(null)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065f46', fontWeight: 'bold' }}
                        >
                            ✕
                        </button>
                    </div>
                )}

                <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Connected Folders ({folders.length})
                    </h2>
                    {totalPhotos > 0 && (
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            {totalPhotos} total photos tracked
                        </span>
                    )}
                </div>

                {folders.length === 0 ? (
                    <div style={{
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px dashed var(--border-color)',
                        borderRadius: 'var(--radius)',
                        padding: '48px 24px',
                        textAlign: 'center'
                    }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📁</div>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                            No folders connected yet
                        </h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '20px' }}>
                            Connect your computer's photo folders to view and manage them locally.
                        </p>
                        <button
                            onClick={handleConnectNew}
                            className="btn-nav-primary"
                            style={{ padding: '10px 20px', fontSize: '0.9rem' }}
                        >
                            Connect Your First Folder
                        </button>
                    </div>
                ) : (
                    <div className="dashboard-grid">
                        {folders.map(folder => (
                            <div key={folder.id} className="dashboard-card" style={{
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between'
                            }}>
                                <div>
                                    <div style={{ fontSize: '2rem', marginBottom: '10px' }}>📁</div>
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                                        {folder.name}
                                    </h3>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>
                                        {folder.fileCount ? `${folder.fileCount} photos detected` : 'Local gallery folder'}
                                    </p>
                                </div>

                                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                                    <button
                                        onClick={() => handleOpenFolder(folder.id)}
                                        className="btn-nav-primary"
                                        style={{ flex: 1, fontSize: '0.85rem', padding: '8px 12px' }}
                                    >
                                        Open Gallery →
                                    </button>
                                    <button
                                        onClick={(e) => handleDisconnect(folder.id, e)}
                                        className="btn-logout"
                                        style={{ fontSize: '0.85rem', padding: '8px 12px' }}
                                        title="Disconnect this folder"
                                    >
                                        Disconnect
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
};

export default Dashboard;