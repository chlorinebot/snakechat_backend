const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Đã xảy ra lỗi trong quá trình xử lý'
  });
};

module.exports = errorHandler; 