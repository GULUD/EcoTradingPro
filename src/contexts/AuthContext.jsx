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
      } else {
        localStorage.removeItem('token')
      }
    } catch (error) {
      console.error('Token verification failed:', error)
      localStorage.removeItem('token')
    } finally {
      setLoading(false)
    }
  }

  const login = async (credentials, userType) => {
    try {
      const endpoint = userType === 'admin' ? 'admin/login' : 'user/login'
      const response = await fetch(`${API_BASE}/api/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        localStorage.setItem('token', data.token)
        localStorage.setItem('userType', userType)
        setUser(data.user)
        return { success: true, requireChange: !!data.requireChange }
      }
      return { success: false, error: data.error || 'Login failed' }
    } catch (error) {
      console.error('Login error:', error)
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
      console.error('Registration error:', error)
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
