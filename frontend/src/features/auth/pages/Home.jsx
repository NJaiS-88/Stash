import React from 'react';
import Navbar from '../components/Navbar';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import { useGallery } from '../../gallery/hooks/useGallery';
import { LOCAL_AI_SETUP_DOWNLOAD_URL } from '../../gallery/services/localAiClient';

const Home = () => {
    const { user } = useAuth();
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
        <div className="page-container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <Navbar />

            {/* Hero Section */}
            <section className="hero-section" style={{ padding: '60px 24px 40px 24px', textAlign: 'center' }}>
                <div className="hero-pill" style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 14px',
                    borderRadius: '20px',
                    backgroundColor: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    color: '#065f46',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                    marginBottom: '18px'
                }}>
                    <span>🔒</span>
                    <span>100% Private & Local-First Intelligence</span>
                </div>

                <h1 className="hero-title" style={{
                    fontSize: '2.8rem',
                    fontWeight: 800,
                    color: 'var(--text-primary)',
                    letterSpacing: '-0.03em',
                    lineHeight: 1.15,
                    marginBottom: '16px',
                    maxWidth: '800px',
                    marginLeft: 'auto',
                    marginRight: 'auto'
                }}>
                    Your photos. Your device. Powered by local AI.
                </h1>

                <p className="hero-subtitle" style={{
                    fontSize: '1.15rem',
                    color: 'var(--text-secondary)',
                    maxWidth: '650px',
                    margin: '0 auto 32px auto',
                    lineHeight: 1.6
                }}>
                    Index, search, and browse your entire photo library using cutting-edge vision AI. Photos never leave your machine—guaranteed by a strict Cloud Privacy Boundary.
                </p>

                {/* Conditional CTAs based on login state */}
                <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
                    {user ? (
                        /* Logged-In User Actions */
                        <>
                            <button
                                onClick={handleConnectNew}
                                disabled={loading}
                                className="btn-nav-primary"
                                style={{ padding: '12px 28px', fontSize: '1rem', fontWeight: 600, borderRadius: '8px' }}
                            >
                                {loading ? 'Connecting...' : '📁 + Connect Local Folder'}
                            </button>
                            <Link
                                to="/dashboard"
                                className="btn-logout"
                                style={{ padding: '12px 24px', fontSize: '1rem', textDecoration: 'none', borderRadius: '8px' }}
                            >
                                Open Dashboard →
                            </Link>
                        </>
                    ) : (
                        /* Unauthenticated Visitor Actions: Prominent Download .exe + Login/Register */
                        <>
                            <a
                                href={LOCAL_AI_SETUP_DOWNLOAD_URL}
                                download="StashLocalAI-Setup.exe"
                                className="btn-nav-primary"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '14px 28px',
                                    fontSize: '1.05rem',
                                    fontWeight: 700,
                                    textDecoration: 'none',
                                    borderRadius: '8px',
                                    backgroundColor: '#16a34a',
                                    boxShadow: '0 4px 14px rgba(22, 163, 74, 0.3)'
                                }}
                            >
                                <span>⚡</span>
                                <span>Download Local AI (.exe)</span>
                            </a>
                            <Link
                                to="/register"
                                className="btn-nav-primary"
                                style={{ padding: '14px 24px', fontSize: '1rem', textDecoration: 'none', borderRadius: '8px' }}
                            >
                                Create Free Account
                            </Link>
                            <Link
                                to="/login"
                                className="btn-logout"
                                style={{ padding: '14px 24px', fontSize: '1rem', textDecoration: 'none', borderRadius: '8px' }}
                            >
                                Sign In
                            </Link>
                        </>
                    )}
                </div>
            </section>

            {/* ONLY DISPLAY CONNECTED FOLDERS SECTION IF LOGGED IN */}
            {user ? (
                <section style={{ maxWidth: '1000px', margin: '0 auto 48px auto', padding: '0 24px', width: '100%' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '16px',
                        borderBottom: '1px solid var(--border-color)',
                        paddingBottom: '12px'
                    }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
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
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                            gap: '16px'
                        }}>
                            {folders.map(folder => (
                                <div
                                    key={folder.id}
                                    onClick={() => handleOpenFolder(folder.id)}
                                    style={{
                                        backgroundColor: 'var(--bg-surface)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: 'var(--radius)',
                                        padding: '16px',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-color)'}
                                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                                        <span style={{ fontSize: '1.8rem', flexShrink: 0 }}>📁</span>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{
                                                fontWeight: 600,
                                                fontSize: '0.95rem',
                                                color: 'var(--text-primary)',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}>
                                                {folder.name}
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                {folder.imageCount !== undefined ? `${folder.imageCount} photos` : 'Local folder'}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => handleDisconnect(folder.id, e)}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#ef4444',
                                            fontSize: '0.8rem',
                                            cursor: 'pointer',
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            flexShrink: 0
                                        }}
                                        title="Disconnect folder"
                                    >
                                        Disconnect
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            ) : (
                /* Unauthenticated Feature Showcase & Download Section */
                <section style={{ maxWidth: '1000px', margin: '20px auto 60px auto', padding: '0 24px', width: '100%' }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                        gap: '24px',
                        marginBottom: '40px'
                    }}>
                        <div style={{
                            backgroundColor: 'var(--bg-surface)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '16px',
                            padding: '24px',
                            textAlign: 'center'
                        }}>
                            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🔒</div>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
                                Cloud Privacy Boundary
                            </h3>
                            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                Photos never leave your computer. Only semantic captions and salted fingerprints are synced.
                            </p>
                        </div>

                        <div style={{
                            backgroundColor: 'var(--bg-surface)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '16px',
                            padding: '24px',
                            textAlign: 'center'
                        }}>
                            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>⚡</div>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
                                Qwen3-VL Local AI
                            </h3>
                            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                Runs GPU-accelerated vision intelligence on <code>127.0.0.1</code> via our lightweight background helper.
                            </p>
                        </div>

                        <div style={{
                            backgroundColor: 'var(--bg-surface)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '16px',
                            padding: '24px',
                            textAlign: 'center'
                        }}>
                            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🔍</div>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
                                Natural Visual Search
                            </h3>
                            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                Find any photo by describing actions, subjects, places, or colors in natural human language.
                            </p>
                        </div>
                    </div>

                    {/* Exe Download Callout Card */}
                    <div style={{
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '16px',
                        padding: '32px',
                        textAlign: 'center',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                    }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                            Ready to explore your photo collection privately?
                        </h3>
                        <p style={{ fontSize: '0.925rem', color: 'var(--text-secondary)', maxWidth: '520px', margin: '0 auto 20px auto', lineHeight: 1.5 }}>
                            Download the standalone Windows helper, create your free account, and connect your folders in under 60 seconds.
                        </p>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                            <a
                                href={LOCAL_AI_SETUP_DOWNLOAD_URL}
                                download="StashLocalAI-Setup.exe"
                                className="btn-nav-primary"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '12px 24px',
                                    fontSize: '0.95rem',
                                    fontWeight: 600,
                                    textDecoration: 'none',
                                    borderRadius: '8px',
                                    backgroundColor: '#16a34a'
                                }}
                            >
                                <span>⚡</span>
                                <span>Download StashLocalAI.exe</span>
                            </a>
                            <Link
                                to="/about"
                                className="btn-logout"
                                style={{ padding: '12px 20px', fontSize: '0.95rem', textDecoration: 'none', borderRadius: '8px' }}
                            >
                                Learn More in About →
                            </Link>
                        </div>
                    </div>
                </section>
            )}
        </div>
    );
};

export default Home;