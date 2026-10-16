import { useState, useEffect } from 'react'
import Navbar from '../components/Navbar'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../hooks/useAuth'

const Register = () => {
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const { handleRegister, loading, user, errorMessage, setErrorMessage } = useAuth()
    const navigate = useNavigate()

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
            await handleRegister(name, email, password)
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
                        <h1 className="auth-title">Create an account</h1>
                        <p className="auth-subtitle">Start your job prep journey with Ascend</p>
                    </div>

                    {errorMessage && (
                        <div className="alert-error">
                            <span>⚠</span>
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="auth-form">
                        <div className="form-group">
                            <label className="form-label" htmlFor="register-name">Full Name</label>
                            <input 
                                id="register-name"
                                className="form-input"
                                type="text" 
                                placeholder="Jane Doe" 
                                value={name} 
                                onChange={(e) => setName(e.target.value)} 
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label" htmlFor="register-email">Email</label>
                            <input 
                                id="register-email"
                                className="form-input"
                                type="email" 
                                placeholder="name@example.com" 
                                value={email} 
                                onChange={(e) => setEmail(e.target.value)} 
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label" htmlFor="register-password">Password</label>
                            <input 
                                id="register-password"
                                className="form-input"
                                type="password" 
                                placeholder="••••••••" 
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)} 
                                required
                            />
                        </div>
                        <button type="submit" className="auth-btn">Create Account</button>
                    </form>

                    <p className="auth-footer">
                        Already have an account? <Link to="/login">Sign in</Link>
                    </p>
                </div>
            </main>
        </div>
    )
}

export default Register