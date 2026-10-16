
import './App.css'
import { RouterProvider } from 'react-router'
import { router } from './app.routes'
import { AuthProvider } from './features/auth/auth.context'

export default function App() {
  return (
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
  )
}
