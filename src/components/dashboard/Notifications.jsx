
import React, { useEffect, useState } from 'react'
import axios from '../../utils/axios'
import { useWebSocket } from '../../contexts/WebSocketContext'

function Notifications() {
  const { notifications, clearNotifications, removeNotification, isConnected } = useWebSocket()
  const [filter, setFilter] = useState('all')
  const [announcements, setAnnouncements] = useState([])

  useEffect(() => {
    let cancelled = false
    axios
      .get('/api/announcements')
      .then((response) => {
        if (!cancelled) setAnnouncements(Array.isArray(response.data) ? response.data : [])
      })
      .catch((error) => console.error('[announcements] fetch failed', error.message))
    return () => {
      cancelled = true
    }
  }, [])

  const filteredNotifications = notifications.filter(notification => {
    if (filter === 'all') return true
    return notification.type === filter
  })

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'trade': return <i className="fas fa-coins"></i>
      case 'price': return <i className="fas fa-chart-line"></i>
      case 'news': return <i className="fas fa-newspaper"></i>
      case 'system': return <i className="fas fa-cog"></i>
      case 'warning': return <i className="fas fa-exclamation-triangle"></i>
      default: return <i className="fas fa-bell"></i>
    }
  }

  const getNotificationColor = (type) => {
    switch (type) {
      case 'trade': return 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
      case 'price': return 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
      case 'news': return 'bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400'
      case 'system': return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
      case 'warning': return 'bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400'
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Notifications</h2>
          <div className="flex items-center gap-2 mt-1">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-500">
              {isConnected ? 'Real-time updates active' : 'Connection lost'}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
          >
            <option value="all">All</option>
            <option value="trade">Trades</option>
            <option value="price">Price Alerts</option>
            <option value="news">News</option>
            <option value="system">System</option>
          </select>
          {notifications.length > 0 && (
            <button
              onClick={clearNotifications}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Announcements are published by the operator and are not user-specific */}
      {announcements.length > 0 && (
        <div className="glass rounded-2xl p-6">
          <h3 className="text-lg font-semibold mb-4">Platform announcements</h3>
          <div className="space-y-3">
            {announcements.map((item) => (
              <div key={item.id} className="p-4 rounded-lg bg-gray-50 dark:bg-white/5">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="font-semibold text-sm">{item.title}</h4>
                  <span className="text-xs text-gray-500 shrink-0">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {item.content && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap">
                    {item.content}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notifications List */}
      <div className="glass rounded-2xl p-6">
        {filteredNotifications.length === 0 ? (
          <div className="text-center py-12">
            <i className="fas fa-bell text-5xl text-gray-400 mb-4"></i>
            <h3 className="text-xl font-semibold mb-2">No notifications</h3>
            <p className="text-gray-500">
              {filter === 'all' 
                ? "You're all caught up! New notifications will appear here."
                : `No ${filter} notifications found.`
              }
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredNotifications.map((notification) => (
              <div key={notification.id} className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-white/5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition">
                <div className={`p-2 rounded-full ${getNotificationColor(notification.type)}`}>
                  <span className="text-lg">{getNotificationIcon(notification.type)}</span>
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-sm">{notification.title}</h4>
                      <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                        {notification.message}
                      </p>
                    </div>
                    <button
                      onClick={() => removeNotification(notification.id)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-2"
                    >
                      ×
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    <span>{new Date(notification.timestamp || Date.now()).toLocaleTimeString()}</span>
                    {notification.type && (
                      <span className="capitalize bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded">
                        {notification.type}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Notifications
