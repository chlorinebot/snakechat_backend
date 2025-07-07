-- Tạo bảng người dùng
CREATE TABLE IF NOT EXISTS users (
  user_id INT(11) PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL,
  password VARCHAR(255) NOT NULL,
  email VARCHAR(100) NOT NULL,
  birthday DATE,
  role_id INT(11) NOT NULL DEFAULT 2,
  status ENUM('online', 'offline') DEFAULT 'offline',
  last_activity TIMESTAMP NULL,
  join_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tạo bảng vai trò
CREATE TABLE IF NOT EXISTS role (
  role_id INT(11) PRIMARY KEY AUTO_INCREMENT,
  role_name VARCHAR(50) NOT NULL,
  description TEXT
);

-- Tạo bảng khóa tài khoản
CREATE TABLE IF NOT EXISTS user_lock (
  lock_id INT(11) PRIMARY KEY AUTO_INCREMENT,
  user_id INT(11) NOT NULL,
  reason VARCHAR(255),
  status VARCHAR(50) DEFAULT 'locked',
  lock_time DATETIME NOT NULL,
  unlock_time DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Tạo bảng kết bạn
CREATE TABLE IF NOT EXISTS friendships (
  friendship_id INT(11) PRIMARY KEY AUTO_INCREMENT,
  user_id_1 INT(11) NOT NULL,
  user_id_2 INT(11) NOT NULL,
  status ENUM('pending', 'accepted') NOT NULL DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id_1) REFERENCES users(user_id),
  FOREIGN KEY (user_id_2) REFERENCES users(user_id)
);

-- Tạo bảng báo cáo sự cố và góp ý
CREATE TABLE IF NOT EXISTS reports (
  id_reports INT AUTO_INCREMENT PRIMARY KEY,
  id_user INT(11) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  report_type ENUM('complaint', 'suggestion', 'bug_report') DEFAULT 'complaint',
  status ENUM('unresolved', 'received', 'resolved') DEFAULT 'unresolved',
  submission_time DATETIME,
  reception_time DATETIME,
  resolution_time DATETIME,
  notes TEXT,
  FOREIGN KEY (id_user) REFERENCES users(user_id)
);

-- Thêm dữ liệu mẫu cho vai trò
INSERT IGNORE INTO role (role_id, role_name, description) VALUES 
(1, 'admin', 'Quản trị viên'),
(2, 'user', 'Người dùng');

-- Tạo bảng cuộc trò chuyện
CREATE TABLE IF NOT EXISTS conversations (
  conversation_id BIGINT(20) PRIMARY KEY AUTO_INCREMENT,
  conversation_type ENUM('personal', 'group', 'system') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tạo bảng thành viên cuộc trò chuyện
CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id BIGINT(20) NOT NULL,
  user_id INT(11) NOT NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  left_at DATETIME NULL,
  PRIMARY KEY (conversation_id, user_id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Tạo bảng tin nhắn
CREATE TABLE IF NOT EXISTS messages (
  message_id BIGINT(20) PRIMARY KEY AUTO_INCREMENT,
  conversation_id BIGINT(20) NOT NULL,
  sender_id INT(11) NOT NULL,
  content TEXT NOT NULL,
  message_type ENUM('text', 'image', 'file', 'system') NOT NULL DEFAULT 'text',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id),
  FOREIGN KEY (sender_id) REFERENCES users(user_id)
);

-- Tạo bảng đính kèm tin nhắn
CREATE TABLE IF NOT EXISTS message_attachments (
  attachment_id BIGINT(20) PRIMARY KEY AUTO_INCREMENT,
  message_id BIGINT(20) NOT NULL,
  file_uri VARCHAR(255) NOT NULL,
  file_type ENUM('image', 'video', 'document', 'audio', 'other') NOT NULL,
  file_size BIGINT(20) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES messages(message_id)
); 

-- Tạo bảng user_blocks để quản lý chức năng chặn người dùng
CREATE TABLE user_blocks (
    block_id BIGINT(20) NOT NULL AUTO_INCREMENT,
    blocker_id INT(11) NOT NULL COMMENT 'ID người dùng thực hiện chặn',
    blocked_id INT(11) NOT NULL COMMENT 'ID người dùng bị chặn',
    reason VARCHAR(255) DEFAULT NULL COMMENT 'Lý do chặn (tùy chọn)',
    block_type ENUM('temporary', 'permanent') DEFAULT 'permanent' COMMENT 'Loại chặn: tạm thời hoặc vĩnh viễn',
    blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời gian chặn',
    unblock_at TIMESTAMP NULL DEFAULT NULL COMMENT 'Thời gian bỏ chặn (cho chặn tạm thời)',
    status ENUM('active', 'removed') DEFAULT 'active' COMMENT 'Trạng thái chặn',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    PRIMARY KEY (block_id),
    UNIQUE KEY unique_block (blocker_id, blocked_id),
    FOREIGN KEY (blocker_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (blocked_id) REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Indexes để tối ưu performance
    INDEX idx_blocker_id (blocker_id),
    INDEX idx_blocked_id (blocked_id),
    INDEX idx_status (status),
    INDEX idx_blocked_at (blocked_at),
    INDEX idx_block_type (block_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='Bảng quản lý chặn người dùng';

-- Thêm constraint để ngăn người dùng tự chặn mình
ALTER TABLE user_blocks 
ADD CONSTRAINT chk_no_self_block 
CHECK (blocker_id != blocked_id);
