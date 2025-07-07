-- Script khắc phục lỗi thông báo chung
-- Chạy script này trong MySQL để tạo bảng GeneralAnnouncement

-- Tạo bảng thông báo chung
CREATE TABLE IF NOT EXISTS GeneralAnnouncement (
  AnnouncementID INT(11) PRIMARY KEY AUTO_INCREMENT,
  AnnouncementContent TEXT NOT NULL,
  AnnouncementType VARCHAR(100) NOT NULL DEFAULT 'Thông tin',
  CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='Bảng quản lý thông báo chung của hệ thống';

-- Thêm một số dữ liệu mẫu (tùy chọn)
INSERT INTO GeneralAnnouncement (AnnouncementContent, AnnouncementType) VALUES 
('Chào mừng bạn đến với SnakeChat! Hệ thống đã sẵn sàng hoạt động.', 'Thông tin'),
('Hệ thống sẽ bảo trì vào 2:00 AM hàng ngày để cập nhật dữ liệu.', 'Bảo trì'),
('Tính năng thông báo chung đã được kích hoạt thành công!', 'Cập nhật');

-- Kiểm tra dữ liệu đã được tạo
SELECT * FROM GeneralAnnouncement ORDER BY CreatedAt DESC; 