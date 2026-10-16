import { Link } from 'react-router'

export default function Navbar() {
    return (
        <div className="nav">
            <h1>Navbar</h1>
            <Link to="/">Home</Link>
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
        </div>
    )
}