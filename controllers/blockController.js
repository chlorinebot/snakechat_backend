const { pool, isConnected } = require('../db');

const blockController = {
  // Chặn người dùng
  blockUser: async (req, res) => {
    try {
      const { blocker_id, blocked_id, reason, block_type } = req.body;
      if (blocker_id === blocked_id) {
        return res.status(400).json({ success: false, message: 'Không thể tự chặn chính mình' });
      }
      // Kiểm tra user tồn tại
      const [users] = await pool.query('SELECT user_id FROM users WHERE user_id IN (?, ?)', [blocker_id, blocked_id]);
      if (users.length < 2) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy một trong hai người dùng' });
      }
      // Kiểm tra đã chặn trước đó
      const [existing] = await pool.query(
        'SELECT * FROM user_blocks WHERE blocker_id = ? AND blocked_id = ? AND status = "active"',
        [blocker_id, blocked_id]
      );
      if (existing.length > 0) {
        return res.status(400).json({ success: false, message: 'Người dùng này đã bị chặn trước đó' });
      }
      const type = block_type === 'temporary' ? 'temporary' : 'permanent';
      // Tái sử dụng record đã xoá nếu có
      const [removed] = await pool.query(
        'SELECT * FROM user_blocks WHERE blocker_id = ? AND blocked_id = ? AND status = "removed" ORDER BY block_id DESC LIMIT 1',
        [blocker_id, blocked_id]
      );
      let result;
      if (removed.length > 0) {
        [result] = await pool.query(
          'UPDATE user_blocks SET status = "active", reason = ?, block_type = ?, blocked_at = NOW(), updated_at = NOW(), unblock_at = NULL WHERE block_id = ?',
          [reason || 'Không có lý do', type, removed[0].block_id]
        );
        result.insertId = removed[0].block_id;
      } else {
        [result] = await pool.query(
          'INSERT INTO user_blocks (blocker_id, blocked_id, reason, block_type, blocked_at, status) VALUES (?, ?, ?, ?, NOW(), "active")',
          [blocker_id, blocked_id, reason || 'Không có lý do', type]
        );
      }
      // Nếu là bạn bè, hủy kết bạn
      const [friendship] = await pool.query(
        `SELECT friendship_id FROM friendships WHERE ((user_id_1 = ? AND user_id_2 = ?) OR (user_id_1 = ? AND user_id_2 = ?)) AND status = 'accepted'`,
        [blocker_id, blocked_id, blocked_id, blocker_id]
      );
      if (friendship.length > 0) {
        await pool.query('DELETE FROM friendships WHERE friendship_id = ?', [friendship[0].friendship_id]);
      }
      return res.status(201).json({
        success: true,
        message: 'Đã chặn người dùng thành công',
        data: { block_id: result.insertId, blocker_id, blocked_id }
      });
    } catch (error) {
      console.error('Lỗi khi chặn người dùng:', error);
      return res.status(500).json({ success: false, message: 'Đã xảy ra lỗi khi chặn người dùng' });
    }
  },

  // Bỏ chặn người dùng
  unblockUser: async (req, res) => {
    try {
      const { blocker_id, blocked_id } = req.query;
      if (!blocker_id || !blocked_id) {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin người dùng' });
      }
      const [existing] = await pool.query(
        'SELECT * FROM user_blocks WHERE blocker_id = ? AND blocked_id = ? AND status = "active"',
        [blocker_id, blocked_id]
      );
      if (existing.length === 0) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin chặn' });
      }
      await pool.query(
        'UPDATE user_blocks SET status = "removed", updated_at = NOW(), unblock_at = NOW() WHERE blocker_id = ? AND blocked_id = ? AND status = "active"',
        [blocker_id, blocked_id]
      );
      return res.json({ success: true, message: 'Đã bỏ chặn người dùng thành công' });
    } catch (error) {
      console.error('Lỗi khi bỏ chặn người dùng:', error);
      return res.status(500).json({ success: false, message: 'Đã xảy ra lỗi khi bỏ chặn người dùng' });
    }
  },

  // Kiểm tra trạng thái chặn
  checkBlockStatus: async (req, res) => {
    try {
      const { blocker_id, blocked_id } = req.query;
      if (!blocker_id || !blocked_id) {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin người dùng', isBlocking: false });
      }
      const [block] = await pool.query(
        'SELECT block_id FROM user_blocks WHERE blocker_id = ? AND blocked_id = ? AND status = "active"',
        [blocker_id, blocked_id]
      );
      return res.json({ isBlocking: block.length > 0, block_id: block.length > 0 ? block[0].block_id : undefined });
    } catch (error) {
      console.error('Lỗi khi kiểm tra trạng thái chặn:', error);
      return res.status(500).json({ success: false, message: 'Đã xảy ra lỗi khi kiểm tra trạng thái chặn', isBlocking: false });
    }
  },

  // Lấy danh sách người dùng bị chặn
  getBlockedUsers: async (req, res) => {
    try {
      const { userId } = req.params;
      const [blocks] = await pool.query(
        `SELECT ub.*, u.username, u.email, u.status, u.join_date 
         FROM user_blocks ub 
         JOIN users u ON ub.blocked_id = u.user_id 
         WHERE ub.blocker_id = ? AND ub.status = "active" ORDER BY ub.blocked_at DESC`,
        [userId]
      );
      const items = blocks.map(b => ({ block_id: b.block_id, blocker_id: b.blocker_id, blocked_id: b.blocked_id, reason: b.reason, block_type: b.block_type, blocked_at: b.blocked_at, user: { user_id: b.blocked_id, username: b.username, email: b.email, status: b.status, join_date: b.join_date } }));
      return res.json({ success: true, items });
    } catch (error) {
      console.error('Lỗi khi lấy danh sách người bị chặn:', error);
      return res.status(500).json({ success: false, message: 'Đã xảy ra lỗi khi lấy danh sách người bị chặn', items: [] });
    }
  }
};

module.exports = blockController; 