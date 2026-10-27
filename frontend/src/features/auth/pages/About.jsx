import React from 'react';
import { Link } from 'react-router';
import Navbar from '../components/Navbar';
import { useAuth } from '../hooks/useAuth';
import { LOCAL_AI_SETUP_DOWNLOAD_URL } from '../../gallery/services/localAiClient';

export default function About() {
    const { user } = useAuth();

    return (
        <div className="page-container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <Navbar />

            <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 24px 60px 24px', flex: 1, width: '100%' }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '48px' }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 12px',
                        borderRadius: '20px',
                        backgroundColor: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        color: '#065f46',
                        fontSize: '0.825rem',
                        fontWeight: 600,
                        marginBottom: '16px'
                    }}>
                        <span>🔒</span>
                        <span>Zero Cloud Image Uploads</span>
                    </div>
                    <h1 style={{
                        fontSize: '2.5rem',
                        fontWeight: 800,
                        color: 'var(--text-primary)',
                        letterSpacing: '-0.025em',
                        marginBottom: '14px',
                        lineHeight: 1.2
                    }}>
                        About Stash
                    </h1>
                    <p style={{
                        fontSize: '1.1rem',
                        color: 'var(--text-secondary)',
                        maxWidth: '680px',
                        margin: '0 auto',
                        lineHeight: 1.6
                    }}>
                        Stash is an open, private-first visual photo intelligence platform. We combine native local vision AI with cloud semantic synchronization while guaranteeing that your raw photos never leave your computer.
                    </p>
                </div>

                {/* Architecture Columns */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '24px',
                    marginBottom: '48px'
                }}>
                    <div style={{
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '16px',
                        padding: '28px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                    }}>
                        <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🧠</div>
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>
                            Native Local AI
                        </h2>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            Powered by <strong>Qwen3-VL-8B-Instruct</strong> running on <code>127.0.0.1</code> with hardware acceleration. Photos are decoded, preprocessed, captioned, and immediately purged from RAM with zero external API calls.
                        </p>
                    </div>

                    <div style={{
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '16px',
                        padding: '28px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                    }}>
                        <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🛡️</div>
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>
                            Cloud Privacy Boundary
                        </h2>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            Only sanitized semantic metadata (captions, user-salted HMAC fingerprints, and keywords) crosses to the cloud. Raw file paths, filenames, image bytes, and thumbnails are strictly forbidden and blocked.
                        </p>
                    </div>

                    <div style={{
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '16px',
                        padding: '28px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                    }}>
                        <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🔍</div>
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>
                            Natural Language Search
                        </h2>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            Search your photos using everyday descriptions like <em>"hiking on a rocky mountain at sunrise"</em> or <em>"dog playing fetch on the grass"</em>. Retrieve photos in microseconds through local IndexedDB caching.
                        </p>
                    </div>
                </div>

                {/* Exe Download Banner */}
                <div style={{
                    backgroundColor: 'rgba(240, 253, 244, 0.75)',
                    border: '1px solid #bbf7d0',
                    borderRadius: '16px',
                    padding: '32px',
                    textAlign: 'center',
                    marginBottom: '48px',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)'
                }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>⚡</div>
                    <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#166534', marginBottom: '8px' }}>
                        Get Stash Local AI Helper
                    </h2>
                    <p style={{ fontSize: '0.95rem', color: '#15803d', maxWidth: '600px', margin: '0 auto 20px auto', lineHeight: 1.5 }}>
                        Download the standalone Windows background helper to run high-speed GPU-accelerated Qwen3-VL inference directly on your laptop or desktop.
                    </p>
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
                            borderRadius: '8px'
                        }}
                    >
                        <span>⬇️</span>
                        <span>Download StashLocalAI.exe for Windows</span>
                    </a>
                </div>

                {/* CTA Box */}
                <div style={{ textAlign: 'center' }}>
                    {user ? (
                        <Link
                            to="/dashboard"
                            className="btn-nav-primary"
                            style={{ padding: '12px 28px', fontSize: '1rem', textDecoration: 'none' }}
                        >
                            Open Dashboard & Gallery →
                        </Link>
                    ) : (
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                            <Link
                                to="/register"
                                className="btn-nav-primary"
                                style={{ padding: '12px 24px', fontSize: '0.95rem', textDecoration: 'none' }}
                            >
                                Create Free Account
                            </Link>
                            <Link
                                to="/login"
                                className="btn-logout"
                                style={{ padding: '12px 24px', fontSize: '0.95rem', textDecoration: 'none' }}
                            >
                                Sign In
                            </Link>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
