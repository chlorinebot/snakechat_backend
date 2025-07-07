const { pool, isConnected } = require('../db');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

const userService = {
  getAllUsers: async () => {
    // Truy vấn để lấy thông tin người dùng và thông tin khóa (nếu có)
    const [rows] = await pool.query(
      `SELECT users.*, role.role_name, 
       user_lock.lock_id, user_lock.reason, user_lock.status AS lock_status, user_lock.lock_time, user_lock.unlock_time 
       FROM users 
       JOIN role ON users.role_id = role.role_id 
       LEFT JOIN user_lock ON users.user_id = user_lock.user_id`
    );
    return rows;
  },

  // Lấy thông tin người dùng theo ID
  getUserById: async (userId) => {
    const [rows] = await pool.query(
      `SELECT users.*, role.role_name, 
       user_lock.lock_id, user_lock.reason, user_lock.status AS lock_status, user_lock.lock_time, user_lock.unlock_time 
       FROM users 
       JOIN role ON users.role_id = role.role_id 
       LEFT JOIN user_lock ON users.user_id = user_lock.user_id
       WHERE users.user_id = ?`,
      [userId]
    );
    
    if (rows.length === 0) {
      throw new Error('Không tìm thấy user');
    }
    
    return rows[0];
  },

  createUser: async (userData) => {
    const { username, email, password, birthday, role_id } = userData;
    
    // Mã hóa mật khẩu
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    
    const [result] = await pool.query(
      'INSERT INTO users (username, email, password, birthday, role_id) VALUES (?, ?, ?, ?, ?)',
      [username, email, hashedPassword, birthday, role_id]
    );
    
    return {
      id: result.insertId,
      username,
      email,
      role_id
    };
  },

  updateUser: async (userId, userData) => {
    const { username, email, birthday, role_id, password } = userData;
    let hashedPassword = undefined;
    
    // Nếu có cập nhật mật khẩu
    if (password) {
      hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    }
    
    // Cập nhật thông tin cơ bản
    let query = 'UPDATE users SET username = ?, email = ?, birthday = ?, role_id = ?';
    let params = [username, email, birthday, role_id];
    
    // Nếu có mật khẩu mới, thêm vào câu query
    if (hashedPassword) {
      query += ', password = ?';
      params.push(hashedPassword);
    }
    
    query += ' WHERE user_id = ?';
    params.push(userId);
    
    const [result] = await pool.query(query, params);
    
    if (result.affectedRows === 0) {
      throw new Error('Không tìm thấy user');
    }
    
    return {
      user_id: userId,
      username,
      email,
      role_id
    };
  },

  deleteUser: async (userId) => {
    const [result] = await pool.query('DELETE FROM users WHERE user_id = ?', [userId]);
    
    if (result.affectedRows === 0) {
      throw new Error('Không tìm thấy user');
    }
    
    return true;
  },

  lockUser: async (lockData) => {
    const { user_id, reason, lock_time, unlock_time, status } = lockData;
    
    // Kiểm tra user có tồn tại không
    const [userRows] = await pool.query('SELECT * FROM users WHERE user_id = ?', [user_id]);
    
    if (userRows.length === 0) {
      throw new Error('Không tìm thấy user');
    }
    
    console.log('======= DEBUG TIMEZONE =======');
    console.log('Thời gian khóa từ client (UTC ISO):', lock_time);
    console.log('Thời gian mở khóa từ client (UTC ISO):', unlock_time);
    
    // Chuyển đổi thời gian từ UTC sang múi giờ Việt Nam (UTC+7) 
    // Sử dụng DATE_ADD thay vì CONVERT_TZ vì một số cài đặt MySQL không hỗ trợ đầy đủ CONVERT_TZ
    const [convertedTimes] = await pool.query(
      `SELECT 
        DATE_ADD(?, INTERVAL 7 HOUR) as lock_time_vn,
        DATE_ADD(?, INTERVAL 7 HOUR) as unlock_time_vn
      `,
      [lock_time, unlock_time]
    );
    
    console.log('Thời gian đã chuyển đổi sang múi giờ VN:', convertedTimes[0]);
    
    const lock_time_vn = convertedTimes[0].lock_time_vn;
    const unlock_time_vn = convertedTimes[0].unlock_time_vn;
    
    // Kiểm tra xem đã có bản ghi lock cho user này chưa
    const [existingLock] = await pool.query('SELECT * FROM user_lock WHERE user_id = ?', [user_id]);
    
    let savedLockId = null;
    
    if (existingLock.length > 0) {
      // Nếu đã có, cập nhật thông tin khóa
      const [result] = await pool.query(
        'UPDATE user_lock SET reason = ?, lock_time = ?, unlock_time = ?, status = ? WHERE user_id = ?',
        [reason, lock_time_vn, unlock_time_vn, status, user_id]
      );
      
      if (result.affectedRows === 0) {
        throw new Error('Không thể khóa tài khoản');
      }
      
      savedLockId = existingLock[0].lock_id;
    } else {
      // Nếu chưa có, tạo mới
      const [result] = await pool.query(
        'INSERT INTO user_lock (user_id, reason, lock_time, unlock_time, status) VALUES (?, ?, ?, ?, ?)',
        [user_id, reason, lock_time_vn, unlock_time_vn, status]
      );
      
      if (result.affectedRows === 0) {
        throw new Error('Không thể khóa tài khoản');
      }
      
      savedLockId = result.insertId;
    }
    
    // Sau khi lưu, kiểm tra dữ liệu đã lưu để xác nhận
    const [savedData] = await pool.query(
      'SELECT * FROM user_lock WHERE lock_id = ?',
      [savedLockId]
    );
    
    console.log('Dữ liệu đã lưu trong database:', savedData[0]);
    
    // Thiết lập truy vấn để lấy dữ liệu với múi giờ rõ ràng
    const [timeZoneData] = await pool.query(
      `SELECT 
        lock_time, 
        unlock_time,
        CONVERT_TZ(lock_time, @@session.time_zone, '+00:00') as lock_time_utc,
        CONVERT_TZ(unlock_time, @@session.time_zone, '+00:00') as unlock_time_utc,
        @@session.time_zone as db_timezone,
        NOW() as server_now
      FROM user_lock WHERE lock_id = ?`,
      [savedLockId]
    );
    
    console.log('Chi tiết múi giờ của dữ liệu đã lưu:', timeZoneData[0]);
    console.log('======= END DEBUG TIMEZONE =======');
    
    return {
      user_id,
      status,
      lock_time: savedData[0]?.lock_time,
      unlock_time: savedData[0]?.unlock_time,
      timezone_info: {
        db_timezone: timeZoneData[0]?.db_timezone,
        server_now: timeZoneData[0]?.server_now
      }
    };
  },

  // Hàm kiểm tra mật khẩu
  verifyPassword: async (plainPassword, hashedPassword) => {
    return await bcrypt.compare(plainPassword, hashedPassword);
  },

  unlockUser: async (userId) => {
    // Kiểm tra user có tồn tại không
    const [userRows] = await pool.query('SELECT * FROM users WHERE user_id = ?', [userId]);
    
    if (userRows.length === 0) {
      throw new Error('Không tìm thấy user');
    }
    
    // Kiểm tra xem có bản ghi khóa nào cho user này không
    const [existingLock] = await pool.query('SELECT * FROM user_lock WHERE user_id = ?', [userId]);
    
    if (existingLock.length === 0) {
      throw new Error('Tài khoản không bị khóa');
    }
    
    // Cập nhật trạng thái thành "unlocked"
    const [result] = await pool.query(
      'UPDATE user_lock SET status = ? WHERE user_id = ?',
      ['unlocked', userId]
    );
    
    if (result.affectedRows === 0) {
      throw new Error('Không thể mở khóa tài khoản');
    }
    
    return {
      user_id: userId,
      status: 'unlocked'
    };
  },

  // Cập nhật trạng thái user (online/offline)
  updateUserStatus: async (userId, status, force = false) => {
    try {
      // Kiểm tra xem cột status đã tồn tại trong bảng users chưa
      const [columns] = await pool.query(`SHOW COLUMNS FROM users LIKE 'status'`);
      
      if (columns.length === 0) {
        // Nếu cột status chưa tồn tại, thêm cột này vào bảng users
        await pool.query(`ALTER TABLE users ADD COLUMN status ENUM('online', 'offline') DEFAULT 'offline'`);
      } else if (columns[0].Type !== "enum('online','offline')") {
        // Cập nhật kiểu dữ liệu nếu khác
        await pool.query(`ALTER TABLE users MODIFY COLUMN status ENUM('online', 'offline') DEFAULT 'offline'`);
        
        // Cập nhật trạng thái away thành offline
        await pool.query(`UPDATE users SET status = 'offline' WHERE status = 'away'`);
      }
      
      // Kiểm tra user có tồn tại không
      const [userRows] = await pool.query('SELECT * FROM users WHERE user_id = ?', [userId]);
      
      if (userRows.length === 0) {
        throw new Error('Không tìm thấy user');
      }
      
      // Kiểm tra trạng thái hiện tại để tránh cập nhật không cần thiết
      const currentStatus = userRows[0].status;
      
      // Nếu đang yêu cầu cập nhật giống với trạng thái hiện tại và không có force
      if (currentStatus === status && !force) {
        console.log(`User ${userId} đã ở trạng thái ${status}, bỏ qua cập nhật`);
        return {
          user_id: userId,
          status,
          unchanged: true
        };
      }
      
      // Xử lý cập nhật trạng thái với các tùy chọn khác nhau
      let query = '';
      let params = [];
      
      // Nếu cập nhật trạng thái offline và force = true, cập nhật cả last_activity
      if (status === 'offline' && force) {
        // Cập nhật cả status và last_activity
        query = 'UPDATE users SET status = ?, last_activity = NOW() WHERE user_id = ?';
        params = [status, userId];
        
        await pool.query(query, params);
        
        // Log cập nhật
        console.log(`Đã cập nhật trạng thái ${status} (force) và last_activity cho user ${userId}`);
      } else if (status === 'online') {
        // Cập nhật trạng thái và thời gian hoạt động khi online
        query = 'UPDATE users SET status = ?, last_activity = NOW() WHERE user_id = ?';
        params = [status, userId];
        
        await pool.query(query, params);
        
        // Log cập nhật
        console.log(`Đã cập nhật trạng thái ${status} và last_activity cho user ${userId}`);
      } else {
        // Cập nhật chỉ status cho các trường hợp khác
        query = 'UPDATE users SET status = ? WHERE user_id = ?';
        params = [status, userId];
        
        await pool.query(query, params);
        
        // Log cập nhật
        console.log(`Đã cập nhật trạng thái ${status} cho user ${userId}`);
      }
      
      return {
        user_id: userId,
        status,
        force
      };
    } catch (error) {
      console.error('Lỗi SQL khi cập nhật trạng thái:', error.message);
      throw error;
    }
  },

  // Cập nhật thời gian hoạt động cuối cùng của người dùng
  updateLastActivityTime: async (userId) => {
    try {
      // Kiểm tra xem cột last_activity đã tồn tại trong bảng users chưa
      const [columns] = await pool.query(`SHOW COLUMNS FROM users LIKE 'last_activity'`);
      
      if (columns.length === 0) {
        // Nếu cột last_activity chưa tồn tại, thêm cột này vào bảng users
        await pool.query(`ALTER TABLE users ADD COLUMN last_activity TIMESTAMP NULL DEFAULT NULL`);
        console.log('Đã thêm cột last_activity vào bảng users');
      }
      
      // Cập nhật thời gian hoạt động cuối cùng theo múi giờ Việt Nam (UTC+7)
      // Sử dụng NOW() trực tiếp vì MySQL đã được cấu hình múi giờ UTC+7 trong db.js
      const [result] = await pool.query(
        'UPDATE users SET last_activity = NOW() WHERE user_id = ?',
        [userId]
      );
      
      if (result.affectedRows === 0) {
        console.log('Không thể cập nhật thời gian hoạt động - affected rows = 0');
        throw new Error('Không thể cập nhật thời gian hoạt động');
      }
      
      // Lấy thời gian đã cập nhật
      const [updatedTime] = await pool.query(
        'SELECT last_activity FROM users WHERE user_id = ?',
        [userId]
      );
      
      return {
        user_id: userId,
        last_activity: updatedTime[0]?.last_activity || null
      };
    } catch (error) {
      console.error('Lỗi SQL khi cập nhật thời gian hoạt động:', error.message);
      throw error;
    }
  },

  // Kiểm tra và thêm cột last_activity nếu chưa tồn tại
  checkLastActivityColumn: async () => {
    try {
      // Kiểm tra xem cột last_activity đã tồn tại trong bảng users chưa
      const [columns] = await pool.query(`SHOW COLUMNS FROM users LIKE 'last_activity'`);
      
      if (columns.length === 0) {
        // Nếu cột last_activity chưa tồn tại, thêm cột này vào bảng users
        await pool.query(`ALTER TABLE users ADD COLUMN last_activity TIMESTAMP NULL DEFAULT NULL`);
        console.log('Đã thêm cột last_activity vào bảng users');
        return { exists: false, added: true };
      }
      
      return { exists: true, added: false };
    } catch (error) {
      console.error('Lỗi SQL khi kiểm tra cột last_activity:', error.message);
      throw error;
    }
  },
  
  // Cập nhật thời gian hoạt động cho tất cả người dùng đang online
  updateOnlineUsersActivity: async () => {
    try {
      // Cập nhật thời gian hoạt động cuối cùng cho tất cả người dùng đang online
      const [result] = await pool.query(
        'UPDATE users SET last_activity = NOW() WHERE status = "online"'
      );
      
      return { 
        success: true, 
        count: result.affectedRows 
      };
    } catch (error) {
      console.error('Lỗi SQL khi cập nhật thời gian hoạt động cho người dùng online:', error.message);
      throw error;
    }
  },
  
  // Cập nhật trạng thái offline cho người dùng không hoạt động
  updateInactiveUsers: async (inactiveThresholdMinutes = 0.5) => {
    try {
      // Kiểm tra xem cột last_activity đã tồn tại trong bảng users chưa
      const [columns] = await pool.query(`SHOW COLUMNS FROM users LIKE 'last_activity'`);
      
      if (columns.length === 0) {
        // Không có cột last_activity, không thể xác định người dùng không hoạt động
        console.log('Không có cột last_activity, không thể xác định người dùng không hoạt động');
        return {
          affected: 0,
          users: []
        };
      }
      
      // Tính thời gian ngưỡng (thời điểm trước đó inactiveThresholdMinutes phút)
      const thresholdMinutes = inactiveThresholdMinutes || 0.5; // Mặc định 0.5 phút (30 giây) nếu không có giá trị
      
      console.log(`Kiểm tra người dùng không hoạt động trong ${thresholdMinutes} phút qua...`);
      
      // Tìm những người dùng đang online nhưng không hoạt động trong khoảng thời gian quy định
      // Sử dụng NOW() trực tiếp vì MySQL đã được cấu hình múi giờ UTC+7 trong db.js
      const [inactiveUsers] = await pool.query(
        `SELECT user_id, username, email, status, last_activity 
         FROM users 
         WHERE status = 'online' 
         AND (last_activity IS NULL OR last_activity < DATE_SUB(NOW(), INTERVAL ? MINUTE))`,
        [thresholdMinutes]
      );
      
      if (inactiveUsers.length === 0) {
        console.log('Không tìm thấy người dùng không hoạt động');
        return {
          affected: 0,
          users: []
        };
      }
      
      console.log(`Tìm thấy ${inactiveUsers.length} người dùng không hoạt động:`);
      inactiveUsers.forEach(user => {
        console.log(`- User ${user.username} (ID: ${user.user_id}), hoạt động cuối: ${user.last_activity}`);
      });
      
      // Danh sách ID người dùng cần cập nhật
      const userIds = inactiveUsers.map(user => user.user_id);
      
      if (userIds.length > 0) {
        // Cập nhật trạng thái offline cho tất cả người dùng không hoạt động
        const [result] = await pool.query(
          'UPDATE users SET status = ? WHERE user_id IN (?)',
          ['offline', userIds]
        );
        
        console.log(`Đã cập nhật ${result.affectedRows} người dùng sang trạng thái offline`);
        
        return {
          affected: result.affectedRows,
          users: inactiveUsers
        };
      }
      
      return {
        affected: 0,
        users: []
      };
    } catch (error) {
      console.error('Lỗi SQL khi cập nhật người dùng không hoạt động:', error.message);
      throw error;
    }
  },

  // Lấy lịch sử khóa tài khoản
  getLockHistory: async () => {
    // Lấy toàn bộ lịch sử khóa tài khoản từ bảng user_lock
    const [rows] = await pool.query(
      `SELECT ul.*, u.username, u.email, r.role_name
       FROM user_lock ul
       JOIN users u ON ul.user_id = u.user_id
       JOIN role r ON u.role_id = r.role_id
       ORDER BY lock_time DESC`
    );
    return rows;
  },

  // Cập nhật thời gian hoạt động cuối cùng của người dùng khi offline
  updateLastActivityTimeForOffline: async (userId) => {
    try {
      // Kiểm tra xem cột last_activity đã tồn tại trong bảng users chưa
      const [columns] = await pool.query(`SHOW COLUMNS FROM users LIKE 'last_activity'`);
      
      if (columns.length === 0) {
        // Nếu cột last_activity chưa tồn tại, thêm cột này vào bảng users
        await pool.query(`ALTER TABLE users ADD COLUMN last_activity TIMESTAMP NULL DEFAULT NULL`);
        console.log('Đã thêm cột last_activity vào bảng users');
      }
      
      // Cập nhật thời gian hoạt động cuối cùng theo múi giờ Việt Nam (UTC+7)
      // Sử dụng NOW() trực tiếp vì MySQL đã được cấu hình múi giờ UTC+7 trong db.js
      const [result] = await pool.query(
        'UPDATE users SET last_activity = NOW(), status = "offline" WHERE user_id = ?',
        [userId]
      );
      
      if (result.affectedRows === 0) {
        console.log('Không thể cập nhật thời gian hoạt động - affected rows = 0');
        throw new Error('Không thể cập nhật thời gian hoạt động');
      }
      
      console.log(`Đã cập nhật thời gian hoạt động cuối cùng và trạng thái offline cho user ${userId}`);
      
      return {
        user_id: userId,
        status: 'offline'
      };
    } catch (error) {
      console.error('Lỗi SQL khi cập nhật thời gian hoạt động khi offline:', error.message);
      throw error;
    }
  },

  // Tự động mở khóa tài khoản đã đến hạn mở khóa
  autoUnlockExpiredAccounts: async () => {
    try {
      // Tìm các tài khoản đã đến hạn mở khóa (unlock_time <= NOW()) và vẫn trong trạng thái locked
      const [expiredLocks] = await pool.query(
        `SELECT ul.*, u.username 
         FROM user_lock ul 
         JOIN users u ON ul.user_id = u.user_id 
         WHERE ul.status = 'locked' AND ul.unlock_time <= NOW()`
      );
      
      if (expiredLocks.length === 0) {
        console.log('Không có tài khoản nào đến hạn mở khóa');
        return {
          affected: 0,
          accounts: []
        };
      }
      
      console.log(`Tìm thấy ${expiredLocks.length} tài khoản đến hạn mở khóa:`);
      
      const userIds = expiredLocks.map(lock => lock.user_id);
      
      // Cập nhật trạng thái thành "unlocked" cho tất cả tài khoản đến hạn
      const [result] = await pool.query(
        'UPDATE user_lock SET status = ? WHERE user_id IN (?) AND status = "locked"',
        ['unlocked', userIds]
      );
      
      console.log(`Đã tự động mở khóa ${result.affectedRows} tài khoản`);
      
      // Ghi chi tiết các tài khoản đã mở khóa
      expiredLocks.forEach(lock => {
        console.log(`- Đã mở khóa tài khoản ${lock.username} (ID: ${lock.user_id}), lý do khóa: '${lock.reason}'`);
      });
      
      return {
        affected: result.affectedRows,
        accounts: expiredLocks
      };
    } catch (error) {
      console.error('Lỗi SQL khi tự động mở khóa tài khoản:', error.message);
      throw error;
    }
  }
};

module.exports = userService; 