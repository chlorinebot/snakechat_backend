const socketIo = require('socket.io');
const { pool, isConnected } = require('./db');

// Lưu trữ các kết nối socket theo user ID
const userSockets = new Map();

// Biến để theo dõi các tin nhắn đã gửi để tránh gửi lại
const sentMessages = new Set();

const setupSocket = (server) => {
  const io = socketIo(server, {
    cors: {
      origin: '*', // Trong môi trường production, hãy giới hạn nguồn gốc cụ thể
      methods: ['GET', 'POST']
    },
    pingTimeout: 60000, // Tăng thời gian timeout để giữ kết nối ổn định hơn
    pingInterval: 25000 // Giảm khoảng thời gian ping để phát hiện mất kết nối sớm hơn
  });

  io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId;
    
    if (userId) {
      console.log(`[SOCKET-SERVER] Người dùng ${userId} đã kết nối`);
      
      // Lưu socket theo user ID
      userSockets.set(parseInt(userId), socket);
      
      // Gửi sự kiện xác nhận kết nối thành công
      socket.emit('connection_success', {
        user_id: userId,
        connected_at: new Date().toISOString()
      });
      
      // Lắng nghe sự kiện tin nhắn đã đọc
      socket.on('message_read', async (data) => {
        console.log(`[SOCKET-SERVER] Nhận thông báo tin nhắn đã đọc:`, data);
        
        try {
          // Kiểm tra dữ liệu đầu vào
          if (!data.conversation_id || !data.reader_id) {
            console.error('[SOCKET-SERVER] Dữ liệu không hợp lệ:', data);
            return;
          }
          
          // Lấy thời gian hiện tại từ database để đảm bảo múi giờ nhất quán
          const [currentTime] = await pool.query('SELECT NOW() as current_time');
          const readAtTime = currentTime[0].current_time;
          
          // Lấy danh sách người gửi tin nhắn trong cuộc trò chuyện (trừ người đọc)
          const [senders] = await pool.query(`
            SELECT DISTINCT sender_id FROM messages 
            WHERE conversation_id = ? AND sender_id != ?
          `, [data.conversation_id, data.reader_id]);
          
          // Gửi thông báo đến từng người gửi riêng biệt
          if (senders && senders.length > 0) {
            console.log(`[SOCKET-SERVER] Gửi thông báo đã đọc đến ${senders.length} người gửi`);
            
            for (const sender of senders) {
              // Nếu có danh sách message_ids, truyền trực tiếp
              if (data.message_ids && Array.isArray(data.message_ids)) {
                // Lọc các tin nhắn thuộc về người gửi cụ thể này
                const [senderMessages] = await pool.query(`
                  SELECT message_id FROM messages 
                  WHERE conversation_id = ? 
                  AND sender_id = ? 
                  AND message_id IN (?)
                `, [data.conversation_id, sender.sender_id, data.message_ids]);
                
                if (senderMessages && senderMessages.length > 0) {
                  sendNotificationToUser(parseInt(sender.sender_id), 'message_read_receipt', {
                    conversation_id: data.conversation_id,
                    reader_id: data.reader_id,
                    message_ids: senderMessages.map(msg => msg.message_id),
                    read_at: readAtTime
                  });
                }
              } else {
                // Gửi thông báo với thời gian đọc để client có thể xử lý
                sendNotificationToUser(parseInt(sender.sender_id), 'message_read_receipt', {
                  conversation_id: data.conversation_id,
                  reader_id: data.reader_id,
                  read_at: readAtTime
                });
              }
            }
          }
        } catch (error) {
          console.error('[SOCKET-SERVER] Lỗi khi xử lý thông báo tin nhắn đã đọc:', error);
        }
      });
      
      // Kiểm tra kết nối định kỳ
      socket.on('ping', (data) => {
        socket.emit('pong', { timestamp: new Date().toISOString() });
      });
      
      // Xử lý ngắt kết nối
      socket.on('disconnect', () => {
        console.log(`[SOCKET-SERVER] Người dùng ${userId} đã ngắt kết nối`);
        userSockets.delete(parseInt(userId));
      });
    }
  });

  // Thiết lập kiểm tra kết nối định kỳ
  setInterval(() => {
    const now = new Date();
    console.log(`[SOCKET-SERVER] Kiểm tra kết nối: ${userSockets.size} người dùng đang kết nối`);
    
    // Xóa các tin nhắn cũ trong sentMessages (giữ trong 5 phút)
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    for (const messageKey of sentMessages) {
      const [, timestamp] = messageKey.split('-');
      if (new Date(parseInt(timestamp)) < fiveMinutesAgo) {
        sentMessages.delete(messageKey);
      }
    }
  }, 60000); // Mỗi phút

  return io;
};

// Gửi thông báo đến người dùng cụ thể
const sendNotificationToUser = (userId, eventName, data) => {
  const userSocket = userSockets.get(userId);
  
  // Tạo một khóa duy nhất cho tin nhắn để tránh gửi trùng lặp
  const messageKey = `${eventName}-${Date.now()}-${userId}-${JSON.stringify(data).slice(0, 50)}`;
  
  // Kiểm tra xem tin nhắn đã được gửi chưa
  if (sentMessages.has(messageKey)) {
    console.log(`[SOCKET-SERVER] Tin nhắn đã được gửi trước đó, bỏ qua: ${messageKey}`);
    return false;
  }
  
  if (userSocket) {
    userSocket.emit(eventName, data);
    console.log(`[SOCKET-SERVER] Đã gửi thông báo ${eventName} đến người dùng ${userId}`);
    
    // Đánh dấu tin nhắn đã được gửi
    sentMessages.add(messageKey);
    return true;
  }
  
  console.log(`[SOCKET-SERVER] Không thể gửi thông báo đến người dùng ${userId}: Không tìm thấy kết nối socket`);
  return false;
};

// Gửi thông báo cập nhật số tin nhắn chưa đọc và danh sách cuộc trò chuyện
const sendUnreadCountUpdate = async (userId) => {
  try {
    // Lấy tổng số tin nhắn chưa đọc
    const [unreadCountResult] = await pool.query(`
      SELECT COUNT(*) as total_unread
      FROM messages m
      JOIN conversation_members cm ON m.conversation_id = cm.conversation_id
      WHERE cm.user_id = ? AND m.sender_id != ? AND m.is_read = 0 AND cm.left_at IS NULL
    `, [userId, userId]);

    const totalUnread = unreadCountResult[0]?.total_unread || 0;

    // Lấy thông tin các cuộc trò chuyện có tin nhắn mới
    const [conversations] = await pool.query(`
      SELECT c.conversation_id, c.conversation_type,
             c.created_at, c.updated_at,
             (SELECT COUNT(*) FROM messages m 
              WHERE m.conversation_id = c.conversation_id 
              AND m.sender_id != ? AND m.is_read = 0) as unread_count,
             (SELECT m.message_id FROM messages m 
              WHERE m.conversation_id = c.conversation_id 
              ORDER BY m.created_at DESC LIMIT 1) as last_message_id,
             (SELECT m.content FROM messages m 
              WHERE m.conversation_id = c.conversation_id 
              ORDER BY m.created_at DESC LIMIT 1) as last_message_content,
             (SELECT m.created_at FROM messages m 
              WHERE m.conversation_id = c.conversation_id 
              ORDER BY m.created_at DESC LIMIT 1) as last_message_time
      FROM conversations c
      JOIN conversation_members cm ON c.conversation_id = cm.conversation_id
      LEFT JOIN messages m ON c.conversation_id = m.conversation_id
      WHERE cm.user_id = ? AND cm.left_at IS NULL
      GROUP BY c.conversation_id
      ORDER BY c.updated_at DESC
    `, [userId, userId]);

    // Thông báo cho người dùng cập nhật số lượng tin nhắn chưa đọc và danh sách cuộc trò chuyện
    sendNotificationToUser(parseInt(userId), 'unread_count_update', {
      user_id: userId,
      total_unread: totalUnread,
      conversations: conversations,
      timestamp: new Date().toISOString()
    });
    return true;
  } catch (error) {
    console.error(`[SOCKET-SERVER] Lỗi khi gửi thông báo cập nhật tin nhắn chưa đọc đến người dùng ${userId}:`, error);
    return false;
  }
};

// Gửi tin nhắn đến một người dùng cụ thể
const emitToUser = (userId, event, data) => {
  const userSocket = userSockets.get(parseInt(userId));
  if (userSocket) {
    userSocket.emit(event, data);
    console.log(`[SOCKET-SERVER] Đã gửi sự kiện ${event} đến người dùng ${userId}`);
    return true;
  } else {
    console.log(`[SOCKET-SERVER] Không thể gửi sự kiện ${event} đến người dùng ${userId} (không trực tuyến)`);
    return false;
  }
};

// Gửi thông báo buộc đăng xuất khi tài khoản bị khóa
const sendForceLogout = (userId, reason) => {
  try {
    const userSocket = userSockets.get(parseInt(userId));
    
    if (userSocket) {
      console.log(`[SOCKET-SERVER] Gửi yêu cầu đăng xuất bắt buộc đến người dùng ${userId} với lý do: ${reason}`);
      
      // Gửi thông báo đăng xuất đến client với mức độ ưu tiên cao
      userSocket.emit('force_logout', {
        user_id: userId,
        reason: reason || 'Tài khoản của bạn đã bị khóa',
        timestamp: new Date().toISOString(),
        priority: 'high',
        force: true
      });
      
      // Gửi thêm một thông báo broadcast để đảm bảo tất cả các phiên của người dùng đều nhận được
      userSocket.broadcast.emit('global_force_logout', {
        target_user_id: userId,
        reason: reason || 'Tài khoản của bạn đã bị khóa',
        timestamp: new Date().toISOString()
      });
      
      // Ngắt kết nối socket ngay lập tức
      setTimeout(() => {
        if (userSockets.has(parseInt(userId))) {
          try {
            userSocket.disconnect(true);
            userSockets.delete(parseInt(userId));
            console.log(`[SOCKET-SERVER] Đã ngắt kết nối socket của người dùng ${userId}`);
          } catch (disconnectError) {
            console.error(`[SOCKET-SERVER] Lỗi khi ngắt kết nối socket cho người dùng ${userId}:`, disconnectError);
          }
        }
      }, 1000); // Chờ 1 giây để đảm bảo thông báo được gửi đi
      
      return true;
    }
    
    console.log(`[SOCKET-SERVER] Không thể gửi yêu cầu đăng xuất bắt buộc đến người dùng ${userId}: Không tìm thấy kết nối socket`);
    return false;
  } catch (error) {
    console.error(`[SOCKET-SERVER] Lỗi khi gửi yêu cầu đăng xuất bắt buộc đến người dùng ${userId}:`, error);
    return false;
  }
};

module.exports = {
  setupSocket,
  sendNotificationToUser,
  sendUnreadCountUpdate,
  emitToUser,
  sendForceLogout
}; 