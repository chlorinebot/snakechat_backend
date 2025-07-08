const express = require('express');
const router = express.Router();
const userController = require('./controllers/userController');
const roleController = require('./controllers/roleController');
const friendshipController = require('./controllers/friendshipController');
const conversationController = require('./controllers/conversationController');
const messageController = require('./controllers/messageController');
const reportController = require('./controllers/reportController');
const reportRoutes = require('./routes/reportRoutes');
const announcementRoutes = require('./routes/announcementRoutes');

// User routes
router.get('/user/data', userController.getUsers);
router.get('/user/get/:id', userController.getUserById);
router.post('/user/send', userController.createUser);
router.put('/user/update/:id', userController.updateUser);
router.delete('/user/delete/:id', userController.deleteUser);
router.post('/user/login', userController.login);
router.post('/user/lock', userController.lockUser);
router.post('/user/unlock/:id', userController.unlockUser);
router.post('/user/block', userController.blockUser);
router.delete('/user/unblock', userController.unblockUser);
router.get('/user/block-status', userController.checkBlockStatus);
router.get('/user/blocked-users/:id', userController.getBlockedUsers);
router.post('/user/update-status', userController.updateUserStatus);
router.post('/user/update-status-beacon', userController.updateUserStatusBeacon);
router.post('/user/heartbeat', userController.sendHeartbeat);
router.post('/user/appeal', userController.sendAccountAppeal);
router.get('/user/check-lock-status/:id', userController.checkAccountLockStatus);
router.get('/user/lock-history', userController.getLockHistory);
router.post('/user/auto-unlock', userController.autoUnlockExpiredAccounts);

// Report routes
router.use('/report', reportRoutes);

// Announcement routes
router.use('/announcement', announcementRoutes);

// Role routes
router.get('/role/data', roleController.getRoles);
router.post('/role/send', roleController.createRole);
router.put('/role/update/:id', roleController.updateRole);
router.delete('/role/delete/:id', roleController.deleteRole);

// Friendship routes
router.post('/friendship/send', friendshipController.sendFriendRequest);
router.put('/friendship/accept/:id', friendshipController.acceptFriendRequest);
router.delete('/friendship/reject/:id', friendshipController.rejectFriendRequest);
router.delete('/friendship/remove/:id', friendshipController.removeFriend);
router.get('/friendship/friends/:id', friendshipController.getFriends);
router.get('/friendship/received/:id', friendshipController.getReceivedFriendRequests);
router.get('/friendship/sent/:id', friendshipController.getSentFriendRequests);
router.get('/friendship/status', friendshipController.checkFriendshipStatus);

// Conversation routes
router.get('/conversations/user/:userId', conversationController.getUserConversations);
router.get('/conversations/:id', conversationController.getConversationDetails);
router.post('/conversations/create', conversationController.createConversation);
router.post('/conversations/one-to-one', conversationController.getOrCreateOneToOneConversation);

// Message routes
router.get('/messages/conversation/:id', messageController.getConversationMessages);
router.post('/messages/send', messageController.sendMessage);
router.put('/messages/mark-read/:id', messageController.markMessageAsRead);
router.post('/messages/mark-all-read', messageController.markAllMessagesAsRead);
router.get('/messages/read-status', messageController.getMessageReadStatus);

module.exports = router; 