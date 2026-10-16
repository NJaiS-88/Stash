import Navbar from '../components/Navbar'
import { useAuth } from '../hooks/useAuth'

const Dashboard = () => {
    const { user } = useAuth()

    return (
        <div className="page-container">
            <Navbar />
            <main className="dashboard-container">
                <div className="dashboard-header">
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '6px' }}>
                        Welcome back{user?.username ? `, ${user.username}` : ''}!
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        Ready to prepare for your next opportunity? Choose a module below to get started.
                    </p>
                </div>

                <div className="dashboard-grid">
                    <div className="dashboard-card">
                        <div style={{ fontSize: '1.5rem', marginBottom: '12px' }}>🎙️</div>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '6px' }}>AI Mock Interview</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '16px' }}>
                            Start an interactive voice or text interview session based on your target role.
                        </p>
                        <button className="btn-nav-primary" style={{ width: '100%', fontSize: '0.85rem' }}>
                            Start Practice Session
                        </button>
                    </div>

                    <div className="dashboard-card">
                        <div style={{ fontSize: '1.5rem', marginBottom: '12px' }}>📝</div>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '6px' }}>Resume Scanner</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '16px' }}>
                            Upload your resume against a job description to see matching scores and ATS keywords.
                        </p>
                        <button className="btn-logout" style={{ width: '100%', fontSize: '0.85rem' }}>
                            Upload Resume
                        </button>
                    </div>

                    <div className="dashboard-card">
                        <div style={{ fontSize: '1.5rem', marginBottom: '12px' }}>⚡</div>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '6px' }}>Coding & System Design</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '16px' }}>
                            Practice frequently asked algorithmic and architectural questions with AI hints.
                        </p>
                        <button className="btn-logout" style={{ width: '100%', fontSize: '0.85rem' }}>
                            Explore Problems
                        </button>
                    </div>
                </div>
            </main>
        </div>
    )
}

export default Dashboard;