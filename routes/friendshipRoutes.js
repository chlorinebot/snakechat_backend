const express = require('express');
const router = express.Router();
const FriendshipController = require('../controllers/friendshipController');

// Gửi lời mời kết bạn
router.post('/send', FriendshipController.sendFriendRequest);

// Chấp nhận lời mời kết bạn
router.put('/accept/:friendshipId', FriendshipController.acceptFriendRequest);

// Từ chối hoặc hủy lời mời kết bạn
router.delete('/reject/:friendshipId', FriendshipController.rejectFriendRequest);

// Hủy kết bạn (xóa mối quan hệ bạn bè đã được chấp nhận)
router.delete('/remove/:friendshipId', FriendshipController.removeFriend);

// Kiểm tra trạng thái kết bạn giữa hai người dùng
router.get('/status', FriendshipController.checkFriendshipStatus);

// Lấy danh sách bạn bè
router.get('/friends/:userId', FriendshipController.getFriends);

// Lấy danh sách lời mời kết bạn đã nhận
router.get('/received/:userId', FriendshipController.getReceivedRequests);

// Lấy danh sách lời mời kết bạn đã gửi
router.get('/sent/:userId', FriendshipController.getSentRequests);

module.exports = router; 