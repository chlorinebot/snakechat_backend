const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool, isConnected } = require('../db');

// Đăng ký
router.post('/register', async (req, res) => {
    try {
        const { username, email, password, birthday } = req.body;
        
        // Kiểm tra email đã tồn tại
        const [existingUsers] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (existingUsers.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email đã được sử dụng' 
            });
        }

        // Kiểm tra username đã tồn tại
        const [existingUsernames] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
        if (existingUsernames.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Tên đăng nhập đã được sử dụng' 
            });
        }

        // Mã hóa mật khẩu
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Thêm người dùng mới với role_id = 2 (người dùng)
        const [result] = await pool.query(
            'INSERT INTO users (username, email, password, birthday, role_id) VALUES (?, ?, ?, ?, 2)',
            [username, email, hashedPassword, birthday]
        );

        res.status(201).json({
            success: true,
            message: 'Đăng ký thành công'
        });
    } catch (error) {
        console.error('Lỗi đăng ký:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Lỗi server' 
        });
    }
});

// Đăng nhập
router.post('/login', async (req, res) => {
    try {
        const { identity, password } = req.body;

        // Tìm user theo email hoặc username
        const [users] = await pool.query('SELECT * FROM users WHERE email = ? OR username = ?', [identity, identity]);
        if (users.length === 0) {
            return res.status(401).json({ 
                success: false, 
                message: 'Thông tin đăng nhập không chính xác' 
            });
        }

        const user = users[0];
        console.log('Thông tin user từ database:', { user_id: user.user_id, email: user.email, username: user.username });

        // Kiểm tra mật khẩu
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ 
                success: false, 
                message: 'Thông tin đăng nhập không chính xác' 
            });
        }

        // Cập nhật trạng thái online ngay khi đăng nhập thành công
        await pool.query('UPDATE users SET status = ? WHERE user_id = ?', ['online', user.user_id]);
        console.log(`Đã cập nhật trạng thái online cho user ${user.user_id} khi đăng nhập`);

        // Tạo đối tượng user không chứa mật khẩu
        const userWithoutPassword = {
            user_id: user.user_id, // Sửa từ id thành user_id để khớp với interface bên client
            id: user.user_id,      // Để đảm bảo tương thích với cả hai cách
            username: user.username,
            email: user.email,
            role_id: user.role_id
        };

        console.log('Gửi thông tin user về client:', userWithoutPassword);

        res.json({
            success: true,
            message: 'Đăng nhập thành công',
            user: userWithoutPassword,
            token: 'dummy_token' // TODO: Implement JWT
        });
    } catch (error) {
        console.error('Lỗi đăng nhập:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Lỗi server' 
        });
    }
});

module.exports = router; 