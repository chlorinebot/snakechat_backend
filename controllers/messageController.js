const { pool, isConnected } = require('../db');
const socketService = require('../socket');

// Lấy tất cả tin nhắn trong một cuộc trò chuyện
exports.getConversationMessages = async (req, res) => {
  const conversationId = parseInt(req.params.conversationId);
  
  if (!conversationId) {
    return res.status(400).json({ error: 'Thiếu ID cuộc trò chuyện' });
  }
  
  try {
    // Lấy tin nhắn từ database với thông tin người gửi
    const [messages] = await pool.query(`
      SELECT m.message_id, m.conversation_id, m.sender_id, 
             u.username as sender_name, u.avatar as sender_avatar, m.content, 
             m.message_type, m.created_at, m.is_read
      FROM messages m
      LEFT JOIN users u ON m.sender_id = u.user_id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at ASC
    `, [conversationId]);
    
    return res.status(200).json({ items: messages });
    
  } catch (error) {
    console.error('Lỗi khi lấy tin nhắn:', error);
    return res.status(500).json({ error: 'Lỗi server khi lấy tin nhắn' });
  }
};

// Gửi tin nhắn mới
exports.sendMessage = async (req, res) => {
  const { conversation_id, sender_id, content, message_type = 'text' } = req.body;
  
  if (!conversation_id || !sender_id || !content) {
    return res.status(400).json({ error: 'Thiếu thông tin tin nhắn' });
  }
  
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Thêm tin nhắn vào database
    const [messageResult] = await connection.query(`
      INSERT INTO messages (conversation_id, sender_id, content, message_type, created_at, is_read)
      VALUES (?, ?, ?, ?, NOW(), 0)
    `, [conversation_id, sender_id, content, message_type]);
    
    const messageId = messageResult.insertId;
    
    // Cập nhật thời gian cuộc trò chuyện
    await connection.query(`
      UPDATE conversations
      SET updated_at = NOW()
      WHERE conversation_id = ?
    `, [conversation_id]);
    
    await connection.commit();
    
    // Lấy thông tin người gửi
    const [senderResults] = await pool.query(`
      SELECT username, avatar FROM users WHERE user_id = ?
    `, [sender_id]);
    
    const senderName = senderResults.length > 0 ? senderResults[0].username : null;
    const senderAvatar = senderResults.length > 0 ? senderResults[0].avatar : null;
    
    // Lấy thông tin chi tiết tin nhắn vừa gửi
    const [messageDetails] = await pool.query(`
      SELECT message_id, conversation_id, sender_id, content, 
             message_type, created_at, is_read
      FROM messages
      WHERE message_id = ?
    `, [messageId]);
    
    const message = {
      ...messageDetails[0],
      sender_name: senderName,
      sender_avatar: senderAvatar
    };
    
    // Lấy danh sách TẤT CẢ thành viên trong cuộc trò chuyện để gửi thông báo (bao gồm cả người gửi)
    const [members] = await pool.query(`
      SELECT user_id
      FROM conversation_members
      WHERE conversation_id = ? AND left_at IS NULL
    `, [conversation_id]);
    
    // Gửi thông báo tin nhắn mới qua socket đến TẤT CẢ thành viên
    members.forEach(member => {
      // Gửi nội dung tin nhắn cho tất cả, kể cả người gửi
      socketService.sendNotificationToUser(member.user_id, 'new_message', message);
      
      // Chỉ gửi thông báo cập nhật số lượng tin nhắn chưa đọc cho các thành viên khác
      if (member.user_id !== sender_id) {
        socketService.sendUnreadCountUpdate(member.user_id);
      }
    });
    
    return res.status(201).json({
      success: true,
      message: 'Gửi tin nhắn thành công',
      data: message
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Lỗi khi gửi tin nhắn:', error);
    return res.status(500).json({ error: 'Lỗi server khi gửi tin nhắn' });
  } finally {
    connection.release();
  }
};

// Đánh dấu tin nhắn đã đọc
exports.markMessageAsRead = async (req, res) => {
  const messageId = req.params.id;
  
  if (!messageId) {
    return res.status(400).json({ error: 'Thiếu ID tin nhắn' });
  }
  
  try {
    // Cập nhật trạng thái đã đọc cho tin nhắn
    // Sử dụng NOW() để lấy thời gian hiện tại theo múi giờ của server
    await pool.query(`
      UPDATE messages
      SET is_read = 1, read_at = NOW()
      WHERE message_id = ?
    `, [messageId]);
    
    // Lấy thông tin tin nhắn sau khi cập nhật
    const [message] = await pool.query(`
      SELECT message_id, conversation_id, sender_id, is_read, read_at
      FROM messages
      WHERE message_id = ?
    `, [messageId]);
    
    if (message.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy tin nhắn' });
    }
    
    return res.status(200).json({
      success: true,
      message: 'Đã đánh dấu tin nhắn là đã đọc',
      data: message[0]
    });
    
  } catch (error) {
    console.error('Lỗi khi đánh dấu tin nhắn đã đọc:', error);
    return res.status(500).json({ error: 'Lỗi server khi đánh dấu tin nhắn đã đọc' });
  }
};

// Đánh dấu tất cả tin nhắn trong cuộc trò chuyện là đã đọc
exports.markAllMessagesAsRead = async (req, res) => {
  const { conversation_id, user_id } = req.body;
  
  if (!conversation_id || !user_id) {
    return res.status(400).json({ error: 'Thiếu thông tin cần thiết' });
  }
  
  try {
    // Lấy tất cả tin nhắn chưa đọc từ người khác (không phải người dùng hiện tại)
    const [unreadMessages] = await pool.query(`
      SELECT message_id, sender_id
      FROM messages
      WHERE conversation_id = ? AND sender_id != ? AND is_read = 0
    `, [conversation_id, user_id]);
    
    if (unreadMessages.length === 0) {
      return res.status(200).json({ success: true, message: 'Không có tin nhắn nào cần đánh dấu đã đọc' });
    }
    
    // Đánh dấu tất cả tin nhắn trong cuộc trò chuyện là đã đọc, trừ tin nhắn của chính mình
    // Sử dụng NOW() để lấy thời gian hiện tại theo múi giờ của server
    await pool.query(`
      UPDATE messages
      SET is_read = 1, read_at = NOW()
      WHERE conversation_id = ? AND sender_id != ? AND is_read = 0
    `, [conversation_id, user_id]);
    
    // Lấy thời gian hiện tại từ database để đảm bảo múi giờ nhất quán
    const [currentTime] = await pool.query('SELECT NOW() as current_time');
    const readAtTime = currentTime[0].current_time;
    
    // Nhóm các tin nhắn đã đọc theo người gửi để thông báo
    const senderToMessageIds = unreadMessages.reduce((acc, message) => {
      if (!acc[message.sender_id]) {
        acc[message.sender_id] = [];
      }
      acc[message.sender_id].push(message.message_id);
      return acc;
    }, {});
    
    // Gửi thông báo cho từng người gửi biết tin nhắn của họ đã được đọc
    Object.entries(senderToMessageIds).forEach(([senderId, messageIds]) => {
      socketService.sendNotificationToUser(parseInt(senderId), 'message_read_receipt', {
        conversation_id: conversation_id,
        reader_id: user_id,
        message_ids: messageIds,
        read_at: readAtTime
      });
    });
    
    // Gửi thông báo cập nhật số tin nhắn chưa đọc cho người đọc
    socketService.sendUnreadCountUpdate(parseInt(user_id));
    
    return res.status(200).json({ 
      success: true, 
      read_count: unreadMessages.length,
      timestamp: readAtTime
    });
    
  } catch (error) {
    console.error('Lỗi khi đánh dấu tất cả tin nhắn đã đọc:', error);
    return res.status(500).json({ error: 'Lỗi server khi đánh dấu tất cả tin nhắn đã đọc' });
  }
};

// Lấy thông tin trạng thái đã đọc của tin nhắn
exports.getMessageReadStatus = async (req, res) => {
  const { conversation_id, user_id } = req.query;
  
  if (!conversation_id || !user_id) {
    return res.status(400).json({ error: 'Thiếu thông tin cần thiết' });
  }
  
  try {
    // Lấy thông tin trạng thái đã đọc của tất cả tin nhắn trong cuộc trò chuyện
    const [messages] = await pool.query(`
      SELECT message_id, sender_id, is_read, read_at
      FROM messages
      WHERE conversation_id = ? AND sender_id = ?
      ORDER BY created_at DESC
    `, [conversation_id, user_id]);
    
    return res.status(200).json({
      success: true,
      read_statuses: messages
    });
    
  } catch (error) {
    console.error('Lỗi khi lấy thông tin trạng thái đã đọc của tin nhắn:', error);
    return res.status(500).json({ error: 'Lỗi server khi lấy thông tin trạng thái đã đọc của tin nhắn' });
  }
};

// Gửi tin nhắn hệ thống đến người dùng
exports.sendSystemMessage = async (req, res) => {
  const { user_id, content } = req.body;
  
  if (!user_id || !content) {
    return res.status(400).json({ error: 'Thiếu thông tin cần thiết' });
  }
  
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Kiểm tra xem đã có cuộc trò chuyện 1:1 giữa người dùng và tài khoản hệ thống (ID: 1) chưa
    let [existingConversation] = await connection.query(`
      SELECT c.conversation_id 
      FROM conversations c
      JOIN conversation_members cm1 ON c.conversation_id = cm1.conversation_id
      JOIN conversation_members cm2 ON c.conversation_id = cm2.conversation_id
      WHERE c.conversation_type = 'personal' 
      AND cm1.user_id = ? AND cm2.user_id = 1
      AND cm1.left_at IS NULL AND cm2.left_at IS NULL
      LIMIT 1
    `, [user_id]);
    
    let conversationId;
    
    if (existingConversation.length === 0) {
      // Nếu chưa có, tạo cuộc trò chuyện mới kiểu 'personal'
      const [conversationResult] = await connection.query(`
        INSERT INTO conversations (conversation_type, created_at, updated_at)
        VALUES ('personal', NOW(), NOW())
      `);
      
      conversationId = conversationResult.insertId;
      
      // Thêm người dùng vào cuộc trò chuyện
      await connection.query(`
        INSERT INTO conversation_members (conversation_id, user_id, joined_at)
        VALUES (?, ?, NOW())
      `, [conversationId, user_id]);
      
      // Thêm tài khoản hệ thống (ID: 1) vào cuộc trò chuyện
      await connection.query(`
        INSERT INTO conversation_members (conversation_id, user_id, joined_at)
        VALUES (?, 1, NOW())
      `, [conversationId]);
    } else {
      conversationId = existingConversation[0].conversation_id;
    }
    
    // Thêm tin nhắn vào database với sender_id = 1 (tài khoản hệ thống)
    const [messageResult] = await connection.query(`
      INSERT INTO messages (conversation_id, sender_id, content, message_type, created_at, is_read)
      VALUES (?, 1, ?, 'text', NOW(), 0)
    `, [conversationId, content]);
    
    // Cập nhật thời gian cuộc trò chuyện
    await connection.query(`
      UPDATE conversations
      SET updated_at = NOW()
      WHERE conversation_id = ?
    `, [conversationId]);
    
    await connection.commit();
    
    // Lấy thông tin chi tiết tin nhắn vừa gửi
    const [messageDetails] = await connection.query(`
      SELECT m.message_id, m.conversation_id, m.sender_id, u.username as sender_name,
             u.avatar as sender_avatar, m.content, m.message_type, m.created_at, m.is_read
      FROM messages m
      JOIN users u ON m.sender_id = u.user_id
      WHERE m.message_id = ?
    `, [messageResult.insertId]);
    
    // Gửi thông báo qua socket nếu người dùng đang online
    if (messageDetails.length > 0) {
      const message = messageDetails[0];
      socketService.emitToUser(user_id, 'new_message', message);
    }
    
    return res.status(200).json({
      success: true,
      message: 'Đã gửi tin nhắn hệ thống thành công',
      data: messageDetails.length > 0 ? messageDetails[0] : null
    });
    
  } catch (error) {
    if (connection.inTransaction) {
      await connection.rollback();
    }
    console.error('Lỗi khi gửi tin nhắn hệ thống:', error);
    return res.status(500).json({ error: 'Lỗi server khi gửi tin nhắn hệ thống' });
  } finally {
    connection.release();
  }
}; 