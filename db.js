const mysql = require('mysql2/promise');

// Cấu hình kết nối tới MySQL
const pool = mysql.createPool({
  host: 'crossover.proxy.rlwy.net',
  user: 'root',
  password: 'UfLbHIusxLkfkhNjHLtMyVcngTWqhkhG',
  port: '24147',
  database: 'snakechat',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  timezone: '+07:00', // Thiết lập múi giờ Việt Nam
  acquireTimeout: 60000, // 60 giây timeout để lấy connection
  timeout: 60000, // 60 giây timeout cho query
  reconnect: true, // Tự động kết nối lại
  idleTimeout: 300000, // 5 phút idle timeout
});

// Biến theo dõi trạng thái kết nối
let connected = false;
let retryCount = 0;
const maxRetries = 5; // Giới hạn số lần thử kết nối

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
    
    // Nếu vượt quá số lần thử tối đa, không thử lại nữa
    if (retryCount >= maxRetries) {
      console.error(`❌ Đã thử kết nối ${maxRetries} lần, dừng thử kết nối lại`);
      return null;
    }
    
    console.log(`🔄 Thử kết nối lại sau 5 giây... (Lần thử ${retryCount}/${maxRetries}) 🔄`);
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

// Xử lý lỗi pool
pool.on('connection', (connection) => {
  console.log('📦 MySQL pool connection established as id ' + connection.threadId);
});

pool.on('error', (err) => {
  console.error('❌ MySQL pool error:', err);
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    console.log('🔄 Kết nối MySQL bị mất, thử kết nối lại...');
    connected = false;
    connectToDatabase();
  } else {
    console.error('❌ Lỗi MySQL nghiêm trọng:', err);
  }
});

// Khởi tạo kết nối
connectToDatabase();

module.exports = {
  pool,
  isConnected,
  connectToDatabase,
  getRetryCount
};
