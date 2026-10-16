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
        return <div>Loading...</div>
    }

    return (
        <div>
            <Navbar />
            <h1>Register</h1>
            {errorMessage && <p style={{ color: 'red' }}>{errorMessage}</p>}
            <form onSubmit={handleSubmit}>
                <input 
                    type="text" 
                    placeholder="Name" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                />
                <input 
                    type="email" 
                    placeholder="Email" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                />
                <input 
                    type="password" 
                    placeholder="Password" 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                />
                <button type="submit">Register</button>
            </form>
            <p>Already have an account? <Link to="/login">Login</Link></p>
        </div>
    )
}

export default Register