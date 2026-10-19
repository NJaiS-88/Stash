import { useState } from 'react';
import Navbar from '../components/Navbar';
import { useAuth } from '../hooks/useAuth';
import { useGallery } from '../../gallery/hooks/useGallery';
import { useNavigate } from 'react-router';

const Dashboard = () => {
    const { user } = useAuth();
    const {
        folders,
        addFolder,
        selectFolder,
        removeFolder,
        scanAll,
        missingImages,
        deleteMissingPhoto,
        purgeAllMissing,
        loading
    } = useGallery();

    const [scanning, setScanning] = useState(false);
    const [scanMessage, setScanMessage] = useState(null);
    const [showMissingModal, setShowMissingModal] = useState(false);
    const [purging, setPurging] = useState(false);
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

    const handleDeleteSingleMissing = async (imageId, fileName) => {
        if (window.confirm(`Permanently remove "${fileName}" from Memora? This transitions it to DELETED state.`)) {
            await deleteMissingPhoto(imageId);
        }
    };

    const handlePurgeAll = async () => {
        if (window.confirm(`Permanently remove all ${missingImages.length} missing photos from Memora? This will remove them from IndexedDB and schedule cloud/vector cleanup.`)) {
            setPurging(true);
            try {
                await purgeAllMissing();
                setShowMissingModal(false);
            } finally {
                setPurging(false);
            }
        }
    };

    const handleRescanAll = async () => {
        setScanning(true);
        setScanMessage(null);
        try {
            const { snapshot, summary } = await scanAll();
            const details = [];
            if (summary) {
                if (summary.unchanged > 0) details.push(`${summary.unchanged} unchanged`);
                if (summary.renamed > 0) details.push(`${summary.renamed} renamed`);
                if (summary.movedBetweenFolders > 0) details.push(`${summary.movedBetweenFolders} moved across folders`);
                if (summary.movedWithinFolder > 0) details.push(`${summary.movedWithinFolder} moved`);
                if (summary.restored > 0) details.push(`${summary.restored} restored`);
                if (summary.created > 0) details.push(`${summary.created} new`);
                if (summary.modified > 0) details.push(`${summary.modified} modified`);
                if (summary.newlyMissing > 0) details.push(`${summary.newlyMissing} newly missing`);
                else if (summary.missing > 0) details.push(`${summary.missing} missing`);
            }
            const detailStr = details.length > 0 ? ` (${details.join(', ')})` : '';
            const missingNote = summary?.missing > 0 ? ` [${summary.missing} photos unlocated — preserved safely as missing]` : '';
            setScanMessage({
                text: `Reconciliation complete: Discovered ${snapshot.length} photos across ${folders.length} folder${folders.length === 1 ? '' : 's'}${detailStr}.${missingNote}`,
                hasMissing: (summary?.missing || 0) > 0
            });
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
                        backgroundColor: scanMessage.hasMissing ? '#fffbeb' : '#ecfdf5',
                        color: scanMessage.hasMissing ? '#92400e' : '#065f46',
                        border: `1px solid ${scanMessage.hasMissing ? '#fde68a' : '#a7f3d0'}`,
                        padding: '12px 18px',
                        borderRadius: 'var(--radius)',
                        marginBottom: '20px',
                        fontSize: '0.875rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <span>{scanMessage.hasMissing ? 'ℹ️ ' : '✓ '}{scanMessage.text}</span>
                        <button
                            onClick={() => setScanMessage(null)}
                            style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: scanMessage.hasMissing ? '#92400e' : '#065f46',
                                fontWeight: 'bold'
                            }}
                        >
                            ✕
                        </button>
                    </div>
                )}

                {missingImages && missingImages.length > 0 && (
                    <div style={{
                        backgroundColor: '#fffbeb',
                        border: '1px solid #fde68a',
                        borderRadius: 'var(--radius)',
                        padding: '16px 20px',
                        marginBottom: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px',
                        boxShadow: 'var(--shadow-subtle)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '1.4rem' }}>⚠️</span>
                            <div>
                                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#92400e', margin: 0 }}>
                                    {missingImages.length} Unlocated Photo{missingImages.length === 1 ? '' : 's'}
                                </h4>
                                <p style={{ fontSize: '0.8rem', color: '#b45309', margin: '2px 0 0' }}>
                                    These files are disconnected or moved. Their metadata is preserved; they do not participate in active gallery searches.
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowMissingModal(true)}
                            className="btn-logout"
                            style={{
                                fontSize: '0.825rem',
                                padding: '8px 16px',
                                backgroundColor: '#fef3c7',
                                borderColor: '#fcd34d',
                                color: '#92400e',
                                fontWeight: 600
                            }}
                        >
                            Manage Missing Photos ({missingImages.length})
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

            {/* Phase 10: Missing Photos Lifecycle Management Modal */}
            {showMissingModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '20px'
                }}>
                    <div style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderRadius: 'var(--radius)',
                        border: '1px solid var(--border-color)',
                        maxWidth: '650px',
                        width: '100%',
                        maxHeight: '80vh',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                    }}>
                        {/* Modal Header */}
                        <div style={{
                            padding: '18px 24px',
                            borderBottom: '1px solid var(--border-color)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                                    Missing Photos Management ({missingImages.length})
                                </h3>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                                    Three-State Lifecycle: AVAILABLE ➔ MISSING ➔ DELETED
                                </p>
                            </div>
                            <button
                                onClick={() => setShowMissingModal(false)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    fontSize: '1.25rem',
                                    cursor: 'pointer',
                                    color: 'var(--text-secondary)'
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                                These photos could not be found in any connected folder. If you re-attach the drive or move them back, Memora will restore them automatically. Or you can permanently delete their records now.
                            </p>

                            {missingImages.length === 0 ? (
                                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0' }}>
                                    No missing photos.
                                </p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {missingImages.map(img => (
                                        <div key={img.imageId} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '10px 14px',
                                            backgroundColor: '#f8fafc',
                                            borderRadius: 'var(--radius-sm)',
                                            border: '1px solid #e2e8f0'
                                        }}>
                                            <div style={{ overflow: 'hidden', paddingRight: '12px' }}>
                                                <p style={{ fontSize: '0.875rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {img.fileName}
                                                </p>
                                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    Last known: {img.relativePath} • Missing since: {img.missingSince ? new Date(img.missingSince).toLocaleDateString() : 'Recent'}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => handleDeleteSingleMissing(img.imageId, img.fileName)}
                                                className="btn-logout"
                                                style={{ fontSize: '0.75rem', padding: '4px 10px', color: '#dc2626', borderColor: '#fca5a5' }}
                                                title="Permanently remove from Memora"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div style={{
                            padding: '16px 24px',
                            borderTop: '1px solid var(--border-color)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: '#f9fafb'
                        }}>
                            {missingImages.length > 0 ? (
                                <button
                                    onClick={handlePurgeAll}
                                    disabled={purging}
                                    className="btn-logout"
                                    style={{
                                        fontSize: '0.825rem',
                                        padding: '8px 14px',
                                        color: '#dc2626',
                                        borderColor: '#fca5a5'
                                    }}
                                >
                                    {purging ? 'Purging...' : 'Clean Up All Missing'}
                                </button>
                            ) : <div />}

                            <button
                                onClick={() => setShowMissingModal(false)}
                                className="btn-nav-primary"
                                style={{ fontSize: '0.85rem', padding: '8px 18px' }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;