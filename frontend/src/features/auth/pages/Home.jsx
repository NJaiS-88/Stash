import Navbar from '../components/Navbar'
import { Link } from 'react-router'
import { useAuth } from '../hooks/useAuth'

const Home = () => {
    const { user } = useAuth()

    return (
        <div className="page-container">
            <Navbar />
            
            <section className="hero-section">
                <div className="hero-pill">
                    <span>✨</span>
                    <span>AI-Powered Career Intelligence</span>
                </div>
                <h1 className="hero-title">
                    Master your job interviews with generative AI.
                </h1>
                <p className="hero-subtitle">
                    Personalized interview practice, instant resume critique, and role-specific technical evaluations designed to help you land offers faster.
                </p>
                <div className="hero-cta">
                    {user ? (
                        <Link to="/dashboard" className="btn-nav-primary" style={{ padding: '12px 24px', fontSize: '0.95rem' }}>
                            Go to Dashboard →
                        </Link>
                    ) : (
                        <>
                            <Link to="/register" className="btn-nav-primary" style={{ padding: '12px 24px', fontSize: '0.95rem' }}>
                                Get Started Free →
                            </Link>
                            <Link to="/login" className="btn-logout" style={{ padding: '12px 24px', fontSize: '0.95rem' }}>
                                Sign In
                            </Link>
                        </>
                    )}
                </div>
            </section>

            <section className="hero-cards">
                <div className="feature-card">
                    <div className="feature-icon">🎯</div>
                    <h3 className="feature-title">AI Mock Interviews</h3>
                    <p className="feature-desc">
                        Experience realistic behavioral and technical interview questions tuned to your target company and role.
                    </p>
                </div>
                <div className="feature-card">
                    <div className="feature-icon">📄</div>
                    <h3 className="feature-title">Smart Resume Analysis</h3>
                    <p className="feature-desc">
                        Get actionable insights and ATS optimization suggestions to help your application stand out.
                    </p>
                </div>
                <div className="feature-card">
                    <div className="feature-icon">📊</div>
                    <h3 className="feature-title">Instant Performance Feedback</h3>
                    <p className="feature-desc">
                        Identify knowledge gaps and track your readiness with detailed scoring and answer breakdowns.
                    </p>
                </div>
            </section>
        </div>
    )
}

export default Home