import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { useAuth } from './AuthContext'
import { API_BASE, WS_BASE } from '../utils/api'

const WebSocketContext = createContext()

export const useWebSocket = () => {
  const context = useContext(WebSocketContext)
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider')
  }
  return context
}

export const WebSocketProvider = ({ children }) => {
  const { user, updateUser } = useAuth()
  const [socket, setSocket] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [marketData, setMarketData] = useState({})
  const [notifications, setNotifications] = useState([])

  // Refs keep the socket handlers current without making the effect depend on their values
  const tokenRef = useRef(localStorage.getItem('token') || '')
  tokenRef.current = localStorage.getItem('token') || ''
  const userRef = useRef(user)
  userRef.current = user

  useEffect(() => {
    const refreshProfile = async () => {
      const token = tokenRef.current
      if (!token) return
      try {
        const response = await fetch(`${API_BASE}/api/users/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) return
        const data = await response.json()
        // profile omits role, so merge over the known user instead of replacing it
        updateUser({ ...(userRef.current || {}), ...data })
      } catch (error) {
        console.error('[ws] profile refresh failed', error.message)
      }
    }

    const newSocket = io(WS_BASE, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      timeout: 8000,
      // The server derives the private room from this token; user ids sent by the client are ignored
      auth: { token: tokenRef.current },
    })

    newSocket.on('connect', () => {
      console.log('[ws] connected')
      setIsConnected(true)
      newSocket.emit('join', 'market')
    })

    newSocket.on('disconnect', () => {
      console.log('[ws] disconnected')
      setIsConnected(false)
    })

    newSocket.on('price:update', (payload) => {
      setMarketData((prev) => {
        const next = { ...prev }
        for (const p of payload.prices || []) {
          next[`${p.symbol}/GULU`] = { ...(prev[`${p.symbol}/GULU`] || {}), ...p, change: p.change24h }
        }
        return next
      })
    })

    newSocket.on('trade:executed', (trade) => {
      setNotifications((prev) => [
        {
          id: `trade-${trade.time}-${Math.random()}`,
          title: 'Trade executed',
          message: `${trade.side} ${trade.size} ${trade.symbol} @ ${trade.price}`,
        },
        ...prev.slice(0, 19),
      ])
    })

    newSocket.on('notification', (notification) => {
      setNotifications((prev) => [notification, ...prev.slice(0, 19)])
      if (Notification.permission === 'granted') {
        new Notification(notification.title, { body: notification.message })
      }
    })

    // Balance can change without this client placing an order (admin edits, P2P release)
    newSocket.on('balance:update', refreshProfile)
    newSocket.on('p2p:order', refreshProfile)

    setSocket(newSocket)

    // Render free tier sleeps: fall back to polling while the socket is down
    const timer = setInterval(() => {
      if (!newSocket.connected) {
        fetch(`${API_BASE}/api/market/list`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (!d || !Array.isArray(d.data)) return
            setMarketData((prev) => {
              const next = { ...prev }
              for (const p of d.data) {
                next[`${p.symbol}/GULU`] = { ...(prev[`${p.symbol}/GULU`] || {}), ...p, change: p.change24h }
              }
              return next
            })
          })
          .catch(() => {})
      }
    }, 4000)

    return () => {
      clearInterval(timer)
      newSocket.close()
    }
    // Reconnecting on every balance update (new user object) dropped pushes, so only the id matters
  }, [user?.id])

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  const joinMarketData = () => {
    if (socket) socket.emit('join', 'market')
  }

  const leaveMarketData = () => {
    if (socket) socket.emit('leave', 'market')
  }

  const clearNotifications = () => setNotifications([])
  const removeNotification = (id) => setNotifications((prev) => prev.filter((n) => n.id !== id))

  const value = {
    socket,
    isConnected,
    marketData,
    notifications,
    joinMarketData,
    leaveMarketData,
    clearNotifications,
    removeNotification,
  }

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>
}
