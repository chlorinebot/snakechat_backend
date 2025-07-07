const express = require('express');
const router = express.Router();
const announcementController = require('../controllers/announcementController');

// Lấy tất cả thông báo chung
router.get('/all', announcementController.getAllAnnouncements);

// Lấy thông báo chung theo ID
router.get('/:id', announcementController.getAnnouncementById);

// Tạo thông báo chung mới
router.post('/create', announcementController.createAnnouncement);

// Cập nhật thông báo chung
router.put('/update/:id', announcementController.updateAnnouncement);

// Xóa thông báo chung
router.delete('/delete/:id', announcementController.deleteAnnouncement);

module.exports = router; 