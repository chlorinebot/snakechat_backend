const express = require('express');
const router = express.Router();
const roleController = require('../controllers/roleController');

// Route lấy danh sách vai trò
router.get('/data', roleController.getAllRoles);

// Route thêm vai trò mới
router.post('/send', roleController.createRole);

// Route cập nhật vai trò
router.put('/update/:id', roleController.updateRole);

// Route xóa vai trò
router.delete('/delete/:id', roleController.deleteRole);

module.exports = router; 