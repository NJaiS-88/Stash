import { Link, useNavigate } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import { LOCAL_AI_SETUP_DOWNLOAD_URL } from '../../gallery/services/localAiClient';

export default function Navbar() {
    const { user, handleLogout } = useAuth();
    const navigate = useNavigate();

    const onLogout = async () => {
        try {
            await handleLogout();
            navigate('/');
        } catch (error) {
            console.error('[Navbar] Logout error:', error);
        }
    };

    return (
        <header className="navbar-wrapper">
            <div className="navbar">
                <Link to={user ? "/dashboard" : "/"} className="navbar-brand">
                    <span>Stash</span>
                    <span className="navbar-badge">Gallery</span>
                </Link>

                <nav className="navbar-links" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Public links always visible */}
                    <Link to="/about" className="nav-link">About</Link>

                    {user ? (
                        /* Authenticated: Allow Dashboard, Gallery, and Logout */
                        <>
                            <Link to="/dashboard" className="nav-link">Dashboard</Link>
                            <Link to="/gallery" className="nav-link">Gallery</Link>
                            <span style={{
                                fontSize: '0.8rem',
                                color: 'var(--text-secondary)',
                                padding: '2px 8px',
                                backgroundColor: 'var(--bg-surface)',
                                borderRadius: '12px',
                                border: '1px solid var(--border-color)'
                            }}>
                                👤 {user.username || user.email}
                            </span>
                            <button onClick={onLogout} className="btn-logout">Logout</button>
                        </>
                    ) : (
                        /* Unauthenticated: ONLY show About, Download .exe, Login, and Register */
                        <>
                            <a
                                href={LOCAL_AI_SETUP_DOWNLOAD_URL}
                                download="StashLocalAI-Setup.exe"
                                className="nav-link"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#16a34a', fontWeight: 600 }}
                                title="Download standalone local AI helper for Windows"
                            >
                                <span>⚡</span>
                                <span>Download .exe</span>
                            </a>
                            <Link to="/login" className="nav-link">Login</Link>
                            <Link to="/register" className="btn-nav-primary">Register</Link>
                        </>
                    )}
                </nav>
            </div>
        </header>
    );
}