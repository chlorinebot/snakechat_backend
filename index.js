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
const { connectToDatabase, isConnected } = require('./db');

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
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: isConnected() ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'SnakeChat Backend API đang hoạt động',
    timestamp: new Date().toISOString(),
    status: 'running'
  });
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

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`🔄 Nhận signal ${signal}, đang shutdown server...`);
  
  server.close((err) => {
    if (err) {
      console.error('❌ Lỗi khi đóng server:', err);
      process.exit(1);
    }
    console.log('✅ HTTP server đã đóng');
    
    // Đóng socket.io nếu có
    if (io) {
      io.close(() => {
        console.log('✅ Socket.IO đã đóng');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });
  
  // Force close sau 10 giây
  setTimeout(() => {
    console.error('❌ Timeout - Buộc đóng server');
    process.exit(1);
  }, 10000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Error handling - quan trọng cho Railway
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  // Không tự động shutdown để tránh crash liên tục trên Railway
  // gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Không tự động shutdown để tránh crash liên tục trên Railway
});

// Khởi động server
const startServer = async () => {
  try {
    console.log('🚀 Đang khởi động SnakeChat Backend...');
    console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
    console.log('📦 Node.js version:', process.version);
    
    // Thử kết nối database nhưng không blocking server start
    console.log('🔄 Đang kết nối database...');
    connectToDatabase().catch(err => {
      console.warn('⚠️ Không thể kết nối database lúc startup, sẽ thử lại sau:', err.message);
    });
    
    // Start server ngay lập tức
    server.listen(PORT, '0.0.0.0', () => {
      console.log('🚀 Server đang chạy trên cổng:', PORT);
      console.log('🌐 Server URL: http://0.0.0.0:' + PORT);
      console.log('✅ SnakeChat Backend đã sẵn sàng!');
    });
    
  } catch (error) {
    console.error('❌ Lỗi khởi động server:', error);
    console.error('Stack:', error.stack);
    // Thử khởi động lại sau một khoảng thời gian
    setTimeout(() => {
      console.log('🔄 Thử khởi động lại server...');
      startServer();
    }, 5000);
  }
};

// Start server
startServer();
