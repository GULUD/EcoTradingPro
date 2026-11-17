import React, { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import { AuthProvider } from './contexts/AuthContext'
import { WebSocketProvider } from './contexts/WebSocketContext'
import LandingPage from './components/LandingPage'
import UserLogin from './components/auth/UserLogin'
import UserRegister from './components/auth/UserRegister'
import AdminLogin from './components/auth/AdminLogin'
import ForceChangePassword from './components/auth/ForceChangePassword'
import ProtectedRoute from './components/ProtectedRoute'

// Dashboards are split out; anonymous visitors only download the landing bundle
const UserDashboard = lazy(() => import('./components/dashboard/UserDashboard'))
const AdminDashboard = lazy(() => import('./components/dashboard/AdminDashboard'))

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <WebSocketProvider>
          <Suspense fallback={<div className="min-h-screen grid place-items-center text-sm text-gray-500">Loading...</div>}>
            <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/auth/login" element={<UserLogin />} />
            <Route path="/auth/register" element={<UserRegister />} />
            <Route path="/auth/admin" element={<AdminLogin />} />
            <Route
              path="/auth/force-change-password"
              element={
                <ProtectedRoute>
                  <ForceChangePassword />
                </ProtectedRoute>
              }
            />

            <Route
              path="/dashboard/*"
              element={
                <ProtectedRoute requiredRole="user">
                  <UserDashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/dashboard/*"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </WebSocketProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
