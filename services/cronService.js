const userController = require('../controllers/userController');

// Server side CRON job để tự động cập nhật trạng thái người dùng không hoạt động
const setupInactiveUsersCron = () => {
  console.log('Đã khởi động cron job kiểm tra người dùng không hoạt động');
  
  // Thực hiện kiểm tra ngay khi khởi động
  setTimeout(async () => {
    try {
      console.log('Kiểm tra người dùng không hoạt động lúc khởi động...');
      await checkAndUpdateInactiveUsers();
      
      // Kiểm tra và mở khóa tài khoản đến hạn
      console.log('Kiểm tra tài khoản đến hạn mở khóa lúc khởi động...');
      await checkAndUnlockExpiredAccounts();
    } catch (error) {
      console.error('Lỗi khi kiểm tra lúc khởi động:', error);
    }
  }, 2000); // Chờ 2 giây để đảm bảo server đã khởi động đầy đủ
  
  // Chạy mỗi 10 giây để kiểm tra người dùng không hoạt động
  setInterval(async () => {
    try {
      console.log('CRON: Bắt đầu kiểm tra người dùng không hoạt động...');
      await checkAndUpdateInactiveUsers();
    } catch (error) {
      console.error('Lỗi khi kiểm tra người dùng không hoạt động:', error);
    }
  }, 10 * 1000); // Kiểm tra mỗi 10 giây
  
  // Chạy mỗi phút để kiểm tra và mở khóa tài khoản đến hạn
  setInterval(async () => {
    try {
      console.log('CRON: Bắt đầu kiểm tra tài khoản đến hạn mở khóa...');
      await checkAndUnlockExpiredAccounts();
    } catch (error) {
      console.error('Lỗi khi kiểm tra tài khoản đến hạn mở khóa:', error);
    }
  }, 60 * 1000); // Kiểm tra mỗi 60 giây (1 phút)
};

// Hàm trợ giúp để kiểm tra và cập nhật người dùng không hoạt động
const checkAndUpdateInactiveUsers = async () => {
  // Tạo object req và res giả lập cho controller
  const req = {
    ip: '127.0.0.1',
    body: { threshold_minutes: 0.5 }, // Người dùng không hoạt động quá 30 giây (0.5 phút)
    headers: {}
  };
  
  const res = {
    json: (data) => {
      // Hiển thị log nếu có người dùng bị đánh dấu offline
      if (data && data.data && data.data.affected > 0) {
        console.log(`CRON: Đã cập nhật trạng thái offline cho ${data.data.affected} người dùng không hoạt động`);
        // Log thông tin chi tiết về người dùng bị đánh dấu offline
        if (data.data.users && data.data.users.length > 0) {
          console.log('CRON: Danh sách người dùng bị đánh dấu offline:');
          data.data.users.forEach(user => {
            console.log(`  - ID: ${user.user_id}, Username: ${user.username}, Hoạt động cuối: ${user.last_activity || 'N/A'}`);
          });
        }
      } else {
        console.log('CRON: Không có người dùng nào cần cập nhật trạng thái offline');
      }
    },
    status: (code) => {
      return {
        json: (data) => {
          // Hiển thị lỗi nếu có
          if (code !== 200) {
            console.error(`CRON: Lỗi (${code}) khi kiểm tra người dùng không hoạt động:`, data);
          }
        }
      };
    }
  };
  
  // Gọi controller để kiểm tra và cập nhật
  await userController.checkInactiveUsers(req, res);
  
  // Thêm dấu thời gian cho những lần chạy tiếp theo
  console.log(`CRON: Hoàn tất kiểm tra người dùng không hoạt động vào lúc ${new Date().toISOString()}`);
};

// Hàm trợ giúp để kiểm tra và mở khóa tài khoản đến hạn
const checkAndUnlockExpiredAccounts = async () => {
  // Tạo object req và res giả lập cho controller
  const req = {
    ip: '127.0.0.1',
    body: {},
    headers: {}
  };
  
  const res = {
    json: (data) => {
      // Hiển thị log nếu có tài khoản được mở khóa
      if (data && data.data && data.data.affected > 0) {
        console.log(`CRON: Đã tự động mở khóa ${data.data.affected} tài khoản`);
        // Log thông tin chi tiết về tài khoản được mở khóa
        if (data.data.accounts && data.data.accounts.length > 0) {
          console.log('CRON: Danh sách tài khoản đã được mở khóa:');
          data.data.accounts.forEach(account => {
            console.log(`  - ID: ${account.user_id}, Username: ${account.username}, Lý do khóa: ${account.reason}`);
          });
        }
      } else {
        console.log('CRON: Không có tài khoản nào cần mở khóa');
      }
    },
    status: (code) => {
      return {
        json: (data) => {
          // Hiển thị lỗi nếu có
          if (code !== 200) {
            console.error(`CRON: Lỗi (${code}) khi mở khóa tài khoản đến hạn:`, data);
          }
        }
      };
    }
  };
  
  // Gọi controller để kiểm tra và mở khóa
  await userController.autoUnlockExpiredAccounts(req, res);
  
  // Thêm dấu thời gian cho những lần chạy tiếp theo
  console.log(`CRON: Hoàn tất kiểm tra tài khoản đến hạn mở khóa vào lúc ${new Date().toISOString()}`);
};

module.exports = {
  setupInactiveUsersCron
}; 