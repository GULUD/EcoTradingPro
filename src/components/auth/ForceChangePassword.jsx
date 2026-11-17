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
      setError('新密码至少 6 位')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致')
      return
    }

    setLoading(true)
    try {
      await api.post('/api/auth/change-password', { currentPassword, newPassword })
      updateUser({ ...user, requireChange: false })
      navigate(user?.role === 'admin' ? '/admin/dashboard' : '/dashboard', { replace: true })
    } catch (err) {
      setError(err.response?.data?.error || '修改密码失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0A0F1A] px-4">
      <div className="w-full max-w-md bg-white dark:bg-white/5 rounded-2xl p-8 border border-gray-200 dark:border-white/10">
        <h1 className="text-2xl font-bold mb-2">首次登录必须修改密码</h1>
        <p className="text-sm text-gray-500 mb-6">当前密码为初始密码，修改后才能进入系统。</p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">当前密码</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">新密码</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">确认新密码</label>
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
            {loading ? '提交中...' : '确认修改'}
          </button>
          <button
            type="button"
            onClick={logout}
            className="w-full py-2 rounded-lg border border-gray-300 dark:border-white/10 text-sm"
          >
            退出登录
          </button>
        </form>
      </div>
    </div>
  )
}

export default ForceChangePassword
