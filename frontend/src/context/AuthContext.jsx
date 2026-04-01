import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]   = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  // Initialize auth state from localStorage on mount
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
    console.log('[Auth] Login called with user:', user?.ID, 'token length:', token?.length)
    // Update state first
    setUser(user)
    setToken(token)
    // Store in localStorage for persistence
    const authData = { user, token }
    localStorage.setItem('auth', JSON.stringify(authData))
    console.log('[Auth] Saved to localStorage:', { user: user?.ID, tokenLength: token?.length })
    console.log('[Auth] Verifying localStorage:', localStorage.getItem('auth') ? 'SUCCESS' : 'FAILED')
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('auth')
  }

  // Update local user state (e.g. after role promotion)
  const refreshUser = (updatedUser) => {
    setUser(updatedUser)
    // Update localStorage to keep auth data in sync
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
