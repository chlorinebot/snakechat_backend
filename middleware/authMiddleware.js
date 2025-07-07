const { pool, isConnected } = require('../db');

// Middleware kiểm tra xác thực
const isAuthenticated = (req, res, next) => {
    // Kiểm tra token (trong ứng dụng thực tế sẽ xác thực JWT)
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Không có quyền truy cập'
        });
    }
    
    // Trong ứng dụng thực tế sẽ xác thực token
    // và lấy thông tin người dùng từ token
    next();
};

// Middleware kiểm tra vai trò admin
const isAdmin = (req, res, next) => {
    // Kiểm tra role_id (trong ứng dụng thực tế sẽ lấy từ token đã giải mã)
    const roleId = req.user?.role_id;
    
    if (roleId !== 1) {
        return res.status(403).json({
            success: false,
            message: 'Bạn không có quyền thực hiện thao tác này'
        });
    }
    
    next();
};

// Middleware kiểm tra trạng thái khóa tài khoản
const checkAccountLockStatus = async (req, res, next) => {
    try {
        const userId = req.user?.user_id || req.user?.id || req.params.userId || req.body.user_id;
        
        if (!userId) {
            return next();
        }
        
        // Kiểm tra tài khoản có bị khóa không
        const [lockInfo] = await pool.query(
            `SELECT * FROM user_lock 
             WHERE user_id = ? AND unlock_time > NOW() 
             ORDER BY lock_id DESC 
             LIMIT 1`,
            [userId]
        );
        
        if (lockInfo && lockInfo.length > 0) {
            // Tài khoản đang bị khóa
            return res.status(403).json({
                success: false,
                isLocked: true,
                message: 'Tài khoản của bạn đã bị khóa',
                lockInfo: {
                    user_id: lockInfo[0].user_id,
                    reason: lockInfo[0].reason,
                    lock_time: lockInfo[0].lock_time,
                    unlock_time: lockInfo[0].unlock_time
                }
            });
        }
        
        next();
    } catch (error) {
        console.error('Lỗi khi kiểm tra trạng thái khóa tài khoản:', error);
        next();
    }
};

module.exports = {
    isAuthenticated,
    isAdmin,
    checkAccountLockStatus
}; 