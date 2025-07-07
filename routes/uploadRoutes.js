const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const upload = require('../middleware/uploadMiddleware');

// Upload avatar và lưu trên Cloudinary
router.post('/avatar', upload.single('avatar'), uploadController.uploadAvatar);

// Cập nhật URL avatar vào database
router.post('/avatar/update', uploadController.updateAvatarUrl);

// Xóa avatar cũ trên Cloudinary
router.post('/avatar/delete', uploadController.deleteOldAvatar);

module.exports = router; 