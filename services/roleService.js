const { pool, isConnected } = require('../db');

const roleService = {
  getAllRoles: async () => {
    // Truy vấn để lấy tất cả vai trò
    const [rows] = await pool.query('SELECT * FROM role');
    return rows;
  },

  createRole: async (roleData) => {
    const { role_name, description } = roleData;
    
    // Kiểm tra xem vai trò đã tồn tại chưa
    const [existingRoles] = await pool.query('SELECT * FROM role WHERE role_name = ?', [role_name]);
    
    if (existingRoles.length > 0) {
      throw new Error('Vai trò đã tồn tại');
    }
    
    // Thêm vai trò mới
    const [result] = await pool.query(
      'INSERT INTO role (role_name, description) VALUES (?, ?)',
      [role_name, description]
    );
    
    return {
      role_id: result.insertId,
      role_name,
      description
    };
  },

  updateRole: async (roleId, roleData) => {
    const { role_name, description } = roleData;
    
    // Kiểm tra vai trò tồn tại không
    const [existingRole] = await pool.query('SELECT * FROM role WHERE role_id = ?', [roleId]);
    
    if (existingRole.length === 0) {
      throw new Error('Không tìm thấy vai trò');
    }
    
    // Kiểm tra xem role_name mới đã tồn tại chưa (trừ vai trò hiện tại)
    const [duplicateRole] = await pool.query(
      'SELECT * FROM role WHERE role_name = ? AND role_id != ?', 
      [role_name, roleId]
    );
    
    if (duplicateRole.length > 0) {
      throw new Error('Tên vai trò đã tồn tại');
    }
    
    // Cập nhật thông tin vai trò
    const [result] = await pool.query(
      'UPDATE role SET role_name = ?, description = ? WHERE role_id = ?',
      [role_name, description, roleId]
    );
    
    if (result.affectedRows === 0) {
      throw new Error('Không thể cập nhật vai trò');
    }
    
    return {
      role_id: parseInt(roleId),
      role_name,
      description
    };
  },

  deleteRole: async (roleId) => {
    // Kiểm tra vai trò tồn tại không
    const [existingRole] = await pool.query('SELECT * FROM role WHERE role_id = ?', [roleId]);
    
    if (existingRole.length === 0) {
      throw new Error('Không tìm thấy vai trò');
    }
    
    // Kiểm tra xem vai trò có đang được sử dụng bởi người dùng không
    const [usersWithRole] = await pool.query('SELECT * FROM users WHERE role_id = ?', [roleId]);
    
    if (usersWithRole.length > 0) {
      throw new Error('Không thể xóa vai trò đang được sử dụng');
    }
    
    // Xóa vai trò
    const [result] = await pool.query('DELETE FROM role WHERE role_id = ?', [roleId]);
    
    if (result.affectedRows === 0) {
      throw new Error('Không thể xóa vai trò');
    }
    
    return true;
  },

  getRoleById: async (roleId) => {
    const [rows] = await pool.query('SELECT * FROM role WHERE role_id = ?', [roleId]);
    
    if (rows.length === 0) {
      throw new Error('Không tìm thấy vai trò');
    }
    
    return rows[0];
  }
};

module.exports = roleService; 