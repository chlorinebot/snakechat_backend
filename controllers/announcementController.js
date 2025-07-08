const { pool, isConnected } = require('../db');
const socketService = require('../socket');
const messageController = require('./messageController');

// Lấy tất cả thông báo chung
exports.getAllAnnouncements = async (req, res) => {
  try {
    const [announcements] = await pool.query(`
      SELECT * FROM GeneralAnnouncement
      ORDER BY CreatedAt DESC
    `);
    
    res.json({ 
      success: true, 
      message: 'Lấy danh sách thông báo chung thành công',
      items: announcements 
    });
  } catch (error) {
    console.error('Lỗi khi lấy danh sách thông báo chung:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi khi lấy dữ liệu từ server' 
    });
  }
};

// Lấy thông báo chung theo ID
exports.getAnnouncementById = async (req, res) => {
  const { id } = req.params;
  
  if (!id) {
    return res.status(400).json({ 
      success: false, 
      message: 'Thiếu ID thông báo' 
    });
  }
  
  try {
    const [announcements] = await pool.query(`
      SELECT * FROM GeneralAnnouncement
      WHERE AnnouncementID = ?
    `, [id]);
    
    if (announcements.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thông báo'
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Lấy thông tin thông báo thành công',
      data: announcements[0] 
    });
  } catch (error) {
    console.error('Lỗi khi lấy thông tin thông báo:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi khi lấy dữ liệu từ server' 
    });
  }
};

// Tạo thông báo chung mới và gửi đến tất cả người dùng
exports.createAnnouncement = async (req, res) => {
  const { content, announcementType } = req.body;
  
  if (!content || !announcementType) {
    return res.status(400).json({ 
      success: false, 
      message: 'Thiếu thông tin thông báo hoặc loại thông báo' 
    });
  }
  
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Thêm thông báo vào database
    const [result] = await connection.query(`
      INSERT INTO GeneralAnnouncement (AnnouncementContent, AnnouncementType, CreatedAt)
      VALUES (?, ?, NOW())
    `, [content, announcementType]);
    
    const announcementId = result.insertId;
    
    // Lấy danh sách tất cả người dùng (trừ tài khoản hệ thống ID: 1)
    const [users] = await connection.query(`
      SELECT user_id FROM users
      WHERE user_id != 1 AND role_id = 2
    `);
    
    await connection.commit();
    
    // Gửi thông báo đến từng người dùng qua hệ thống tin nhắn
    const messagePromises = users.map(user => {
      return messageController.sendSystemMessage({
        body: {
          user_id: user.user_id,
          content: `📢 THÔNG BÁO HỆ THỐNG 📢\n\n${content}`
        }
      }, {
        status: () => ({
          json: () => ({})
        })
      });
    });
    
    // Đợi tất cả tin nhắn được gửi xong
    await Promise.all(messagePromises);
    
    // Gửi thông báo qua socket để cập nhật UI cho từng người dùng
    const announcementData = {
      announcement_id: announcementId,
      content,
      type: announcementType,
      created_at: new Date()
    };
    
    // Gửi thông báo đến từng người dùng đang online
    users.forEach(user => {
      socketService.emitToUser(user.user_id, 'announcement_created', announcementData);
    });
    
    res.status(201).json({
      success: true,
      message: 'Đã tạo và gửi thông báo chung thành công',
      data: {
        announcement_id: announcementId,
        content,
        type: announcementType,
        users_notified: users.length
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Lỗi khi tạo thông báo chung:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi khi tạo thông báo chung' 
    });
  } finally {
    connection.release();
  }
};

// Cập nhật thông báo chung
exports.updateAnnouncement = async (req, res) => {
  const { id } = req.params;
  const { content, announcementType } = req.body;
  
  if (!id) {
    return res.status(400).json({ 
      success: false, 
      message: 'Thiếu ID thông báo' 
    });
  }
  
  if (!content && !announcementType) {
    return res.status(400).json({ 
      success: false, 
      message: 'Không có thông tin cần cập nhật' 
    });
  }
  
  try {
    let query = 'UPDATE GeneralAnnouncement SET ';
    const params = [];
    
    if (content) {
      query += 'AnnouncementContent = ?';
      params.push(content);
    }
    
    if (content && announcementType) {
      query += ', ';
    }
    
    if (announcementType) {
      query += 'AnnouncementType = ?';
      params.push(announcementType);
    }
    
    query += ' WHERE AnnouncementID = ?';
    params.push(id);
    
    const [result] = await pool.query(query, params);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thông báo hoặc không có thay đổi'
      });
    }
    
    res.json({
      success: true,
      message: 'Cập nhật thông báo thành công',
      data: {
        announcement_id: parseInt(id),
        content,
        type: announcementType
      }
    });
  } catch (error) {
    console.error('Lỗi khi cập nhật thông báo:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi khi cập nhật thông báo' 
    });
  }
};

// Xóa thông báo chung
exports.deleteAnnouncement = async (req, res) => {
  const { id } = req.params;
  
  if (!id) {
    return res.status(400).json({ 
      success: false, 
      message: 'Thiếu ID thông báo' 
    });
  }
  
  try {
    const [result] = await pool.query(`
      DELETE FROM GeneralAnnouncement
      WHERE AnnouncementID = ?
    `, [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thông báo'
      });
    }
    
    res.json({
      success: true,
      message: 'Xóa thông báo thành công'
    });
  } catch (error) {
    console.error('Lỗi khi xóa thông báo:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi khi xóa thông báo' 
    });
  }
}; 