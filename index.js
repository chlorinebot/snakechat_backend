const express = require('express');
const cors = require('cors');
const http = require('http');
const userRoutes = require('./routes/userRoutes');
const authRoutes = require('./routes/authRoutes');
const roleRoutes = require('./routes/roleRoutes');
const friendshipRoutes = require('./routes/friendshipRoutes');
const conversationRoutes = require('./routes/conversationRoutes');
const messageRoutes = require('./routes/messageRoutes');
const reportRoutes = require('./routes/reportRoutes');
const announcementRoutes = require('./routes/announcementRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const errorHandler = require('./middleware/errorHandler');
const { setupInactiveUsersCron } = require('./services/cronService');
const { setupSocket } = require('./socket');
const { connectToDatabase, isConnected, db } = require('./db');

const app = express();
const server = http.createServer(app);

// CORS Configuration cho production
const corsOptions = {
  origin: [
    'https://snakechatfrontend.up.railway.app', // Production URL
    'http://localhost:3000',
    'http://localhost:5173',
    'https://localhost:3000',
    'https://localhost:5173'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Trust proxy cho Railway
app.set('trust proxy', true);

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint - quan trọng cho Railway
app.get('/health', (req, res) => {
  try {
    console.log('[HEALTH-CHECK] Health check request received');
    
    const healthData = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      database: isConnected() ? 'connected' : 'disconnected',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version,
      port: PORT,
      env: process.env.NODE_ENV || 'development'
    };
    
    console.log('[HEALTH-CHECK] Responding with:', healthData);
    res.status(200).json(healthData);
  } catch (error) {
    console.error('[HEALTH-CHECK] Error in health check:', error);
    res.status(500).json({
      status: 'ERROR',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Thêm endpoint ping đơn giản
app.get('/ping', (req, res) => {
  console.log('[PING] Ping request received');
  res.status(200).send('pong');
});

// Root endpoint
app.get('/', (req, res) => {
  try {
    console.log('[ROOT] Root endpoint accessed');
    res.status(200).json({
      message: 'SnakeChat Backend API đang hoạt động',
      timestamp: new Date().toISOString(),
      status: 'running',
      port: PORT,
      version: process.version
    });
  } catch (error) {
    console.error('[ROOT] Error in root endpoint:', error);
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Routes với error wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

app.use('/api/auth', asyncHandler(authRoutes));
app.use('/api/user', asyncHandler(userRoutes));
app.use('/api/role', asyncHandler(roleRoutes));
app.use('/api/friendship', asyncHandler(friendshipRoutes));
app.use('/api/conversations', asyncHandler(conversationRoutes));
app.use('/api/messages', asyncHandler(messageRoutes));
app.use('/api/report', asyncHandler(reportRoutes));
app.use('/api/announcement', asyncHandler(announcementRoutes));
app.use('/api/upload', asyncHandler(uploadRoutes));

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Thiết lập Socket.IO với error handling
let io;
try {
  io = setupSocket(server);
  // Chia sẻ io với các module khác
  app.set('io', io);
  console.log('✅ Socket.IO đã được thiết lập thành công');
} catch (error) {
  console.error('❌ Lỗi khi thiết lập Socket.IO:', error);
}

// Khởi động cron jobs với error handling
try {
  setupInactiveUsersCron();
  console.log('✅ Cron jobs đã được khởi động');
} catch (error) {
  console.error('❌ Lỗi khi khởi động cron jobs:', error);
}

const PORT = process.env.PORT || 8000;

// Khởi động server với error handling tốt hơn
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server đang chạy trên port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📊 API docs: http://localhost:${PORT}/`);
  console.log(`🏠 Host: 0.0.0.0`);
});

server.on('error', (error) => {
  console.error('❌ Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`🚫 Port ${PORT} đã được sử dụng. Thử port khác.`);
    process.exit(1);
  }
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n📴 Nhận tín hiệu ${signal}. Đang tắt server...`);
  
  // Ngừng nhận connection mới
  server.close(async () => {
    console.log('🔌 HTTP server đã đóng');
    
    try {
      // Đóng database connection
      if (db) {
        await db.end();
        console.log('🗄️ Database connection đã đóng');
      }
      
      console.log('✅ Graceful shutdown hoàn thành');
      process.exit(0);
    } catch (error) {
      console.error('❌ Lỗi khi shutdown:', error);
      process.exit(1);
    }
  });
  
  // Force shutdown sau 30 giây
  setTimeout(() => {
    console.error('⏰ Force shutdown sau 30 giây timeout');
    process.exit(1);
  }, 30000);
};

// Lắng nghe các tín hiệu shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Xử lý uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection tại:', promise, 'lý do:', reason);
  gracefulShutdown('unhandledRejection');
});

console.log('🚀 SnakeChat Backend khởi động thành công!');
