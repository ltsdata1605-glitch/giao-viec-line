const fs = require('fs');
const { execSync } = require('child_process');

const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwt7wU2EeCGWsGCPhJhFTehtqA3vqzgBoy9dHv11RRZU0KbX3X7KW1-LuivVmpr31lG/exec";
const LIFF_ID = "2010371497-R9x4l665";

// 1. Biên dịch liff.html thành index.html
function buildIndexHtml() {
  console.log("🚀 Bắt đầu biên dịch liff.html -> index.html...");

  if (!fs.existsSync('liff.html')) {
    console.error("❌ Không tìm thấy file liff.html trong thư mục hiện tại!");
    process.exit(1);
  }

  let htmlContent = fs.readFileSync('liff.html', 'utf8');

  // Thay thế biến template <?= webAppUrl ?> và fallback thành URL thật
  const targetPattern = /const WEB_APP_URL = "<\?= webAppUrl \?>" \|\| ".*?";/;
  const replacement = `const WEB_APP_URL = "${WEB_APP_URL}";`;

  if (targetPattern.test(htmlContent)) {
    htmlContent = htmlContent.replace(targetPattern, replacement);
    console.log("✅ Đã thay thế WEB_APP_URL bằng URL thực tế.");
  } else {
    // Thử thay thế mẫu đơn giản hơn nếu không khớp mẫu phức tạp
    htmlContent = htmlContent.replace(/const WEB_APP_URL = ".*?";/g, `const WEB_APP_URL = "${WEB_APP_URL}";`);
    console.log("⚠️ Không tìm thấy mẫu chuẩn, đã thay thế toàn bộ WEB_APP_URL bằng URL thực tế.");
  }

  // Đảm bảo LIFF_ID đúng
  htmlContent = htmlContent.replace(/const LIFF_ID = ".*?";/g, `const LIFF_ID = "${LIFF_ID}";`);

  // Lưu ra file index.html
  fs.writeFileSync('index.html', htmlContent, 'utf8');
  console.log("🎉 Đã tạo file index.html thành công!");
}

// 2. Tự động push lên GitHub
function syncToGitHub() {
  console.log("\n📦 Bắt đầu đồng bộ lên GitHub...");
  try {
    // Kiểm tra xem thư mục đã khởi tạo Git chưa
    if (!fs.existsSync('.git')) {
      console.log("🔧 Chưa phát hiện Git local. Đang khởi tạo...");
      execSync('git init');
      execSync('git remote add origin https://github.com/ltsdata1605-glitch/giao-viec-line.git');
      execSync('git branch -M main');
      console.log("✅ Đã khởi tạo Git local và liên kết tới repo GitHub.");
    }

    // Đẩy đè bản sạch local lên GitHub
    console.log("📤 Đang đẩy đè file index.html lên GitHub (Force Push)...");
    execSync('git add index.html');

    // Tạo commit tin nhắn kèm thời gian
    const commitMsg = `Auto sync: ${new Date().toLocaleString()}`;
    try {
      execSync(`git commit -m "${commitMsg}"`);
    } catch (e) {
      console.log("ℹ️ Không có thay đổi nào mới để commit.");
    }

    // Đẩy đè lên branch main
    console.log("⚡ Đang chạy lệnh git push -f...");
    execSync('git push -f origin main');
    console.log("🚀 Hoàn thành! File đã được đẩy lên GitHub Pages thành công.");
  } catch (err) {
    console.error("❌ Lỗi xảy ra trong quá trình đồng bộ Git:");
    console.error(err.message);
    console.log("\n💡 Gợi ý: Nếu lệnh git push thất bại, có thể do:");
    console.log("1. Bạn chưa cấu hình SSH/Token đăng nhập GitHub trên Terminal của máy tính này.");
    console.log("2. Thư mục GitHub Pages của bạn sử dụng nhánh mặc định khác (như 'master'). Bạn có thể thử đẩy thủ công trước.");
  }
}

// Chạy quy trình
buildIndexHtml();
syncToGitHub();
