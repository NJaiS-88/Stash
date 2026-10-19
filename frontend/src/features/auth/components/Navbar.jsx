import { Link, useNavigate } from 'react-router'
import { useAuth } from '../hooks/useAuth'

export default function Navbar() {
    const { user, handleLogout } = useAuth()
    const navigate = useNavigate()

    const onLogout = async () => {
        try {
            await handleLogout()
            navigate('/login')
        } catch (error) {
            console.error(error)
        }
    }

    return (
        <header className="navbar-wrapper">
            <div className="navbar">
                <Link to="/" className="navbar-brand">
                    <span>Stash</span>
                    <span className="navbar-badge">Gallery</span>
                </Link>
                <nav className="navbar-links">
                    <Link to="/" className="nav-link">Home</Link>
                    <Link to="/gallery" className="nav-link">Gallery</Link>
                    {user ? (
                        <>
                            <Link to="/dashboard" className="nav-link">Dashboard</Link>
                            <button onClick={onLogout} className="btn-logout">Logout</button>
                        </>
                    ) : (
                        <>
                            <Link to="/login" className="nav-link">Login</Link>
                            <Link to="/register" className="btn-nav-primary">Register</Link>
                        </>
                    )}
                </nav>
            </div>
        </header>
    )
}