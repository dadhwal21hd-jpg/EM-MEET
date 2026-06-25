import { createContext, useContext, useState, useEffect } from 'react'
import { api, setAuthToken, setUnauthorizedHandler } from '../api/axios'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('dr_token'))
  const [user, setUser]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('dr_user')) } catch { return null }
  })

  const logout = () => {
    localStorage.removeItem('dr_token')
    localStorage.removeItem('dr_user')
    setToken(null)
    setUser(null)
    setAuthToken(null)
  }

  useEffect(() => {
    setUnauthorizedHandler(logout)
    const saved = localStorage.getItem('dr_token')
    if (saved) setAuthToken(saved)
  }, [])

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password })
    const { access_token, user: userData } = res.data
    localStorage.setItem('dr_token', access_token)
    localStorage.setItem('dr_user', JSON.stringify(userData))
    setAuthToken(access_token)
    setToken(access_token)
    setUser(userData)
  }

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
