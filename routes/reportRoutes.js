const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

// Route gửi báo cáo/góp ý
router.post('/send', reportController.sendReport);

// Route lấy danh sách báo cáo của người dùng
router.get('/user/:userId', reportController.getUserReports);

// Route lấy tất cả báo cáo (cho admin)
router.get('/all', reportController.getAllReports);

// Route cập nhật trạng thái báo cáo
router.put('/update-status', reportController.updateReportStatus);

module.exports = router; 