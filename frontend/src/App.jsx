import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import TeamMembers from './pages/TeamMembers'
import Locations from './pages/Locations'
import Achievements from './pages/Achievements'
import Metadata from './pages/Metadata'
import Teams from './pages/Teams'
import Login from './pages/Login'
import Register from './pages/Register'
import Spinner from './components/Spinner'
import './App.css'

function ProtectedLayout() {
  const { user, loading, login } = useAuth()
  
  console.log('[ProtectedLayout] Rendering, user:', user?.ID, 'loading:', loading)
  
  // If loading, show spinner
  if (loading) return <Spinner text="Checking authentication…" />
  
  // If no user in state, try to restore from localStorage as fallback
  if (!user) {
    console.log('[ProtectedLayout] No user in state, checking localStorage for fallback')
    try {
      const stored = localStorage.getItem('auth')
      if (stored) {
        const parsed = JSON.parse(stored)
        console.log('[ProtectedLayout] Found auth in localStorage:', { userID: parsed.user?.ID, hasToken: !!parsed.token })
        if (parsed.user && parsed.token) {
          // Restore auth from localStorage
          console.log('[ProtectedLayout] Restoring auth from localStorage')
          login(parsed.user, parsed.token)
          // Component will re-render with user set
          return <Spinner text="Restoring session…" />
        }
      } else {
        console.warn('[ProtectedLayout] No auth data in localStorage')
      }
    } catch (e) {
      console.error('Failed to restore auth from localStorage:', e)
    }
    // No valid auth found, redirect to login
    console.log('[ProtectedLayout] No auth found, redirecting to login')
    return <Navigate to="/login" replace />
  }
  
  console.log('[ProtectedLayout] User authenticated, rendering protected routes')
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/"            element={<Dashboard />} />
          <Route path="/members"     element={<TeamMembers />} />
          <Route path="/teams"       element={<Teams />} />
          <Route path="/locations"   element={<Locations />} />
          <Route path="/achievements" element={<Achievements />} />
          <Route path="/metadata"    element={<Metadata />} />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/*"        element={<ProtectedLayout />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
