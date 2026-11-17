module.exports = (err, req, res, next) => {
  console.error(`[error] ${req.method} ${req.originalUrl}`, err.stack)
  const isDev = process.env.NODE_ENV !== 'production'
  res.status(err.status || 500).json({
    success: false,
    error: isDev ? err.message : 'internal server error',
    message: isDev ? err.message : 'internal server error',
    ...(isDev && { stack: err.stack }),
  })
}
