const userService = require('../services/userService');

const userController = {
  // Lấy danh sách users với vai trò
  getAllUsers: async (req, res) => {
    try {
      const users = await userService.getAllUsers();
      res.json({ 
        success: true,
        message: 'Lấy dữ liệu thành công',
        items: users 
      });
    } catch (error) {
      console.error('Lỗi khi lấy dữ liệu:', error);
      res.status(500).json({ 
        success: false,
        message: 'Lỗi khi lấy dữ liệu từ server'
      });
    }
  },

  // Thêm user mới
  createUser: async (req, res) => {
    const { username, email, password, birthday, role_id } = req.body;
    if (!username || !email || !password || !role_id) {
      return res.status(400).json({ 
        success: false,
        message: 'Thiếu thông tin yêu cầu'
      });
    }

    try {
      const newUser = await userService.createUser({
        username,
        email,
        password, // Mật khẩu sẽ được mã hóa trong service
        birthday,
        role_id
      });

      res.json({ 
        success: true,
        message: `Đã thêm user ${username} thành công`,
        data: newUser
      });
    } catch (error) {
      console.error('Lỗi khi thêm user:', error);
      res.status(500).json({ 
        success: false,
        message: 'Lỗi khi thêm user vào database'
      });
    }
  },

  // Cập nhật thông tin user
  updateUser: async (req, res) => {
    const userId = req.params.id;
    const { username, email, password, birthday, role_id } = req.body;
    
    if (!username || !email || !role_id) {
      return res.status(400).json({ 
        success: false,
        message: 'Thiếu thông tin yêu cầu'
      });
    }

    try {
      const updatedUser = await userService.updateUser(userId, {
        username,
        email,
        password,
        birthday,
        role_id
      });

      res.json({ 
        success: true,
        message: `Đã cập nhật thông tin user ${username} thành công`,
        data: updatedUser
      });
    } catch (error) {
      console.error('Lỗi khi cập nhật user:', error);
      if (error.message === 'Không tìm thấy user') {
        res.status(404).json({ 
          success: false,
          message: 'Không tìm thấy user'
        });
      } else {
        res.status(500).json({ 
          success: false,
          message: 'Lỗi khi cập nhật thông tin user'
        });
      }
    }
  },

  // Xóa user
  deleteUser: async (req, res) => {
    const userId = req.params.id;

    try {
      await userService.deleteUser(userId);
      res.json({ 
        success: true,
        message: 'Đã xóa user thành công'
      });
    } catch (error) {
      console.error('Lỗi khi xóa user:', error);
      if (error.message === 'Không tìm thấy user') {
        res.status(404).json({ 
          success: false,
          message: 'Không tìm thấy user'
        });
      } else {
        res.status(500).json({ 
          success: false,
          message: 'Lỗi khi xóa user'
        });
      }
    }
  },

  // Khóa tài khoản user
  lockUser: async (req, res) => {
    const { user_id, reason, lock_time, unlock_time } = req.body;
    
    if (!user_id || !reason || !lock_time || !unlock_time) {
      return res.status(400).json({ 
        success: false,
        message: 'Thiếu thông tin yêu cầu'
      });
    }

    console.log('Client gửi lên:');
    console.log('- lock_time (UTC):', lock_time);
    console.log('- unlock_time (UTC):', unlock_time);

    try {
      const result = await userService.lockUser({
        user_id,
        reason,
        lock_time,
        unlock_time,
        status: 'locked'
      });

      // Gửi thông báo đăng xuất đến người dùng nếu đang online
      const socketService = require('../socket');
      socketService.sendForceLogout(user_id, `Tài khoản của bạn đã bị khóa với lý do: ${reason}`);

      res.json({ 
        success: true,
        message: `Đã khóa tài khoản thành công`,
        data: result,
        debug: {
          clientTime: {
            lock: lock_time,
            unlock: unlock_time
          },
          serverTime: {
            lock: result.lock_time,
            unlock: result.unlock_time
          }
        }
      });
    } catch (error) {
      console.error('Lỗi khi khóa tài khoản:', error);
      if (error.message === 'Không tìm thấy user') {
        res.status(404).json({ 
          success: false,
          message: 'Không tìm thấy tài khoản'
        });
      } else {
        res.status(500).json({ 
          success: false,
          message: 'Lỗi khi khóa tài khoản'
        });
      }
    }
  },

  // Mở khóa tài khoản user
  unlockUser: async (req, res) => {
    const userId = req.params.id;

    try {
      const result = await userService.unlockUser(userId);

      res.json({ 
        success: true,
        message: `Đã mở khóa tài khoản thành công`,
        data: result
      });
    } catch (error) {
      console.error('Lỗi khi mở khóa tài khoản:', error);
      if (error.message === 'Không tìm thấy user') {
        res.status(404).json({ 
          success: false,
          message: 'Không tìm thấy tài khoản'
        });
      } else if (error.message === 'Tài khoản không bị khóa') {
        res.status(400).json({ 
          success: false,
          message: 'Tài khoản không ở trạng thái khóa'
        });
      } else {
        res.status(500).json({ 
          success: false,
          message: 'Lỗi khi mở khóa tài khoản'
        });
      }
    }
  },

  // Cập nhật trạng thái người dùng (online/offline)
  updateUserStatus: async (req, res) => {
    const { user_id, status, force } = req.body;

    if (!user_id || !status) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin user_id hoặc status'
      });
    }

    try {
      // Chuyển force thành boolean
      const forceUpdate = force === true || force === 'true';
      
      const result = await userService.updateUserStatus(user_id, status, forceUpdate);
      
      // Cập nhật thời gian hoạt động cuối cùng nếu đang online
      if (status === 'online') {
        await userService.updateLastActivityTime(user_id);
      }
      
      res.json({
        success: true,
        message: `Đã cập nhật trạng thái user thành ${status}${forceUpdate ? ' (forced)' : ''}`,
        data: result
      });
    } catch (error) {
      console.error('Lỗi khi cập nhật trạng thái user:', error);
      if (error.message === 'Không tìm thấy user') {
        res.status(404).json({
          success: false,
          message: 'Không tìm thấy user'
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Lỗi khi cập nhật trạng thái user'
        });
      }
    }
  },

  // Nhận heartbeat từ client và cập nhật thời gian hoạt động
  receiveUserHeartbeat: async (req, res) => {
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin user_id'
      });
    }

    try {
      // Cập nhật thời gian hoạt động cuối cùng của người dùng
      const result = await userService.updateLastActivityTime(user_id);
      
      // Kiểm tra trạng thái hiện tại của người dùng
      const user = await userService.getUserById(user_id);
      
      // Nếu người dùng đang ở trạng thái offline, cập nhật lại thành online
      if (user && user.status === 'offline') {
        await userService.updateUserStatus(user_id, 'online');
      }
      
      res.json({
        success: true,
        message: 'Đã cập nhật heartbeat thành công',
        data: result
      });
    } catch (error) {
      console.error('Lỗi khi xử lý heartbeat:', error);
      if (error.message === 'Không tìm thấy user') {
        res.status(404).json({
          success: false,
          message: 'Không tìm thấy user'
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Lỗi khi xử lý heartbeat'
        });
      }
    }
  },

  // Xử lý yêu cầu cập nhật trạng thái offline từ Beacon API
  updateUserStatusBeacon: async (req, res) => {
    try {
      // Beacon API không chờ phản hồi, nên trả về ngay lập tức
      res.status(202).send('');
      
      // Lấy dữ liệu từ form data (Beacon API sử dụng FormData)
      const user_id = req.body && req.body.user_id;
      const status = req.body && (req.body.status || 'offline');
      const force = req.body && req.body.force === 'true';
      
      if (!user_id) {
        // Không hiển thị log cho lỗi này do xảy ra quá thường xuyên
        return;
      }
      
      console.log('Nhận yêu cầu Beacon từ client để cập nhật trạng thái:', { user_id, status, force });
      
      // Cập nhật trạng thái offline với tham số force
      await userService.updateUserStatus(user_id, status, force);
      
      // Nếu có flag force = true, đảm bảo cập nhật ngay lập tức
      if (force) {
        console.log(`Cập nhật trạng thái offline (force) cho user ${user_id}`);
        // Cập nhật thời gian hoạt động cuối cùng
        await userService.updateLastActivityTimeForOffline(user_id);
      }
      
      console.log(`Đã cập nhật trạng thái ${status} cho user ${user_id} qua Beacon API`);
    } catch (error) {
      // Chỉ log lỗi nghiêm trọng, không phải lỗi thường gặp
      if (error.message !== 'Không tìm thấy user') {
        console.error('Lỗi nghiêm trọng khi xử lý yêu cầu Beacon:', error);
      }
    }
  },
  
  // Kiểm tra các user không hoạt động và cập nhật trạng thái offline
  checkInactiveUsers: async (req, res) => {
    try {
      const { threshold_minutes } = req.body;
      
      // Mặc định là 5 phút nếu không có giá trị từ client
      const inactiveThreshold = threshold_minutes || 5;
      
      const result = await userService.updateInactiveUsers(inactiveThreshold);
      
      res.json({
        success: true,
        message: `Đã kiểm tra hoạt động người dùng. ${result.affected} người dùng đã bị đánh dấu offline.`,
        data: result
      });
    } catch (error) {
      console.error('Lỗi khi kiểm tra người dùng không hoạt động:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi kiểm tra người dùng không hoạt động'
      });
    }
  },

  // Cập nhật cấu trúc cơ sở dữ liệu và thời gian hoạt động
  updateLastActivitySystem: async (req, res) => {
    try {
      // Kiểm tra và thêm cột last_activity nếu chưa tồn tại
      const hasLastActivity = await userService.checkLastActivityColumn();
      
      // Cập nhật thời gian hoạt động cho người dùng online
      const updated = await userService.updateOnlineUsersActivity();
      
      res.json({
        success: true,
        message: 'Cập nhật thành công',
        data: {
          columnAdded: hasLastActivity.added,
          updatedUsers: updated.count
        }
      });
    } catch (error) {
      console.error('Lỗi khi cập nhật hệ thống:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi cập nhật hệ thống'
      });
    }
  },

  // Lấy lịch sử khóa tài khoản 
  getLockHistory: async (req, res) => {
    try {
      const lockHistory = await userService.getLockHistory();
      res.json({ 
        success: true,
        message: 'Lấy lịch sử khóa tài khoản thành công',
        items: lockHistory 
      });
    } catch (error) {
      console.error('Lỗi khi lấy lịch sử khóa tài khoản:', error);
      res.status(500).json({ 
        success: false,
        message: 'Lỗi khi lấy dữ liệu từ server'
      });
    }
  },

  // Gửi khiếu nại cho tài khoản bị khóa
  sendAccountAppeal: async (req, res) => {
    const { userId, username, email, reason, explanation } = req.body;
    
    if (!userId || !explanation) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin cần thiết cho khiếu nại'
      });
    }

    try {
      // Tạo dữ liệu báo cáo khiếu nại
      const reportData = {
        id_user: userId,
        title: `Khiếu nại về tài khoản bị khóa - ${username}`,
        content: `Người dùng: ${username} (${email})\nLý do khóa: ${reason}\n\nGiải thích của người dùng: ${explanation}`,
        report_type: 'complaint', // Loại báo cáo là khiếu nại
      };
      
      // Gọi controller report để xử lý việc tạo báo cáo
      const reportController = require('./reportController');
      
      // Gọi trực tiếp DB query để lưu báo cáo
      const { pool } = require('../db');
      const [result] = await pool.query(
        'INSERT INTO reports (id_user, title, content, report_type, status, submission_time) VALUES (?, ?, ?, ?, ?, NOW())',
        [userId, reportData.title, reportData.content, 'complaint', 'unresolved']
      );
      
      if (result.affectedRows === 0) {
        throw new Error('Không thể tạo báo cáo khiếu nại');
      }
      
      res.json({
        success: true,
        message: 'Khiếu nại của bạn đã được gửi thành công. Chúng tôi sẽ xem xét và phản hồi sớm nhất có thể.',
        data: {
          report_id: result.insertId
        }
      });
    } catch (error) {
      console.error('Lỗi khi gửi khiếu nại tài khoản:', error);
      res.status(500).json({
        success: false,
        message: 'Đã xảy ra lỗi khi gửi khiếu nại. Vui lòng thử lại sau.'
      });
    }
  },

  // Tự động mở khóa tài khoản đến hạn
  autoUnlockExpiredAccounts: async (req, res) => {
    try {
      const result = await userService.autoUnlockExpiredAccounts();

      res.json({
        success: true,
        message: `Đã kiểm tra và tự động mở khóa tài khoản. ${result.affected} tài khoản đã được mở khóa.`,
        data: result
      });
    } catch (error) {
      console.error('Lỗi khi tự động mở khóa tài khoản:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi tự động mở khóa tài khoản'
      });
    }
  }
};

module.exports = userController;  