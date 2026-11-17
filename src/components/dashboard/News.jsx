
import React, { useState, useEffect } from 'react'
import axios from '../../utils/axios'

function News() {
  const [news, setNews] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedArticle, setSelectedArticle] = useState(null)

  const categories = [
    { value: 'all', label: 'All News' },
    { value: 'general', label: 'General' },
    { value: 'market', label: 'Market Analysis' },
    { value: 'crypto', label: 'Cryptocurrency' },
    { value: 'trading', label: 'Trading Tips' },
    { value: 'platform', label: 'Platform Updates' },
    { value: 'regulation', label: 'Regulation' }
  ]

  // priority is an Int in the database (0 normal, 1 high, 2 urgent);
  // calling toUpperCase on it used to crash the whole page
  const priorityMeta = (priority) => {
    switch (Number(priority)) {
      case 2: return { label: 'URGENT', color: 'text-red-600 dark:text-red-400', icon: 'fas fa-triangle-exclamation text-red-500' }
      case 1: return { label: 'HIGH', color: 'text-orange-600 dark:text-orange-400', icon: 'fas fa-bullhorn text-orange-500' }
      default: return { label: 'NORMAL', color: 'text-blue-600 dark:text-blue-400', icon: 'fas fa-newspaper text-blue-500' }
    }
  }

  const categoryLabel = (value) =>
    categories.find((cat) => cat.value === value)?.label || value || 'General'

  useEffect(() => {
    fetchNews()
  }, [])

  const fetchNews = async () => {
    try {
      const response = await axios.get('/api/news')
      setNews(response.data)
      setLoading(false)
    } catch (error) {
      console.error('[news] list fetch failed', error.message)
      setLoading(false)
    }
  }

  const filteredNews = news.filter(article => {
    const matchesCategory = selectedCategory === 'all' || article.category === selectedCategory
    const text = `${article.title || ''} ${article.content || ''}`.toLowerCase()
    const matchesSearch = text.includes(searchTerm.toLowerCase())
    return matchesCategory && matchesSearch
  })

  const openArticle = async (article) => {
    setSelectedArticle(article)
    try {
      // The detail endpoint is the only place that counts a read
      const response = await axios.get(`/api/news/${article.id}`)
      setSelectedArticle((current) => (current?.id === article.id ? response.data : current))
    } catch (error) {
      console.error('[news] detail fetch failed', error.message)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass rounded-2xl p-6">
        <h2 className="text-2xl font-bold mb-4">Latest News & Updates</h2>
        
        {/* Search and Filter */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search articles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {categories.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* News Grid */}
      {filteredNews.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <i className="fas fa-newspaper text-5xl text-gray-400 mb-4"></i>
          <h3 className="text-xl font-semibold mb-2">No articles found</h3>
          <p className="text-gray-500">
            {searchTerm || selectedCategory !== 'all' 
              ? 'Try adjusting your search or filter criteria'
              : 'Check back later for the latest news and updates'
            }
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredNews.map((article) => {
            const meta = priorityMeta(article.priority)
            return (
            <div key={article._id} className="glass rounded-2xl p-6 hover:shadow-lg transition cursor-pointer" onClick={() => openArticle(article)}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <i className={meta.icon}></i>
                  <span className={`text-sm font-medium ${meta.color}`}>
                    {meta.label}
                  </span>
                </div>
                <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                  {categoryLabel(article.category)}
                </span>
              </div>
              
              <h3 className="font-bold text-lg mb-2 line-clamp-2">{article.title}</h3>
              
              {article.summary && (
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-3 line-clamp-2">
                  {article.summary}
                </p>
              )}
              
              <p className="text-gray-700 dark:text-gray-300 text-sm mb-4 line-clamp-3">
                {article.content}
              </p>
              
              <div className="flex justify-between items-center text-xs text-gray-500">
                <span>By {article.author || 'Editorial Team'}</span>
                <span>{new Date(article.publishedAt || article.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
            )
          })}
        </div>
      )}

      {/* Article Modal */}
      {selectedArticle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <i className={`${priorityMeta(selectedArticle.priority).icon} text-3xl`}></i>
                  <div>
                    <h2 className="text-2xl font-bold">{selectedArticle.title}</h2>
                    <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                      <span>By {selectedArticle.author || 'Editorial Team'}</span>
                      <span>{new Date(selectedArticle.publishedAt || selectedArticle.createdAt).toLocaleDateString()}</span>
                      <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                        {categoryLabel(selectedArticle.category)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              <button
                onClick={() => setSelectedArticle(null)}
                className="text-gray-500 hover:text-gray-700 text-2xl ml-4"
              >
                ×
              </button>
            </div>
            
            <div className="prose dark:prose-invert max-w-none">
              {selectedArticle.summary && (
                <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg mb-6">
                  <p className="text-gray-700 dark:text-gray-300 font-medium">{selectedArticle.summary}</p>
                </div>
              )}
              <div className="whitespace-pre-wrap">{selectedArticle.content}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default News
