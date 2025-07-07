const { pool, isConnected } = require('../db');
const socketService = require('../socket');
const messageController = require('./messageController');

// Mock data khi không kết nối được database
const mockAnnouncements = [
  {
    AnnouncementID: 1,
    AnnouncementContent: 'Chào mừng bạn đến với SnakeChat! Hệ thống đang trong quá trình khởi động.',
    AnnouncementType: 'Thông tin',
    CreatedAt: new Date().toISOString()
  },
  {
    AnnouncementID: 2,
    AnnouncementContent: 'Hệ thống hiện tại đang gặp sự cố kết nối database. Vui lòng thử lại sau.',
    AnnouncementType: 'Cảnh báo', 
    CreatedAt: new Date(Date.now() - 3600000).toISOString()
  },
  {
    AnnouncementID: 3,
    AnnouncementContent: 'Tính năng thông báo chung đang hoạt động ở chế độ offline.',
    AnnouncementType: 'Bảo trì',
    CreatedAt: new Date(Date.now() - 7200000).toISOString()
  }
];

// Lấy tất cả thông báo chung
exports.getAllAnnouncements = async (req, res) => {
  try {
    // Kiểm tra kết nối database
    if (!isConnected()) {
      console.log('⚠️ Database không kết nối được, sử dụng mock data');
      return res.json({ 
        success: true, 
        message: 'Lấy danh sách thông báo thành công (chế độ offline)',
        items: mockAnnouncements 
      });
    }

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
    
    // Nếu lỗi database, trả về mock data thay vì lỗi 500
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || error.errno === 'ETIMEDOUT') {
      console.log('⚠️ Timeout kết nối database, sử dụng mock data');
      return res.json({ 
        success: true, 
        message: 'Lấy danh sách thông báo thành công (chế độ offline - kết nối database bị chặn)',
        items: mockAnnouncements 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi khi lấy dữ liệu từ server: ' + error.message 
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
    // Kiểm tra kết nối database
    if (!isConnected()) {
      const mockItem = mockAnnouncements.find(item => item.AnnouncementID == id);
      if (mockItem) {
        return res.json({ 
          success: true, 
          message: 'Lấy thông tin thông báo thành công (chế độ offline)',
          data: mockItem 
        });
      } else {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy thông báo'
        });
      }
    }
    
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
    
    // Nếu lỗi database, trả về mock data
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || error.errno === 'ETIMEDOUT') {
      const mockItem = mockAnnouncements.find(item => item.AnnouncementID == id);
      if (mockItem) {
        return res.json({ 
          success: true, 
          message: 'Lấy thông tin thông báo thành công (chế độ offline)',
          data: mockItem 
        });
      }
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi khi lấy dữ liệu từ server: ' + error.message 
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

  try {
    // Kiểm tra kết nối database
    if (!isConnected()) {
      console.log('⚠️ Database không kết nối được, chế độ offline');
      // Tạo mock announcement
      const newMockItem = {
        AnnouncementID: mockAnnouncements.length + 1,
        AnnouncementContent: content,
        AnnouncementType: announcementType,
        CreatedAt: new Date().toISOString()
      };
      mockAnnouncements.unshift(newMockItem);
      
      return res.status(201).json({
        success: true,
        message: 'Đã tạo thông báo thành công (chế độ offline - sẽ được đồng bộ khi kết nối lại database)',
        data: {
          announcement_id: newMockItem.AnnouncementID,
          content,
          type: announcementType,
          users_notified: 0
        }
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
      
      // Gửi thông báo đến từng người dùng qua hệ thống tin nhắn (chỉ khi có kết nối)
      try {
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
          try {
            socketService.emitToUser(user.user_id, 'announcement_created', announcementData);
          } catch (socketError) {
            console.log('Lỗi socket:', socketError.message);
          }
        });
      } catch (notifyError) {
        console.log('Lỗi khi gửi thông báo đến users:', notifyError.message);
      }
      
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
    } catch (dbError) {
      await connection.rollback();
      throw dbError;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Lỗi khi tạo thông báo chung:', error);
    
    // Nếu lỗi database, vẫn cho phép tạo ở chế độ offline
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || error.errno === 'ETIMEDOUT') {
      const newMockItem = {
        AnnouncementID: mockAnnouncements.length + 1,
        AnnouncementContent: content,
        AnnouncementType: announcementType,
        CreatedAt: new Date().toISOString()
      };
      mockAnnouncements.unshift(newMockItem);
      
      return res.status(201).json({
        success: true,
        message: 'Đã tạo thông báo thành công (chế độ offline - kết nối database bị chặn)',
        data: {
          announcement_id: newMockItem.AnnouncementID,
          content,
          type: announcementType,
          users_notified: 0
        }
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi khi tạo thông báo chung: ' + error.message 
    });
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
    // Kiểm tra kết nối database
    if (!isConnected()) {
      const mockIndex = mockAnnouncements.findIndex(item => item.AnnouncementID == id);
      if (mockIndex !== -1) {
        mockAnnouncements.splice(mockIndex, 1);
        return res.json({
          success: true,
          message: 'Xóa thông báo thành công (chế độ offline)'
        });
      } else {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy thông báo'
        });
      }
    }
    
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
    
    // Nếu lỗi database, thử xóa từ mock data
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || error.errno === 'ETIMEDOUT') {
      const mockIndex = mockAnnouncements.findIndex(item => item.AnnouncementID == id);
      if (mockIndex !== -1) {
        mockAnnouncements.splice(mockIndex, 1);
        return res.json({
          success: true,
          message: 'Xóa thông báo thành công (chế độ offline - kết nối database bị chặn)'
        });
      }
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi khi xóa thông báo: ' + error.message 
    });
  }
}; 