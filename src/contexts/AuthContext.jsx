import React, { createContext, useContext, useState, useEffect } from 'react'
import { API_BASE } from '../utils/api'

const AuthContext = createContext()

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      verifyToken(token)
    } else {
      setLoading(false)
    }
  }, [])

  const verifyToken = async (token) => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const data = await response.json()
        setUser(data.user)
      } else if (response.status === 401 || response.status === 403) {
        // Only an explicit auth rejection invalidates the token
        localStorage.removeItem('token')
      }
    } catch (error) {
      // Offline or cold-start errors must not log the user out; the token stays for a later retry
      console.error('[auth] token verification failed', error.message)
    } finally {
      setLoading(false)
    }
  }

  // One endpoint for both roles; the response tells the caller where to land
  const login = async (credentials) => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        localStorage.setItem('token', data.token)
        localStorage.setItem('userType', data.user.role === 'admin' ? 'admin' : 'user')
        setUser(data.user)
        return { success: true, requireChange: !!data.requireChange, role: data.user.role }
      }
      return { success: false, error: data.error || 'Login failed' }
    } catch (error) {
      console.error('[auth] login failed', error.message)
      return { success: false, error: 'Network error. Please try again.' }
    }
  }

  const register = async (userData) => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/user/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        localStorage.setItem('token', data.token)
        localStorage.setItem('userType', 'user')
        setUser(data.user)
        return { success: true }
      }
      return { success: false, error: data.error || 'Registration failed' }
    } catch (error) {
      console.error('[auth] registration failed', error.message)
      return { success: false, error: 'Network error. Please try again.' }
    }
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('userType')
    setUser(null)
    setLoading(false)
  }

  const updateUser = (userData) => {
    setUser(userData)
  }

  const value = {
    user,
    login,
    register,
    logout,
    updateUser,
    loading,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
