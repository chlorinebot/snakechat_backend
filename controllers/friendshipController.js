const { pool, isConnected } = require('../db');
const { sendNotificationToUser } = require('../socket');

// Controller quản lý chức năng kết bạn
const FriendshipController = {
  // Gửi lời mời kết bạn
  sendFriendRequest: async (req, res) => {
    try {
      const { user_id_1, user_id_2 } = req.body;
      
      // Kiểm tra xem cả hai ID đều được cung cấp
      if (!user_id_1 || !user_id_2) {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin người dùng' });
      }
      
      // Không được gửi lời mời cho chính mình
      if (user_id_1 === user_id_2) {
        return res.status(400).json({ success: false, message: 'Không thể gửi lời mời kết bạn cho chính mình' });
      }
      
      // Kiểm tra xem đã có mối quan hệ bạn bè hoặc lời mời chưa
      const checkQuery = `
        SELECT * FROM friendships 
        WHERE (user_id_1 = ? AND user_id_2 = ?) 
        OR (user_id_1 = ? AND user_id_2 = ?)
      `;
      const [existingFriendship] = await pool.query(checkQuery, [user_id_1, user_id_2, user_id_2, user_id_1]);
      
      if (existingFriendship.length > 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Đã tồn tại mối quan hệ bạn bè hoặc lời mời kết bạn' 
        });
      }
      
      // Thêm lời mời kết bạn mới
      const insertQuery = `
        INSERT INTO friendships (user_id_1, user_id_2, status) 
        VALUES (?, ?, 'pending')
      `;
      const [result] = await pool.query(insertQuery, [user_id_1, user_id_2]);
      
      // Lấy thông tin friendship vừa tạo
      const [newFriendship] = await pool.query('SELECT * FROM friendships WHERE friendship_id = ?', [result.insertId]);
      
      // Lấy thông tin người gửi lời mời
      const [sender] = await pool.query('SELECT user_id, username, email FROM users WHERE user_id = ?', [user_id_1]);
      
      // Gửi thông báo qua Socket.IO
      if (sender.length > 0) {
        // Gửi thông báo đến người nhận lời mời
        sendNotificationToUser(
          parseInt(user_id_2), 
          'friend_request', 
          {
            friendship_id: result.insertId,
            sender: sender[0],
            count: await getRequestCount(user_id_2)
          }
        );
      }
      
      return res.status(201).json({
        success: true,
        message: 'Đã gửi lời mời kết bạn thành công',
        data: newFriendship[0]
      });
    } catch (error) {
      console.error('Lỗi khi gửi lời mời kết bạn:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi gửi lời mời kết bạn' });
    }
  },
  
  // Chấp nhận lời mời kết bạn
  acceptFriendRequest: async (req, res) => {
    try {
      const { friendshipId } = req.params;
      
      // Kiểm tra xem lời mời kết bạn có tồn tại không
      const [friendship] = await pool.query('SELECT * FROM friendships WHERE friendship_id = ?', [friendshipId]);
      
      if (friendship.length === 0) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy lời mời kết bạn' });
      }
      
      // Kiểm tra xem lời mời có đang ở trạng thái pending không
      if (friendship[0].status !== 'pending') {
        return res.status(400).json({ success: false, message: 'Lời mời kết bạn đã được xử lý trước đó' });
      }

      // Lấy thông tin người dùng từ friendship
      const user_id_1 = friendship[0].user_id_1; // Người gửi lời mời
      const user_id_2 = friendship[0].user_id_2; // Người nhận lời mời
      
      // Cập nhật trạng thái thành accepted
      await pool.query('UPDATE friendships SET status = ? WHERE friendship_id = ?', ['accepted', friendshipId]);

      // Gửi thông báo đến người gửi lời mời ban đầu
      sendNotificationToUser(
        parseInt(user_id_1),
        'friend_request_accepted',
        {
          friendship_id: friendshipId,
          user_id: user_id_2
        }
      );

      // Cập nhật số lượng lời mời cho người nhận
      const requestCount = await getRequestCount(user_id_2);
      sendNotificationToUser(
        parseInt(user_id_2),
        'friend_request_count_update',
        { count: requestCount }
      );
      
      return res.status(200).json({
        success: true,
        message: 'Đã chấp nhận lời mời kết bạn'
      });
    } catch (error) {
      console.error('Lỗi khi chấp nhận lời mời kết bạn:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi chấp nhận lời mời kết bạn' });
    }
  },
  
  // Từ chối hoặc hủy lời mời kết bạn
  rejectFriendRequest: async (req, res) => {
    try {
      const { friendshipId } = req.params;
      
      // Kiểm tra xem lời mời kết bạn có tồn tại không
      const [friendship] = await pool.query('SELECT * FROM friendships WHERE friendship_id = ?', [friendshipId]);
      
      if (friendship.length === 0) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy lời mời kết bạn' });
      }

      // Lấy thông tin người dùng từ friendship
      const user_id_2 = friendship[0].user_id_2; // Người nhận lời mời
      
      // Xóa lời mời kết bạn
      await pool.query('DELETE FROM friendships WHERE friendship_id = ?', [friendshipId]);

      // Cập nhật số lượng lời mời cho người nhận
      const requestCount = await getRequestCount(user_id_2);
      sendNotificationToUser(
        parseInt(user_id_2),
        'friend_request_count_update',
        { count: requestCount }
      );
      
      return res.status(200).json({
        success: true,
        message: 'Đã từ chối/hủy lời mời kết bạn'
      });
    } catch (error) {
      console.error('Lỗi khi từ chối lời mời kết bạn:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi từ chối lời mời kết bạn' });
    }
  },
  
  // Hủy kết bạn (xóa mối quan hệ bạn bè đã được chấp nhận)
  removeFriend: async (req, res) => {
    try {
      const { friendshipId } = req.params;
      
      // Kiểm tra xem mối quan hệ bạn bè có tồn tại không
      const [friendship] = await pool.query('SELECT * FROM friendships WHERE friendship_id = ?', [friendshipId]);
      
      if (friendship.length === 0) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy mối quan hệ bạn bè' });
      }
      
      // Kiểm tra xem mối quan hệ có đang ở trạng thái accepted không
      if (friendship[0].status !== 'accepted') {
        return res.status(400).json({ success: false, message: 'Mối quan hệ bạn bè chưa được thiết lập' });
      }
      
      // Xóa mối quan hệ bạn bè
      await pool.query('DELETE FROM friendships WHERE friendship_id = ?', [friendshipId]);
      
      return res.status(200).json({
        success: true,
        message: 'Đã hủy kết bạn thành công'
      });
    } catch (error) {
      console.error('Lỗi khi hủy kết bạn:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi hủy kết bạn' });
    }
  },
  
  // Kiểm tra trạng thái kết bạn giữa hai người dùng
  checkFriendshipStatus: async (req, res) => {
    try {
      const { user_id_1, user_id_2 } = req.query;
      
      if (!user_id_1 || !user_id_2) {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin người dùng' });
      }
      
      // Kiểm tra mối quan hệ bạn bè theo cả hai chiều
      const query = `
        SELECT * FROM friendships 
        WHERE (user_id_1 = ? AND user_id_2 = ?) 
        OR (user_id_1 = ? AND user_id_2 = ?)
      `;
      const [friendships] = await pool.query(query, [user_id_1, user_id_2, user_id_2, user_id_1]);
      
      if (friendships.length === 0) {
        return res.status(200).json({ status: null });
      }
      
      const friendship = friendships[0];
      return res.status(200).json({
        status: friendship.status,
        friendship_id: friendship.friendship_id
      });
    } catch (error) {
      console.error('Lỗi khi kiểm tra trạng thái kết bạn:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi kiểm tra trạng thái kết bạn' });
    }
  },
  
  // Lấy danh sách bạn bè của người dùng
  getFriends: async (req, res) => {
    try {
      const { userId } = req.params;
      
      // Lấy tất cả các mối quan hệ bạn bè đã được chấp nhận
      const query = `
        SELECT u.* FROM users u
        INNER JOIN friendships f ON (u.user_id = f.user_id_2 AND f.user_id_1 = ? AND f.status = 'accepted')
        OR (u.user_id = f.user_id_1 AND f.user_id_2 = ? AND f.status = 'accepted')
      `;
      const [friends] = await pool.query(query, [userId, userId]);
      
      return res.status(200).json({ items: friends });
    } catch (error) {
      console.error('Lỗi khi lấy danh sách bạn bè:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi lấy danh sách bạn bè' });
    }
  },
  
  // Lấy danh sách lời mời kết bạn đã nhận
  getReceivedRequests: async (req, res) => {
    try {
      const { userId } = req.params;
      
      // Lấy tất cả lời mời kết bạn mà người dùng đã nhận
      const query = `
        SELECT f.friendship_id, f.status, f.created_at, f.user_id_1, f.user_id_2,
               u.user_id, u.username, u.email, u.status as user_status, u.join_date, u.avatar
        FROM friendships f
        INNER JOIN users u ON f.user_id_1 = u.user_id
        WHERE f.user_id_2 = ? AND f.status = 'pending'
      `;
      const [requests] = await pool.query(query, [userId]);
      
      // Chuyển đổi kết quả thành định dạng phù hợp
      const formattedRequests = requests.map(request => ({
        friendship_id: request.friendship_id,
        user: {
          user_id: request.user_id,
          username: request.username,
          email: request.email,
          status: request.user_status || 'offline',
          join_date: request.join_date,
          avatar: request.avatar
        },
        status: request.status,
        created_at: request.created_at
      }));
      
      return res.status(200).json({ items: formattedRequests });
    } catch (error) {
      console.error('Lỗi khi lấy danh sách lời mời kết bạn đã nhận:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi lấy danh sách lời mời kết bạn' });
    }
  },
  
  // Lấy danh sách lời mời kết bạn đã gửi
  getSentRequests: async (req, res) => {
    try {
      const { userId } = req.params;
      
      // Lấy tất cả lời mời kết bạn mà người dùng đã gửi
      const query = `
        SELECT f.*, u.* FROM friendships f
        INNER JOIN users u ON f.user_id_2 = u.user_id
        WHERE f.user_id_1 = ? AND f.status = 'pending'
      `;
      const [requests] = await pool.query(query, [userId]);
      
      // Chuyển đổi kết quả thành định dạng phù hợp
      const formattedRequests = requests.map(request => ({
        friendship_id: request.friendship_id,
        user: {
          user_id: request.user_id,
          username: request.username,
          email: request.email,
          status: request.status || 'offline',
          join_date: request.join_date
        },
        status: request.status,
        created_at: request.created_at
      }));
      
      return res.status(200).json({ items: formattedRequests });
    } catch (error) {
      console.error('Lỗi khi lấy danh sách lời mời kết bạn đã gửi:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi lấy danh sách lời mời đã gửi' });
    }
  }
};

// Hàm trợ giúp để lấy số lượng lời mời kết bạn
async function getRequestCount(userId) {
  try {
    const query = `
      SELECT COUNT(*) as count FROM friendships 
      WHERE user_id_2 = ? AND status = 'pending'
    `;
    const [result] = await pool.query(query, [userId]);
    return result[0].count;
  } catch (error) {
    console.error('Lỗi khi đếm số lượng lời mời kết bạn:', error);
    return 0;
  }
}

module.exports = FriendshipController; 