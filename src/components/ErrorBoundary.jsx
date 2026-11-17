import React from 'react'

// A single failing widget must not blank the whole app, so every render error lands here
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('[ui] render failed:', error.message)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#0A0F1A] text-gray-100 p-6">
          <div className="text-center space-y-4 max-w-md">
            <h1 className="text-xl font-semibold">This page failed to load</h1>
            <p className="text-sm text-gray-400 break-words">{this.state.error.message}</p>
            <button
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
