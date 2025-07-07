const cloudinary = require('../config/cloudinary');
const { pool } = require('../db');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { promisify } = require('util');
const crypto = require('crypto');

const uploadController = {
  // Upload ảnh avatar lên Cloudinary
  uploadAvatar: async (req, res) => {
    try {
      // Kiểm tra nếu không có file được gửi lên
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Không tìm thấy file ảnh'
        });
      }

      console.log('Bắt đầu upload ảnh:', {
        filePath: req.file.path,
        fileSize: req.file.size,
        fileType: req.file.mimetype
      });

      // Cách đơn giản nhất: Sử dụng SDK Cloudinary trực tiếp không kèm nhiều tùy chọn
      try {
        console.log('Sử dụng SDK Cloudinary với cách đơn giản nhất...');
        
        // Tránh sử dụng các tùy chọn phức tạp, chỉ giữ lại những gì cần thiết
        const result = await cloudinary.uploader.upload(req.file.path);

        console.log('Kết quả upload từ Cloudinary SDK (đơn giản):', result);

        // Xóa file tạm sau khi upload thành công
        try {
          fs.unlinkSync(req.file.path);
          console.log('Đã xóa file tạm:', req.file.path);
        } catch (unlinkError) {
          console.error('Lỗi khi xóa file tạm:', unlinkError);
        }

        // Trả về URL của ảnh đã upload
        res.json({
          success: true,
          message: 'Đã upload ảnh thành công',
          data: {
            url: result.secure_url,
            public_id: result.public_id
          }
        });
        return;
      } catch (sdkError) {
        console.error('Lỗi khi sử dụng SDK đơn giản:', sdkError);
        console.log('Thử phương pháp upload không cần xác thực...');
      }

      // Thử phương pháp thứ hai: Sử dụng upload preset (không cần chữ ký)
      try {
        console.log('Sử dụng phương pháp upload preset...');
        
        // Tạo formdata mới
        const formData = new FormData();
        // Thêm file vào form data
        formData.append('file', fs.createReadStream(req.file.path));
        // Sử dụng upload preset đã tạo trong Cloudinary Dashboard
        formData.append('upload_preset', 'ml_default');
        
        // Gửi request đến Cloudinary
        const uploadResponse = await axios.post(
          'https://api.cloudinary.com/v1_1/dzcqjemgj/auto/upload',
          formData,
          {
            headers: {
              ...formData.getHeaders()
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
          }
        );

        console.log('Kết quả upload từ Cloudinary API (preset):', uploadResponse.data);

        // Xóa file tạm sau khi upload thành công
        try {
          fs.unlinkSync(req.file.path);
          console.log('Đã xóa file tạm:', req.file.path);
        } catch (unlinkError) {
          console.error('Lỗi khi xóa file tạm:', unlinkError);
        }

        // Trả về URL của ảnh đã upload
        res.json({
          success: true,
          message: 'Đã upload ảnh thành công (upload preset)',
          data: {
            url: uploadResponse.data.secure_url,
            public_id: uploadResponse.data.public_id
          }
        });
        return;
      } catch (presetError) {
        console.error('Lỗi khi sử dụng upload preset:', presetError.response?.data || presetError.message);
      }

      // Nếu tất cả các phương pháp đều thất bại, báo lỗi
      res.status(500).json({
        success: false,
        message: 'Không thể upload ảnh sau khi thử nhiều phương pháp'
      });

      // Xóa file tạm nếu tất cả phương pháp đều thất bại
      try {
        fs.unlinkSync(req.file.path);
        console.log('Đã xóa file tạm sau khi tất cả phương pháp thất bại:', req.file.path);
      } catch (unlinkError) {
        console.error('Lỗi khi xóa file tạm:', unlinkError);
      }
    } catch (error) {
      console.error('Lỗi chi tiết khi upload ảnh:', error);
      
      // Trả về thông tin lỗi chi tiết hơn
      res.status(500).json({
        success: false,
        message: `Lỗi khi upload ảnh: ${error.message || 'Lỗi không xác định'}`,
        error: error.toString()
      });

      // Xóa file tạm nếu có lỗi xảy ra
      if (req.file && req.file.path) {
        try {
          fs.unlinkSync(req.file.path);
          console.log('Đã xóa file tạm sau khi xảy ra lỗi:', req.file.path);
        } catch (unlinkError) {
          console.error('Lỗi khi xóa file tạm sau lỗi:', unlinkError);
        }
      }
    }
  },

  // Cập nhật URL avatar vào database
  updateAvatarUrl: async (req, res) => {
    const { user_id, avatar_url } = req.body;

    if (!user_id || !avatar_url) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin user_id hoặc avatar_url'
      });
    }

    try {
      console.log('Cập nhật avatar trong database:', { user_id, avatar_url });
      
      // Kiểm tra user có tồn tại không
      const [rows] = await pool.query('SELECT user_id FROM users WHERE user_id = ?', [user_id]);
      if (!rows || rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy người dùng'
        });
      }

      // Cập nhật URL avatar vào database
      const [result] = await pool.query(
        'UPDATE users SET avatar = ? WHERE user_id = ?',
        [avatar_url, user_id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: 'Không thể cập nhật avatar'
        });
      }

      res.json({
        success: true,
        message: 'Đã cập nhật avatar thành công',
        data: {
          user_id,
          avatar_url
        }
      });
    } catch (error) {
      console.error('Lỗi chi tiết khi cập nhật avatar:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi cập nhật avatar vào database',
        error: error.message || error.toString()
      });
    }
  },

  // Xóa ảnh avatar cũ trên Cloudinary
  deleteOldAvatar: async (req, res) => {
    const { public_id } = req.body;

    if (!public_id) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin public_id'
      });
    }

    try {
      console.log('Bắt đầu xóa avatar cũ với public_id:', public_id);
      
      // Kiểm tra public_id có hợp lệ không
      if (typeof public_id !== 'string' || !public_id.trim()) {
        throw new Error('public_id không hợp lệ');
      }

      // Xóa ảnh trên Cloudinary
      console.log('Gọi Cloudinary API để xóa ảnh...');
      const result = await cloudinary.uploader.destroy(public_id, {
        invalidate: true
      });
      console.log('Kết quả xóa ảnh từ Cloudinary:', result);

      // Kiểm tra kết quả xóa
      if (result.result !== 'ok') {
        throw new Error(`Không thể xóa ảnh: ${result.result}`);
      }

      res.json({
        success: true,
        message: 'Đã xóa ảnh cũ thành công',
        data: result
      });
    } catch (error) {
      console.error('Lỗi chi tiết khi xóa avatar cũ:', error);
      
      // Kiểm tra loại lỗi để trả về thông báo phù hợp
      let statusCode = 500;
      let errorMessage = 'Lỗi khi xóa ảnh cũ trên Cloudinary';

      if (error.http_code === 404) {
        statusCode = 404;
        errorMessage = 'Không tìm thấy ảnh cần xóa';
      } else if (error.http_code === 401) {
        statusCode = 401;
        errorMessage = 'Không có quyền xóa ảnh';
      }

      res.status(statusCode).json({
        success: false,
        message: errorMessage,
        error: error.message || error.toString()
      });
    }
  }
};

module.exports = uploadController; 