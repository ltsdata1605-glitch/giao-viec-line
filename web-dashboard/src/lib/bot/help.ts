import * as line from '@line/bot-sdk';
import { isAdmin } from './admin';

const USER_HELP_TEXT = `🤖 DANH SÁCH LỆNH BOT

• /vieccuatoi — Xem việc bạn đang được giao, chưa hoàn thành
• /tukhoa — Xem danh sách từ khoá Bot đang hỗ trợ
• /diemdanh <tiêu đề> [/noidung <nội dung>] /deadline <giờ> — Tạo điểm danh (ai cũng tạo được). Phần /noidung không bắt buộc, để chèn nội dung chi tiết (VD danh sách link — nên tự rút gọn link trước khi dán để tin nhắn gọn hơn). VD:
/diemdanh HOÀN TẤT LIKE VÀ SHARE BÀI
/noidung Link:
1. https://...
2. https://...
/deadline 20h00

💡 Mã việc (VD: a1b2c) hiển thị trên thẻ công việc hoặc trong /vieccuatoi.
💡 Gõ đúng từ khoá đã được cấu hình sẵn (vd tên chương trình khuyến mãi...) để nhận phản hồi tự động.
💡 Gõ /help hoặc /trogiup để xem lại danh sách này bất cứ lúc nào.
💡 Cần được giao việc hoặc cần thêm quyền thao tác? Liên hệ quản trị viên của nhóm.`;

const ADMIN_HELP_TEXT = `🤖 DANH SÁCH LỆNH BOT (Quản trị viên)

👤 Dành cho tất cả:
• /vieccuatoi — Xem việc bạn đang được giao, chưa hoàn thành
• /tukhoa — Xem danh sách từ khoá Bot đang hỗ trợ
• /diemdanh <tiêu đề> [/noidung <nội dung>] /deadline <giờ> — Tạo điểm danh (ai cũng tạo được). Phần /noidung không bắt buộc, để chèn nội dung chi tiết (VD danh sách link — nên tự rút gọn link trước khi dán để tin nhắn gọn hơn). VD:
/diemdanh HOÀN TẤT LIKE VÀ SHARE BÀI
/noidung Link:
1. https://...
2. https://...
/deadline 20h00

👑 Dành riêng cho quản trị viên:
• /giao <nội dung việc> — Giao việc mới (chỉ dùng khi chat riêng 1:1 với bot)
• /baocao — Báo cáo nhanh tình hình công việc
• /tuongtac [ngày|tuần|tháng] — Báo cáo tương tác theo từng nhân viên TRONG NHÓM đang chat (chỉ dùng được trong nhóm, không có tác dụng ở chat riêng)
• /dongbo — Đồng bộ danh sách thành viên trong nhóm (dùng trong nhóm)

🔑 Cấp quyền admin cho người khác:
Vào Dashboard → Thành viên → bấm sửa người cần cấp quyền → đổi "Vai trò" thành Admin và lưu lại.
Người đó sẽ dùng được /giao, /baocao, /tuongtac, /dongbo ngay sau khi cấp, không cần khởi động lại gì.

💡 Mã việc (VD: a1b2c) hiển thị trên thẻ công việc hoặc trong /vieccuatoi.
💡 Gõ /help hoặc /trogiup để xem lại danh sách này bất cứ lúc nào.
💡 Nhóm được bật "Nhận báo cáo tiến độ" (Dashboard > Nhóm) sẽ tự nhận thẻ báo cáo tiến độ công việc trong ngày vào 20h30.`;

/**
 * Lệnh /help: liệt kê toàn bộ lệnh bot hỗ trợ, thay thế vai trò "tra cứu nhanh" mà Rich Menu
 * từng đảm nhiệm trước khi bị gỡ bỏ (vì trỏ sai LIFF channel, không còn cách nào khác để biết cú pháp lệnh).
 * Nội dung khác nhau theo vai trò: admin thấy thêm lệnh quản trị + cách cấp quyền cho người khác;
 * người dùng thường chỉ thấy lệnh của mình (không lộ cách tự cấp quyền admin).
 */
export async function handleHelpCommand(
  event: line.webhook.MessageEvent,
  client: line.messagingApi.MessagingApiClient
) {
  const requesterId = event.source?.userId;
  const admin = await isAdmin(requesterId);

  await client.replyMessage({
    replyToken: event.replyToken as string,
    messages: [{ type: 'text', text: admin ? ADMIN_HELP_TEXT : USER_HELP_TEXT }]
  });
}
