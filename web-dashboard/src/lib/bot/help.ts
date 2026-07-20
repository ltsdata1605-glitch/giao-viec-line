import * as line from '@line/bot-sdk';

const HELP_TEXT = `🤖 DANH SÁCH LỆNH BOT

👤 Dành cho tất cả:
• /vieccuatoi — Xem việc bạn đang được giao, chưa hoàn thành
• /nhan <mã việc> — Nhận một công việc (hoặc bấm nút "Nhận việc" trên thẻ công việc)
• /xong <mã việc> — Báo hoàn tất công việc (hoặc bấm nút "✅ Hoàn tất")
• /huy <mã việc> — Huỷ công việc (chỉ người giao việc hoặc admin)

👑 Dành cho quản trị viên:
• /giao <nội dung việc> — Giao việc mới (chỉ dùng khi chat riêng 1:1 với bot)
• /baocao [tuần|tháng] — Báo cáo nhanh công việc + tương tác theo nhân viên
• /dongbo — Đồng bộ danh sách thành viên trong nhóm (dùng trong nhóm)

💡 Mã việc (VD: a1b2c) hiển thị trên thẻ công việc hoặc trong /vieccuatoi.
💡 Gõ /help hoặc /trogiup để xem lại danh sách này bất cứ lúc nào.
💡 Admin còn tự động nhận báo cáo tóm tắt mỗi sáng qua tin nhắn riêng, không cần gõ lệnh.
💡 Mỗi nhóm còn tự động nhận thẻ báo cáo tiến độ công việc trong ngày vào 14h và 20h30.`;

/**
 * Lệnh /help: liệt kê toàn bộ lệnh bot hỗ trợ, thay thế vai trò "tra cứu nhanh" mà Rich Menu
 * từng đảm nhiệm trước khi bị gỡ bỏ (vì trỏ sai LIFF channel, không còn cách nào khác để biết cú pháp lệnh).
 */
export async function handleHelpCommand(
  event: line.webhook.MessageEvent,
  client: line.messagingApi.MessagingApiClient
) {
  await client.replyMessage({
    replyToken: event.replyToken as string,
    messages: [{ type: 'text', text: HELP_TEXT }]
  });
}
