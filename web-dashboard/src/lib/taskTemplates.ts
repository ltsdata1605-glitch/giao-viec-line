/**
 * Mẫu nhanh cho form giao việc — dùng chung giữa LIFF (mobile) và Dashboard (web)
 * để 2 nơi tạo việc có cùng tính năng, không phải định nghĩa lặp lại.
 */
export const QUICK_TEMPLATES = [
  { label: 'Truyền thông:', title: 'Truyền thông', desc: 'Thực hiện truyền thông về...' },
  { label: 'Online và GHTK', title: 'Xử lý đơn Online', desc: 'Kiểm tra và xử lý các đơn hàng online, đóng gói GHTK.' },
  { label: 'Chụp ảnh trưng bày', title: 'Chụp ảnh trưng bày', desc: 'Chụp ảnh các góc trưng bày gửi báo cáo.' },
  { label: 'Nhắc họp đầu ca', title: 'Họp đầu ca', desc: 'Chuẩn bị nội dung và nhắc mọi người họp đầu ca.' },
  { label: 'Hoàn tất báo cáo', title: 'Làm báo cáo', desc: 'Hoàn tất báo cáo doanh thu và nộp cho quản lý.' },
  { label: 'Kiểm tra vệ sinh quầy kệ', title: 'Kiểm tra vệ sinh quầy kệ', desc: 'Kiểm tra vệ sinh và lau dọn quầy kệ trưng bày theo line được phân công. Đảm bảo sạch và đầy đủ bảng giá' },
  { label: 'Gọi khách hẹn nhận hàng', title: 'Gọi khách hẹn', desc: 'Gọi điện thoại cho khách hàng đã hẹn nhận hàng hôm nay.' },
  { label: 'Chăm sóc khách sau bán', title: 'Chăm sóc khách hàng', desc: 'Gọi điện hỏi thăm khách hàng sau khi mua hàng.' }
];
