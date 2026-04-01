import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]   = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('auth')
      if (stored) {
        const parsed = JSON.parse(stored)
        setUser(parsed.user)
        setToken(parsed.token)
      }
    } catch {}
    setLoading(false)
  }, [])

  const login = (user, token) => {
    setUser(user)
    setToken(token)
    localStorage.setItem('auth', JSON.stringify({ user, token }))
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('auth')
  }

  // Update local user state (e.g. after role promotion)
  const refreshUser = (updatedUser) => {
    setUser(updatedUser)
    const stored = localStorage.getItem('auth')
    if (stored) {
      const parsed = JSON.parse(stored)
      localStorage.setItem('auth', JSON.stringify({ ...parsed, user: updatedUser }))
    }
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
