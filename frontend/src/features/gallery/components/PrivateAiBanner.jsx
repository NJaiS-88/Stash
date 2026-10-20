import React, { useState, useEffect } from 'react';
import {
    checkLocalAiHealth,
    getLocalAiStatus,
    LOCAL_AI_SETUP_DOWNLOAD_URL
} from '../services/localAiClient';

export default function PrivateAiBanner() {
    const [localHealth, setLocalHealth] = useState({ available: false });
    const [modelStatus, setModelStatus] = useState(null);
    const [dismissed, setDismissed] = useState(() => {
        return localStorage.getItem('stash_local_ai_offer_dismissed') === 'true';
    });
    const [showDownloadModal, setShowDownloadModal] = useState(false);

    useEffect(() => {
        let mounted = true;

        async function pollLocalAI() {
            try {
                const health = await checkLocalAiHealth();
                if (!mounted) return;
                setLocalHealth(health);

                if (health.connected) {
                    const status = await getLocalAiStatus();
                    if (mounted && status) {
                        setModelStatus(status);
                    }
                }
            } catch (err) {
                // Ignore background polling errors
            }
        }

        pollLocalAI();
        // Poll every 4 seconds to immediately detect when installer finishes
        const intervalId = setInterval(pollLocalAI, 4000);

        return () => {
            mounted = false;
            clearInterval(intervalId);
        };
    }, []);

    const handleDismiss = () => {
        setDismissed(true);
        localStorage.setItem('stash_local_ai_offer_dismissed', 'true');
    };

    const handleDownloadClick = () => {
        const link = document.createElement('a');
        link.href = LOCAL_AI_SETUP_DOWNLOAD_URL;
        link.download = 'StashLocalAI-Setup.exe';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setShowDownloadModal(true);
    };

    // If local AI helper process is connected
    if (localHealth.connected) {
        const isDownloading = modelStatus?.status === 'DOWNLOADING';
        const isError = modelStatus?.status === 'ERROR';
        const isReady = localHealth.available;
        const progress = modelStatus?.downloadProgress || 0;

        const handleRetryDownload = async () => {
            try {
                await fetch('http://127.0.0.1:48124/download-model', { method: 'POST' });
            } catch (err) {
                console.warn('Failed to trigger download retry:', err);
            }
        };

        return (
            <div style={{
                background: isError ? 'linear-gradient(135deg, #fff1f2 0%, #fee2e2 100%)' : 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                border: `1px solid ${isError ? '#fca5a5' : '#86efac'}`,
                borderRadius: 'var(--radius)',
                padding: '12px 18px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                boxShadow: '0 2px 8px rgba(22, 101, 52, 0.06)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.2rem' }}>{isError ? '⚠️' : (isReady ? '🟢' : '⏳')}</span>
                    <div>
                        <div style={{ fontWeight: 600, color: isError ? '#991b1b' : '#166534', fontSize: '0.92rem' }}>
                            {isReady
                                ? `Stash Local AI Active (${localHealth.model || 'Qwen3-VL-8B'})`
                                : (isDownloading ? 'Preparing Private AI: Downloading Weights' : (isError ? 'Private AI: Model Download Pending' : 'Stash Local AI Initializing...'))}
                        </div>
                        <div style={{ color: isError ? '#b91c1c' : '#15803d', fontSize: '0.8rem' }}>
                            {isDownloading
                                ? `Downloading model weights (${progress}%)... Original photos remain strictly on device.`
                                : isError
                                    ? (modelStatus?.errorMessage ? `Download error: ${modelStatus.errorMessage}` : 'Model weights missing. Click retry to begin.')
                                    : (isReady ? `Hardware acceleration: ${localHealth.device?.toUpperCase() || 'GPU'} • 100% On-Device Privacy` : 'Setting up local inference engine...')}
                        </div>
                        {isDownloading && (
                            <div style={{
                                width: '240px',
                                height: '6px',
                                backgroundColor: '#bbf7d0',
                                borderRadius: '3px',
                                overflow: 'hidden',
                                marginTop: '6px'
                            }}>
                                <div style={{
                                    width: `${progress}%`,
                                    height: '100%',
                                    backgroundColor: '#16a34a',
                                    transition: 'width 0.3s ease'
                                }} />
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {isError && (
                        <button
                            onClick={handleRetryDownload}
                            className="btn-nav-primary"
                            style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                        >
                            Retry Model Download
                        </button>
                    )}
                    <a
                        href="http://127.0.0.1:48124/"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            fontSize: '0.75rem',
                            backgroundColor: isError ? '#fecaca' : '#bbf7d0',
                            color: isError ? '#7f1d1d' : '#14532d',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontWeight: 600,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}
                        title="Open Stash Local AI Live Diagnostic Dashboard"
                    >
                        <span>📊 Logs & Status</span>
                    </a>
                </div>
            </div>
        );
    }

    // If local AI is NOT detected and user hasn't dismissed the prompt
    if (!dismissed) {
        return (
            <>
                <div style={{
                    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                    border: '1px solid #cbd5e1',
                    borderRadius: 'var(--radius)',
                    padding: '14px 20px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    boxShadow: 'var(--shadow-subtle)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '1.4rem' }}>🛡️</span>
                        <div>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                                Boost Caption Quality with Stash Private AI
                            </div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                                Run Qwen3-VL-8B locally with GPU acceleration. Original photos never leave your device.
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                            onClick={handleDownloadClick}
                            className="btn-nav-primary"
                            style={{
                                padding: '8px 16px',
                                fontSize: '0.85rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <span>⬇</span> Download Private AI (.exe)
                        </button>
                        <button
                            onClick={handleDismiss}
                            style={{
                                background: 'transparent',
                                border: '1px solid #cbd5e1',
                                borderRadius: 'var(--radius)',
                                padding: '8px 14px',
                                fontSize: '0.82rem',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                fontWeight: 500
                            }}
                        >
                            Continue with Browser AI
                        </button>
                    </div>
                </div>

                {/* Instructions Modal upon clicking Download */}
                {showDownloadModal && (
                    <div style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 9999,
                        padding: '16px'
                    }}>
                        <div style={{
                            backgroundColor: '#ffffff',
                            borderRadius: '12px',
                            maxWidth: '520px',
                            width: '100%',
                            padding: '28px',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                        }}>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '12px', color: '#0f172a' }}>
                                Setting up Stash Private AI
                            </h3>
                            <ol style={{ paddingLeft: '20px', color: '#475569', fontSize: '0.9rem', lineHeight: 1.6 }}>
                                <li>Run <strong>StashLocalAI-Setup.exe</strong> from your downloads.</li>
                                <li>Follow the setup wizard (creates background service on loopback port 48124).</li>
                                <li>The AI model weights will configure automatically in the background.</li>
                                <li>This website will automatically detect it and resume captioning instantly!</li>
                            </ol>
                            <div style={{
                                backgroundColor: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                padding: '12px 14px',
                                marginTop: '16px',
                                fontSize: '0.8rem',
                                color: '#64748b'
                            }}>
                                🔒 <strong>Zero Cloud Upload:</strong> Original photos are processed completely on your machine and never uploaded to Stash servers.
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                                <button
                                    onClick={() => setShowDownloadModal(false)}
                                    className="btn-nav-primary"
                                    style={{ padding: '8px 20px', fontSize: '0.9rem' }}
                                >
                                    Got it
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </>
        );
    }

    return null;
}
