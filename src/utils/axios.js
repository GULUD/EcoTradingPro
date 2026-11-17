import axios from 'axios'
import { API_BASE } from './api'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // A wrong current password on the change-password form is a 401 too, but it
    // must show the error instead of signing the user out mid-form
    const url = error.config?.url || ''
    const authAttempt = url.includes('/api/auth/change-password') || url.includes('/api/auth/login')
    if (error.response?.status === 401 && !authAttempt) {
      localStorage.removeItem('token')
      localStorage.removeItem('userType')
      window.location.href = '/'
    }
    return Promise.reject(error)
  }
)

export default api
