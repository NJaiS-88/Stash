import Navbar from '../components/Navbar'
import { useAuth } from '../hooks/useAuth'
const Home = () => {
  const { user } = useAuth()
  return (
    <>
        <Navbar />
        <h1>HOME PAGE</h1>
    </>
  )
}

export default Home