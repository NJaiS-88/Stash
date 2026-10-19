
import './App.css'
import { RouterProvider } from 'react-router'
import { router } from './app.routes'
import { AuthProvider } from './features/auth/auth.context'
import { GalleryProvider } from './features/gallery/gallery.context'

export default function App() {
  return (
    <AuthProvider>
      <GalleryProvider>
        <RouterProvider router={router} />
      </GalleryProvider>
    </AuthProvider>
  )
}
