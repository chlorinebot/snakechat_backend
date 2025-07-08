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
app.set('trust proxy', 1);

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: isConnected() ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/role', roleRoutes);
app.use('/api/friendship', friendshipRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/announcement', announcementRoutes);
app.use('/api/upload', uploadRoutes);

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

// Thiết lập Socket.IO
const io = setupSocket(server);
// Chia sẻ io với các module khác
app.set('io', io);

// Khởi động cron jobs
setupInactiveUsersCron();

const PORT = process.env.PORT || 8000;

// Graceful shutdown
const gracefulShutdown = () => {
  console.log('🔄 Đang shutdown server...');
  
  server.close(() => {
    console.log('✅ HTTP server đã đóng');
    process.exit(0);
  });
  
  // Force close sau 10 giây
  setTimeout(() => {
    console.error('❌ Buộc đóng server');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Khởi động server
const startServer = async () => {
  try {
    // Đợi database kết nối trước khi start server
    await connectToDatabase();
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log('🚀 Server đang chạy trên cổng:', PORT);
      console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
      console.log('✅ Socket.IO đã được thiết lập');
    });
    
  } catch (error) {
    console.error('❌ Lỗi khởi động server:', error);
    process.exit(1);
  }
};

startServer();
