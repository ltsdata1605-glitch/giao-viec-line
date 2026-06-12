const fs = require('fs');
const { exec } = require('child_process');

console.log("👀 Đang theo dõi file liff.html để tự động đồng bộ lên GitHub...");
console.log("💡 Mỗi khi bạn bấm Save (Lưu) file liff.html, code sẽ tự động được compile và đẩy lên GitHub.");
console.log("👉 Nhấn Ctrl + C để dừng theo dõi.\n");

let fsTimeout;
fs.watch('liff.html', (eventType, filename) => {
  if (filename) {
    // Debounce: Tránh chạy trùng lặp nhiều lần khi file lưu liên tục
    if (!fsTimeout) {
      console.log(`📝 Phát hiện thay đổi trong ${filename}. Đang tự động đồng bộ...`);
      
      exec('node sync.js', (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ Đồng bộ thất bại: ${error.message}`);
          return;
        }
        console.log(stdout);
        console.log("✨ Đã đồng bộ thành công lên GitHub Pages!");
      });
      
      fsTimeout = setTimeout(() => { fsTimeout = null; }, 1000); // Khóa 1 giây
    }
  }
});
