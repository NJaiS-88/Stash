import React from 'react';
import { useGallery } from '../hooks/useGallery';

export default function AiIndexingBanner() {
    const {
        indexingState,
        isAIPaused,
        pauseAIIndexing,
        resumeAIIndexing
    } = useGallery();

    if (!indexingState?.isIndexing && !isAIPaused) {
        return null;
    }

    const current = indexingState.current || 0;
    const total = indexingState.total || 0;
    const progressPercent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
    const isLocal = indexingState.activeEngine === 'local';

    return (
        <div style={{
            backgroundColor: isAIPaused
                ? 'rgba(254, 243, 199, 0.65)'
                : (isLocal ? 'rgba(240, 253, 244, 0.85)' : 'rgba(245, 243, 255, 0.85)'),
            border: `1px solid ${isAIPaused
                ? '#fde68a'
                : (isLocal ? '#bbf7d0' : '#ddd6fe')}`,
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '20px',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.04)',
            backdropFilter: 'blur(8px)',
            transition: 'all 0.3s ease'
        }}>
            <style>{`
                @keyframes aiPulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.4; transform: scale(0.85); }
                }
            `}</style>

            {/* Top row: Title, Engine, and Pause/Resume Action */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                marginBottom: '10px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                        display: 'inline-block',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: isAIPaused ? '#f59e0b' : (isLocal ? '#22c55e' : '#7c3aed'),
                        boxShadow: isAIPaused
                            ? '0 0 8px rgba(245, 158, 11, 0.6)'
                            : `0 0 8px ${isLocal ? 'rgba(34, 197, 94, 0.8)' : 'rgba(124, 58, 237, 0.8)'}`,
                        animation: !isAIPaused ? 'aiPulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none'
                    }} />
                    <h3 style={{
                        margin: 0,
                        fontSize: '0.95rem',
                        fontWeight: 700,
                        color: isAIPaused ? '#92400e' : (isLocal ? '#166534' : '#5b21b6'),
                        letterSpacing: '-0.01em'
                    }}>
                        AI Indexing
                    </h3>
                    <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '12px',
                        backgroundColor: isAIPaused
                            ? '#fef3c7'
                            : (isLocal ? '#dcfce7' : '#ede9fe'),
                        color: isAIPaused
                            ? '#b45309'
                            : (isLocal ? '#15803d' : '#6d28d9')
                    }}>
                        Engine: {isLocal ? 'Private Local AI' : 'Browser AI'}
                    </span>
                    <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '12px',
                        backgroundColor: '#f1f5f9',
                        color: '#334155',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        border: '1px solid #e2e8f0'
                    }} title="Phase 25 Cloud Privacy Boundary Active: Zero image bytes, thumbnails, paths, or raw hashes ever leave your device.">
                        🔒 Cloud Privacy Boundary Enforced
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        color: isAIPaused ? '#92400e' : (isLocal ? '#166534' : '#4c1d95'),
                        fontVariantNumeric: 'tabular-nums'
                    }}>
                        {current.toLocaleString()} / {total.toLocaleString()}
                    </span>

                    {indexingState.isIndexing ? (
                        <button
                            onClick={pauseAIIndexing}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                padding: '4px 12px',
                                borderRadius: '6px',
                                backgroundColor: isLocal ? '#dcfce7' : '#ede9fe',
                                border: `1px solid ${isLocal ? '#86efac' : '#c4b5fd'}`,
                                color: isLocal ? '#166534' : '#5b21b6',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                            title="Pause background AI inference"
                        >
                            <span>⏸</span> Pause
                        </button>
                    ) : (
                        <button
                            onClick={resumeAIIndexing}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                padding: '4px 12px',
                                borderRadius: '6px',
                                backgroundColor: '#fef3c7',
                                border: '1px solid #fde68a',
                                color: '#92400e',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                            title="Resume background AI inference"
                        >
                            <span>▶</span> Resume
                        </button>
                    )}
                </div>
            </div>

            {/* Middle: Progress Bar */}
            <div style={{
                height: '8px',
                width: '100%',
                backgroundColor: isAIPaused
                    ? 'rgba(253, 230, 138, 0.4)'
                    : (isLocal ? 'rgba(187, 247, 208, 0.4)' : 'rgba(221, 214, 254, 0.4)'),
                borderRadius: '999px',
                overflow: 'hidden',
                marginBottom: '8px'
            }}>
                <div style={{
                    height: '100%',
                    width: `${progressPercent}%`,
                    backgroundColor: isAIPaused
                        ? '#f59e0b'
                        : (isLocal ? '#22c55e' : '#7c3aed'),
                    borderRadius: '999px',
                    transition: 'width 0.4s ease-out'
                }} />
            </div>

            {/* Bottom row: File / model telemetry & privacy badge */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                fontSize: '0.78rem',
                color: isAIPaused
                    ? '#92400e'
                    : (isLocal ? '#15803d' : '#6d28d9')
            }}>
                <span style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '70%'
                }}>
                    {isAIPaused
                        ? 'Inference paused by user. Click Resume to continue.'
                        : (indexingState.modelStatus || (indexingState.currentFile
                            ? `Analyzing ${indexingState.currentFile}...`
                            : 'Processing visual embeddings...'))}
                </span>

                <span style={{ opacity: 0.85, fontSize: '0.72rem' }}>
                    🔒 Zero Cloud Leakage • Concurrency = 1
                </span>
            </div>
        </div>
    );
}
