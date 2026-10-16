import Navbar from '../components/Navbar'
import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../hooks/useAuth'

const Login = () => {
    const { handleLogin, loading, user, errorMessage, setErrorMessage } = useAuth()
    const navigate = useNavigate()

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')

    useEffect(() => {
        setErrorMessage(null)
    }, [])

    useEffect(() => {
        if (user) {
            navigate('/')
        }
    }, [user, navigate])

    const handleSubmit = async (e) => {
        e.preventDefault()
        try {
            await handleLogin(email, password)
            navigate('/')
        } catch (error) {
            console.error(error)
        }
    }

    if (loading) {
        return <div className="loading-screen">Loading...</div>
    }

    return (
        <div className="page-container">
            <Navbar />
            <main className="auth-wrapper">
                <div className="auth-card">
                    <div className="auth-header">
                        <h1 className="auth-title">Welcome back</h1>
                        <p className="auth-subtitle">Sign in to your Ascend account</p>
                    </div>

                    {errorMessage && (
                        <div className="alert-error">
                            <span>⚠</span>
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="auth-form">
                        <div className="form-group">
                            <label className="form-label" htmlFor="login-email">Email</label>
                            <input 
                                id="login-email"
                                className="form-input"
                                type="email" 
                                placeholder="name@example.com" 
                                value={email} 
                                onChange={(e) => setEmail(e.target.value)} 
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label" htmlFor="login-password">Password</label>
                            <input 
                                id="login-password"
                                className="form-input"
                                type="password" 
                                placeholder="••••••••" 
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)} 
                                required
                            />
                        </div>
                        <button type="submit" className="auth-btn">Sign In</button>
                    </form>

                    <p className="auth-footer">
                        Don't have an account? <Link to="/register">Create an account</Link>
                    </p>
                </div>
            </main>
        </div>
    )
}

export default Login