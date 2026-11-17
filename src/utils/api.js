import axios from 'axios'

export const API_BASE = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || 'http://localhost:5000'
export const WS_BASE = import.meta.env.VITE_WS_BASE || API_BASE

// Components import the axios package directly, so the default must be global
axios.defaults.baseURL = API_BASE
