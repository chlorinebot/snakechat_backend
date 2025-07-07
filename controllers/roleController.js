const roleService = require('../services/roleService');

const roleController = {
  // Lấy danh sách roles
  getAllRoles: async (req, res) => {
    try {
      const roles = await roleService.getAllRoles();
      res.json({ 
        success: true,
        message: 'Lấy dữ liệu thành công',
        items: roles 
      });
    } catch (error) {
      console.error('Lỗi khi lấy dữ liệu vai trò:', error);
      res.status(500).json({ 
        success: false,
        message: 'Lỗi khi lấy dữ liệu từ server'
      });
    }
  },

  // Thêm role mới
  createRole: async (req, res) => {
    const { role_name, description } = req.body;
    if (!role_name || !description) {
      return res.status(400).json({ 
        success: false,
        message: 'Thiếu thông tin yêu cầu'
      });
    }

    try {
      const newRole = await roleService.createRole({
        role_name,
        description
      });

      res.json({ 
        success: true,
        message: `Đã thêm vai trò ${role_name} thành công`,
        data: newRole
      });
    } catch (error) {
      console.error('Lỗi khi thêm vai trò:', error);
      res.status(500).json({ 
        success: false,
        message: 'Lỗi khi thêm vai trò vào database'
      });
    }
  },

  // Cập nhật thông tin role
  updateRole: async (req, res) => {
    const roleId = req.params.id;
    const { role_name, description } = req.body;
    
    if (!role_name || !description) {
      return res.status(400).json({ 
        success: false,
        message: 'Thiếu thông tin yêu cầu'
      });
    }

    try {
      const updatedRole = await roleService.updateRole(roleId, {
        role_name,
        description
      });

      res.json({ 
        success: true,
        message: `Đã cập nhật thông tin vai trò ${role_name} thành công`,
        data: updatedRole
      });
    } catch (error) {
      console.error('Lỗi khi cập nhật vai trò:', error);
      if (error.message === 'Không tìm thấy vai trò') {
        res.status(404).json({ 
          success: false,
          message: 'Không tìm thấy vai trò'
        });
      } else {
        res.status(500).json({ 
          success: false,
          message: 'Lỗi khi cập nhật thông tin vai trò'
        });
      }
    }
  },

  // Xóa role
  deleteRole: async (req, res) => {
    const roleId = req.params.id;

    try {
      await roleService.deleteRole(roleId);
      res.json({ 
        success: true,
        message: 'Đã xóa vai trò thành công'
      });
    } catch (error) {
      console.error('Lỗi khi xóa vai trò:', error);
      if (error.message === 'Không tìm thấy vai trò') {
        res.status(404).json({ 
          success: false,
          message: 'Không tìm thấy vai trò'
        });
      } else if (error.message === 'Không thể xóa vai trò đang được sử dụng') {
        res.status(400).json({
          success: false,
          message: 'Không thể xóa vai trò đang được gán cho người dùng'
        });
      } else {
        res.status(500).json({ 
          success: false,
          message: 'Lỗi khi xóa vai trò'
        });
      }
    }
  }
};

module.exports = roleController; 