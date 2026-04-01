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
  const { user, loading } = useAuth()
  if (loading) return <Spinner text="Checking authentication…" />
  if (!user)   return <Navigate to="/login" replace />
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
