const { pool, isConnected } = require('../db');

// Lấy danh sách cuộc trò chuyện của một người dùng
exports.getUserConversations = async (req, res) => {
  const userId = parseInt(req.params.userId);
  
  if (!userId) {
    return res.status(400).json({ error: 'Thiếu thông tin người dùng' });
  }
  
  try {
    // Lấy các cuộc trò chuyện mà người dùng tham gia
    const conversationsQuery = `
      SELECT c.conversation_id, c.conversation_type, c.created_at, c.updated_at, 
             (SELECT message_id FROM messages 
              WHERE conversation_id = c.conversation_id 
              ORDER BY created_at DESC LIMIT 1) as last_message_id,
             (SELECT content FROM messages 
              WHERE conversation_id = c.conversation_id 
              ORDER BY created_at DESC LIMIT 1) as last_message_content,
             (SELECT created_at FROM messages 
              WHERE conversation_id = c.conversation_id 
              ORDER BY created_at DESC LIMIT 1) as last_message_time,
             (SELECT COUNT(*) FROM messages 
              WHERE conversation_id = c.conversation_id 
              AND is_read = 0 AND sender_id != ?) as unread_count
      FROM conversations c
      INNER JOIN conversation_members cm ON c.conversation_id = cm.conversation_id
      WHERE cm.user_id = ? AND cm.left_at IS NULL
      ORDER BY c.updated_at DESC
    `;
    
    const [conversations] = await pool.query(conversationsQuery, [userId, userId]);
    
    // Lấy danh sách thành viên cho mỗi cuộc trò chuyện
    const enrichedConversations = await Promise.all(conversations.map(async (conv) => {
      const [members] = await pool.query(`
        SELECT cm.user_id, u.username, u.status, u.avatar, cm.joined_at, cm.left_at
        FROM conversation_members cm
        LEFT JOIN users u ON cm.user_id = u.user_id
        WHERE cm.conversation_id = ?
        AND cm.left_at IS NULL
      `, [conv.conversation_id]);
      
      return {
        ...conv,
        members: members
      };
    }));
    
    return res.status(200).json({ items: enrichedConversations });
    
  } catch (error) {
    console.error('Lỗi khi lấy danh sách cuộc trò chuyện:', error);
    return res.status(500).json({ error: 'Lỗi server khi lấy danh sách cuộc trò chuyện' });
  }
};

// Lấy chi tiết một cuộc trò chuyện
exports.getConversationDetails = async (req, res) => {
  const conversationId = parseInt(req.params.conversationId);
  
  if (!conversationId) {
    return res.status(400).json({ error: 'Thiếu ID cuộc trò chuyện' });
  }
  
  try {
    // Lấy thông tin cơ bản của cuộc trò chuyện
    const [conversationResults] = await pool.query(`
      SELECT conversation_id, conversation_type, created_at, updated_at
      FROM conversations
      WHERE conversation_id = ?
    `, [conversationId]);
    
    if (conversationResults.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy cuộc trò chuyện' });
    }
    
    const conversation = conversationResults[0];
    
    // Lấy tin nhắn cuối cùng
    const [lastMessageResults] = await pool.query(`
      SELECT message_id, content, created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `, [conversationId]);
    
    if (lastMessageResults.length > 0) {
      conversation.last_message_id = lastMessageResults[0].message_id;
      conversation.last_message_content = lastMessageResults[0].content;
      conversation.last_message_time = lastMessageResults[0].created_at;
    }
    
    // Lấy danh sách thành viên
    const [members] = await pool.query(`
      SELECT cm.user_id, u.username, u.status, u.avatar, cm.joined_at, cm.left_at
      FROM conversation_members cm
      LEFT JOIN users u ON cm.user_id = u.user_id
      WHERE cm.conversation_id = ?
    `, [conversationId]);
    
    conversation.members = members;
    
    return res.status(200).json({ data: conversation });
    
  } catch (error) {
    console.error('Lỗi khi lấy chi tiết cuộc trò chuyện:', error);
    return res.status(500).json({ error: 'Lỗi server khi lấy chi tiết cuộc trò chuyện' });
  }
};

// Tạo cuộc trò chuyện mới
exports.createConversation = async (req, res) => {
  const { user_ids } = req.body;
  
  if (!user_ids || !Array.isArray(user_ids) || user_ids.length < 2) {
    return res.status(400).json({ error: 'Cần ít nhất 2 người dùng để tạo cuộc trò chuyện' });
  }
  
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Xác định loại cuộc trò chuyện
    const conversationType = user_ids.length === 2 ? 'personal' : 'group';
    
    // Tạo cuộc trò chuyện mới
    const [conversationResult] = await connection.query(`
      INSERT INTO conversations (conversation_type, created_at, updated_at)
      VALUES (?, NOW(), NOW())
    `, [conversationType]);
    
    const conversationId = conversationResult.insertId;
    
    // Thêm các thành viên vào cuộc trò chuyện
    for (const userId of user_ids) {
      await connection.query(`
        INSERT INTO conversation_members (conversation_id, user_id, joined_at)
        VALUES (?, ?, NOW())
      `, [conversationId, userId]);
    }
    
    await connection.commit();
    
    // Lấy thông tin chi tiết cuộc trò chuyện vừa tạo
    const [conversationDetails] = await connection.query(`
      SELECT conversation_id, conversation_type, created_at, updated_at
      FROM conversations
      WHERE conversation_id = ?
    `, [conversationId]);
    
    const [members] = await connection.query(`
      SELECT cm.user_id, u.username, u.status, cm.joined_at
      FROM conversation_members cm
      LEFT JOIN users u ON cm.user_id = u.user_id
      WHERE cm.conversation_id = ?
    `, [conversationId]);
    
    const conversation = {
      ...conversationDetails[0],
      members
    };
    
    return res.status(201).json({
      success: true,
      message: 'Tạo cuộc trò chuyện thành công',
      data: conversation
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Lỗi khi tạo cuộc trò chuyện:', error);
    return res.status(500).json({ error: 'Lỗi server khi tạo cuộc trò chuyện' });
  } finally {
    connection.release();
  }
};

// Tạo hoặc lấy cuộc trò chuyện 1-1 giữa hai người dùng
exports.getOrCreateOneToOneConversation = async (req, res) => {
  const { user_id_1, user_id_2 } = req.body;
  
  if (!user_id_1 || !user_id_2) {
    return res.status(400).json({ error: 'Thiếu thông tin người dùng' });
  }
  
  const connection = await pool.getConnection();
  
  try {
    // Kiểm tra xem đã có cuộc trò chuyện 1-1 giữa hai người dùng chưa
    const [existingConversations] = await connection.query(`
      SELECT c.conversation_id
      FROM conversations c
      INNER JOIN conversation_members cm1 ON c.conversation_id = cm1.conversation_id
      INNER JOIN conversation_members cm2 ON c.conversation_id = cm2.conversation_id
      WHERE c.conversation_type = 'personal'
      AND cm1.user_id = ? AND cm2.user_id = ?
      AND cm1.left_at IS NULL AND cm2.left_at IS NULL
    `, [user_id_1, user_id_2]);
    
    let conversationId;
    
    if (existingConversations.length > 0) {
      // Nếu đã có cuộc trò chuyện, lấy ID của cuộc trò chuyện đó
      conversationId = existingConversations[0].conversation_id;
    } else {
      // Nếu chưa có, tạo cuộc trò chuyện mới
      await connection.beginTransaction();
      
      const [conversationResult] = await connection.query(`
        INSERT INTO conversations (conversation_type, created_at, updated_at)
        VALUES ('personal', NOW(), NOW())
      `);
      
      conversationId = conversationResult.insertId;
      
      // Thêm hai người dùng vào cuộc trò chuyện
      await connection.query(`
        INSERT INTO conversation_members (conversation_id, user_id, joined_at)
        VALUES (?, ?, NOW()), (?, ?, NOW())
      `, [conversationId, user_id_1, conversationId, user_id_2]);
      
      await connection.commit();
    }
    
    // Lấy thông tin chi tiết cuộc trò chuyện
    const [conversationDetails] = await connection.query(`
      SELECT conversation_id, conversation_type, created_at, updated_at
      FROM conversations
      WHERE conversation_id = ?
    `, [conversationId]);
    
    // Lấy tin nhắn cuối cùng nếu có
    const [lastMessageResults] = await connection.query(`
      SELECT message_id, content, created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `, [conversationId]);
    
    const conversation = {
      ...conversationDetails[0],
    };
    
    if (lastMessageResults.length > 0) {
      conversation.last_message_id = lastMessageResults[0].message_id;
      conversation.last_message_content = lastMessageResults[0].content;
      conversation.last_message_time = lastMessageResults[0].created_at;
    }
    
    // Lấy thông tin thành viên
    const [members] = await connection.query(`
      SELECT cm.user_id, u.username, u.status, cm.joined_at
      FROM conversation_members cm
      LEFT JOIN users u ON cm.user_id = u.user_id
      WHERE cm.conversation_id = ?
    `, [conversationId]);
    
    conversation.members = members;
    
    return res.status(200).json({
      success: true,
      message: existingConversations.length > 0 ? 'Đã tìm thấy cuộc trò chuyện' : 'Đã tạo cuộc trò chuyện mới',
      data: conversation
    });
    
  } catch (error) {
    if (connection.inTransaction) {
      await connection.rollback();
    }
    console.error('Lỗi khi tạo/lấy cuộc trò chuyện 1-1:', error);
    return res.status(500).json({ error: 'Lỗi server khi tạo/lấy cuộc trò chuyện' });
  } finally {
    connection.release();
  }
}; 