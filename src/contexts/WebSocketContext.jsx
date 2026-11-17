import React, { createContext, useContext, useEffect, useState } from 'react'
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
  const { user } = useAuth()
  const [socket, setSocket] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [marketData, setMarketData] = useState({})
  const [notifications, setNotifications] = useState([])

  useEffect(() => {
    const newSocket = io(WS_BASE, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      timeout: 8000,
      // The server derives the private room from this token; user ids sent by the client are ignored
      auth: { token: localStorage.getItem('token') || '' },
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
          next[`${p.symbol}/USDT`] = { ...(prev[`${p.symbol}/USDT`] || {}), ...p, change: p.change24h }
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
                next[`${p.symbol}/USDT`] = { ...(prev[`${p.symbol}/USDT`] || {}), ...p, change: p.change24h }
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
  }, [user])

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
