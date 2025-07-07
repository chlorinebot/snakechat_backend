const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');

// Lấy tin nhắn trong cuộc trò chuyện
router.get('/conversation/:conversationId', messageController.getConversationMessages);

// Gửi tin nhắn mới
router.post('/send', messageController.sendMessage);

// Đánh dấu tin nhắn đã đọc
router.put('/mark-read/:messageId', messageController.markMessageAsRead);

// Đánh dấu tất cả tin nhắn trong cuộc trò chuyện là đã đọc
router.post('/mark-all-read', messageController.markAllMessagesAsRead);

// Lấy thông tin trạng thái đã đọc của tin nhắn
router.get('/read-status', messageController.getMessageReadStatus);

// Gửi tin nhắn hệ thống đến người dùng
router.post('/system', messageController.sendSystemMessage);

module.exports = router; 