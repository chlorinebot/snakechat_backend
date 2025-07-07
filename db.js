const mysql = require('mysql2/promise');

// Cấu hình kết nối tới MySQL
const pool = mysql.createPool({
  host: '127.0.0.1',
  user: 'root',
  password: '',
  port: '3306',
  database: 'snakechat',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  timezone: '+07:00', // Thiết lập múi giờ Việt Nam
});

// Biến theo dõi trạng thái kết nối
let connected = false;
let retryCount = 0;

// Kiểm tra kết nối
const connectToDatabase = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Kết nối MySQL thành công! ✅');
    
    // Thiết lập múi giờ cho phiên làm việc
    await connection.query("SET time_zone = '+07:00'");
    console.log('✅ Đã thiết lập múi giờ cho MySQL: UTC+7 (Việt Nam) ✅');
    
    connection.release();
    connected = true; // Cập nhật trạng thái kết nối
    retryCount = 0; // Reset số lần thử kết nối
    return pool;
  } catch (error) {
    console.error('❌ Lỗi kết nối MySQL: ', error.message, '❌');
    connected = false; // Cập nhật trạng thái kết nối
    
    // Tăng số lần thử kết nối
    retryCount++;
    
    console.log(`🔄 Thử kết nối lại sau 5 giây... (Lần thử ${retryCount}) 🔄`);
    // Thử kết nối lại sau 5 giây
    setTimeout(() => {
      connectToDatabase();
    }, 5000);
    
    // Không throw error để tránh crash ứng dụng
    return null;
  }
};

// Hàm kiểm tra trạng thái kết nối, có thể sử dụng ở các module khác
const isConnected = () => {
  return connected;
};

// Hàm lấy số lần đã thử kết nối
const getRetryCount = () => {
  return retryCount;
};

// Khởi tạo kết nối
connectToDatabase();

module.exports = {
  pool,
  isConnected,
  connectToDatabase,
  getRetryCount
};
