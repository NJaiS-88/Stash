import { useState, useEffect, useRef } from 'react';
import { resolveLocalSearchResult, revokeResolvedBlobUrl } from '../services/localSearchResolver';

/**
 * Phase 35 — Local Search Image Component
 *
 * Renders an image returned by Pinecone semantic search by resolving:
 * imageId (e.g. A101)
 *   ↓
 * IndexedDB (folderId + relativePath)
 *   ↓
 * FileSystemDirectoryHandle
 *   ↓
 * File
 *   ↓
 * Temporary Blob URL
 *   ↓
 * <img>
 *
 * Automatically revokes object URLs on unmount to prevent browser memory leaks.
 */
export default function LocalSearchImage({
    imageId,
    alt = 'Search result photo',
    className = '',
    style = {},
    fallback = null,
    onResolved = null
}) {
    const [blobUrl, setBlobUrl] = useState(null);
    const [status, setStatus] = useState('loading'); // 'loading' | 'resolved' | 'error' | 'missing'
    const [errorReason, setErrorReason] = useState(null);
    const activeUrlRef = useRef(null);

    useEffect(() => {
        let isMounted = true;
        setStatus('loading');
        setErrorReason(null);

        // Revoke prior Blob URL if imageId changes
        if (activeUrlRef.current) {
            revokeResolvedBlobUrl(activeUrlRef.current);
            activeUrlRef.current = null;
            setBlobUrl(null);
        }

        if (!imageId) {
            setStatus('error');
            setErrorReason('No imageId provided');
            return;
        }

        resolveLocalSearchResult(imageId).then((res) => {
            if (!isMounted) {
                // If unmounted during resolution, immediately revoke
                if (res.blobUrl) revokeResolvedBlobUrl(res.blobUrl);
                return;
            }

            if (res.success && res.blobUrl) {
                activeUrlRef.current = res.blobUrl;
                setBlobUrl(res.blobUrl);
                setStatus('resolved');
                if (onResolved) onResolved(res);
            } else {
                setStatus(res.reason === 'image_marked_missing' ? 'missing' : 'error');
                setErrorReason(res.reason || 'Could not resolve local file');
            }
        }).catch((err) => {
            if (!isMounted) return;
            setStatus('error');
            setErrorReason(err.message || 'Resolution failed');
        });

        return () => {
            isMounted = false;
            if (activeUrlRef.current) {
                revokeResolvedBlobUrl(activeUrlRef.current);
                activeUrlRef.current = null;
            }
        };
    }, [imageId]);

    if (status === 'loading') {
        return (
            <div
                className={`local-search-loading ${className}`}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#f1f5f9',
                    color: '#94a3b8',
                    fontSize: '0.85rem',
                    minHeight: '120px',
                    width: '100%',
                    height: '100%',
                    borderRadius: 'inherit',
                    ...style
                }}
            >
                <span>⏳ Resolving from device...</span>
            </div>
        );
    }

    if (status === 'missing' || status === 'error') {
        if (fallback) return fallback;

        return (
            <div
                className={`local-search-error ${className}`}
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#fef2f2',
                    color: '#991b1b',
                    fontSize: '0.78rem',
                    padding: '12px',
                    minHeight: '120px',
                    width: '100%',
                    height: '100%',
                    textAlign: 'center',
                    borderRadius: 'inherit',
                    ...style
                }}
                title={errorReason}
            >
                <span style={{ fontSize: '1.5rem', marginBottom: '4px' }}>
                    {status === 'missing' ? '⚠️' : '📁'}
                </span>
                <span style={{ fontWeight: 600 }}>
                    {status === 'missing' ? 'Photo Offline' : 'Local File Missing'}
                </span>
                <span style={{ fontSize: '0.7rem', color: '#b91c1c', marginTop: '2px' }}>
                    [ID: {imageId}]
                </span>
            </div>
        );
    }

    return (
        <img
            src={blobUrl}
            alt={alt}
            className={`local-search-img ${className}`}
            style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
                borderRadius: 'inherit',
                ...style
            }}
            loading="lazy"
        />
    );
}
