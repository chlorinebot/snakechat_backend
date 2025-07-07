const cloudinary = require('cloudinary').v2;

// Cấu hình Cloudinary
cloudinary.config({
  cloud_name: 'dzcqjemgj',
  api_key: '254951339833796',
  api_secret: '2hSgCDhTjtN8QwFoDoAl_XKsgc',
  secure: true
});

module.exports = cloudinary; 