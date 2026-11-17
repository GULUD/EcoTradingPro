import axios from 'axios'

// A production build must not fall back to localhost when VITE_API_BASE is absent
const PROD_API = 'https://ecotradingpro-api-production.up.railway.app'
const onLocalHost =
  typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
const fallback = onLocalHost ? 'http://localhost:5000' : PROD_API

export const API_BASE = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || fallback
export const WS_BASE = import.meta.env.VITE_WS_BASE || API_BASE

// Components import the axios package directly, so the default must be global
axios.defaults.baseURL = API_BASE
