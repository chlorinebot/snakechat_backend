const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const blockController = require('../controllers/blockController');
const { pool, isConnected } = require('../db');

// Route lấy danh sách users
router.get('/data', userController.getAllUsers);

// Route thêm user mới
router.post('/send', userController.createUser);

// Route cập nhật user
router.put('/update/:id', userController.updateUser);

// Route xóa user
router.delete('/delete/:id', userController.deleteUser);

// Route khóa tài khoản
router.post('/lock', userController.lockUser);

// Route mở khóa tài khoản
router.post('/unlock/:id', userController.unlockUser);

// Route cập nhật trạng thái user (online/offline)
router.post('/update-status', userController.updateUserStatus);

// Route xử lý heartbeat từ client
router.post('/heartbeat', userController.receiveUserHeartbeat);

// Route cập nhật trạng thái offline qua Beacon API (khi đóng tab)
router.post('/update-status-beacon', userController.updateUserStatusBeacon);

// Route lấy lịch sử khóa tài khoản
router.get('/lock-history', userController.getLockHistory);

// Route kiểm tra các user không hoạt động và cập nhật trạng thái offline
router.post('/check-inactive-users', userController.checkInactiveUsers);

// Route cập nhật cấu trúc cơ sở dữ liệu và thời gian hoạt động
router.get('/update-last-activity', userController.updateLastActivitySystem);

// Block endpoints (tách riêng)
router.post('/block', blockController.blockUser);
router.delete('/unblock', blockController.unblockUser);
router.get('/block-status', blockController.checkBlockStatus);
router.get('/blocked-users/:userId', blockController.getBlockedUsers);

// Kiểm tra trạng thái khóa của tài khoản
router.get('/check-lock-status/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Truy vấn bảng user_lock để kiểm tra tài khoản có đang bị khóa không
        // Chỉ lấy bản ghi có status = 'locked' và thời gian mở khóa > thời gian hiện tại
        const [lockInfo] = await pool.query(
            `SELECT * FROM user_lock 
             WHERE user_id = ? AND status = 'locked' AND unlock_time > NOW() 
             ORDER BY lock_id DESC 
             LIMIT 1`,
            [userId]
        );
        
        if (lockInfo && lockInfo.length > 0) {
            const li = lockInfo[0];
            // Nếu lý do chứa 'chặn', đây là block, không coi là khóa
            if (li.reason && li.reason.toLowerCase().includes('chặn')) {
                return res.json({ isLocked: false });
            }
            // Tài khoản thực sự bị khóa
            console.log(`Tài khoản ID ${userId} đang bị khóa`);
            return res.json({
                isLocked: true,
                lockInfo: {
                    user_id: li.user_id,
                    reason: li.reason,
                    lock_time: li.lock_time,
                    unlock_time: li.unlock_time
                }
            });
        }
        
        // Tài khoản không bị khóa
        return res.json({
            isLocked: false
        });
    } catch (error) {
        console.error('Lỗi khi kiểm tra trạng thái khóa tài khoản:', error);
        res.status(500).json({
            isLocked: false,
            error: 'Đã xảy ra lỗi khi kiểm tra trạng thái khóa tài khoản'
        });
    }
});

// Gửi khiếu nại cho tài khoản bị khóa
router.post('/appeal', userController.sendAccountAppeal);

module.exports = router; 