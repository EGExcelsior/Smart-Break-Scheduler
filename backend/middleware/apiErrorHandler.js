function apiErrorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  console.error('API error:', err);
  return res.status(500).json({
    error: err && err.message ? err.message : 'Internal server error'
  });
}

module.exports = {
  apiErrorHandler
};
