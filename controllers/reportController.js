const db = require('../db');

const reportController = {
  // Gửi báo cáo/góp ý
  sendReport: async (req, res) => {
    try {
      const { id_user, title, content, report_type } = req.body;

      // Kiểm tra dữ liệu đầu vào
      if (!id_user || !title || !content || !report_type) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu thông tin cần thiết để gửi báo cáo'
        });
      }

      // Xác thực loại báo cáo
      const validReportTypes = ['complaint', 'suggestion', 'bug_report'];
      if (!validReportTypes.includes(report_type)) {
        return res.status(400).json({
          success: false,
          message: 'Loại báo cáo không hợp lệ'
        });
      }

      // Thêm báo cáo vào cơ sở dữ liệu
      const [result] = await db.query(
        'INSERT INTO reports (id_user, title, content, report_type, status, submission_time) VALUES (?, ?, ?, ?, ?, NOW())',
        [id_user, title, content, report_type, 'unresolved']
      );

      if (result.affectedRows === 0) {
        return res.status(500).json({
          success: false,
          message: 'Không thể tạo báo cáo'
        });
      }

      // Lấy báo cáo đã tạo
      const [reports] = await db.query(
        'SELECT * FROM reports WHERE id_reports = ?',
        [result.insertId]
      );

      const report = reports[0];

      console.log(`Người dùng ID: ${id_user} đã gửi ${report_type} với tiêu đề: "${title}"`);

      res.status(201).json({
        success: true,
        message: 'Đã gửi báo cáo thành công',
        data: report
      });
    } catch (error) {
      console.error('Lỗi khi gửi báo cáo:', error);
      res.status(500).json({
        success: false,
        message: 'Đã xảy ra lỗi khi xử lý báo cáo'
      });
    }
  },

  // Lấy danh sách báo cáo của người dùng
  getUserReports: async (req, res) => {
    try {
      const userId = req.params.userId;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu ID người dùng'
        });
      }

      const [reports] = await db.query(
        'SELECT * FROM reports WHERE id_user = ? ORDER BY submission_time DESC',
        [userId]
      );

      res.json({
        success: true,
        data: reports
      });
    } catch (error) {
      console.error('Lỗi khi lấy danh sách báo cáo:', error);
      res.status(500).json({
        success: false,
        message: 'Đã xảy ra lỗi khi lấy danh sách báo cáo'
      });
    }
  },

  // Lấy tất cả báo cáo (cho admin)
  getAllReports: async (req, res) => {
    try {
      const [reports] = await db.query(
        `SELECT r.*, u.username
         FROM reports r
         LEFT JOIN users u ON r.id_user = u.user_id
         ORDER BY r.submission_time DESC`
      );

      res.json({
        success: true,
        data: reports
      });
    } catch (error) {
      console.error('Lỗi khi lấy tất cả báo cáo:', error);
      res.status(500).json({
        success: false,
        message: 'Đã xảy ra lỗi khi lấy danh sách báo cáo'
      });
    }
  },

  // Cập nhật trạng thái báo cáo
  updateReportStatus: async (req, res) => {
    try {
      const { id_reports, status, notes } = req.body;

      if (!id_reports || !status) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu thông tin cần thiết để cập nhật báo cáo'
        });
      }

      // Xác thực trạng thái
      const validStatuses = ['unresolved', 'received', 'resolved'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Trạng thái không hợp lệ'
        });
      }

      let updateQuery = '';
      let updateParams = [];

      if (status === 'received') {
        updateQuery = 'UPDATE reports SET status = ?, reception_time = NOW(), notes = ? WHERE id_reports = ?';
        updateParams = [status, notes || null, id_reports];
      } else if (status === 'resolved') {
        updateQuery = 'UPDATE reports SET status = ?, resolution_time = NOW(), notes = ? WHERE id_reports = ?';
        updateParams = [status, notes || null, id_reports];
      } else {
        updateQuery = 'UPDATE reports SET status = ?, notes = ? WHERE id_reports = ?';
        updateParams = [status, notes || null, id_reports];
      }

      const [result] = await db.query(updateQuery, updateParams);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy báo cáo hoặc không có thay đổi'
        });
      }

      // Lấy báo cáo đã cập nhật
      const [reports] = await db.query(
        'SELECT * FROM reports WHERE id_reports = ?',
        [id_reports]
      );

      res.json({
        success: true,
        message: 'Đã cập nhật trạng thái báo cáo thành công',
        data: reports[0]
      });
    } catch (error) {
      console.error('Lỗi khi cập nhật trạng thái báo cáo:', error);
      res.status(500).json({
        success: false,
        message: 'Đã xảy ra lỗi khi cập nhật trạng thái báo cáo'
      });
    }
  }
};

module.exports = reportController; 