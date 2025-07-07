const express = require('express');
const router = express.Router();
const conversationController = require('../controllers/conversationController');

// Lấy danh sách cuộc trò chuyện của người dùng
router.get('/user/:userId', conversationController.getUserConversations);

// Lấy chi tiết cuộc trò chuyện theo ID
router.get('/:conversationId', conversationController.getConversationDetails);

// Tạo cuộc trò chuyện mới (nhóm)
router.post('/create', conversationController.createConversation);

// Tạo hoặc lấy cuộc trò chuyện 1-1 giữa hai người dùng
router.post('/one-to-one', conversationController.getOrCreateOneToOneConversation);

module.exports = router; 