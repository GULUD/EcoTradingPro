import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../utils/axios'

function ForceChangePassword() {
  const { user, updateUser, logout } = useAuth()
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (newPassword.length < 6) {
      setError('The new password must be at least 6 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match')
      return
    }

    setLoading(true)
    try {
      await api.post('/api/auth/change-password', { currentPassword, newPassword })
      updateUser({ ...user, requireChange: false })
      navigate(user?.role === 'admin' ? '/admin/dashboard' : '/dashboard', { replace: true })
    } catch (err) {
      setError(err.response?.data?.error || 'Could not change the password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0A0F1A] px-4">
      <div className="w-full max-w-md bg-white dark:bg-white/5 rounded-2xl p-8 border border-gray-200 dark:border-white/10">
        <h1 className="text-2xl font-bold mb-2">Change your password</h1>
        <p className="text-sm text-gray-500 mb-6">
          This account still uses a temporary password. Set a new one to continue.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-lg bg-emerald-500 text-white font-semibold hover:bg-emerald-600 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Update password'}
          </button>
          <button
            type="button"
            onClick={() => {
              logout()
              navigate(user?.role === 'admin' ? '/auth/admin' : '/auth/login', { replace: true })
            }}
            className="w-full py-2 rounded-lg border border-gray-300 dark:border-white/10 text-sm"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  )
}

export default ForceChangePassword
