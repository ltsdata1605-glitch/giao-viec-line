import * as line from '@line/bot-sdk';
import { adminDb } from '@/lib/firebase-admin';
import { isAdmin } from './admin';
import { parseVnDeadline, formatVnDateTime } from '@/lib/dateUtils';

const IN_PROGRESS_STATUSES = ['Chưa làm', 'Đang làm'];
const MAX_LISTED = 15;

interface UserInteraction {
  name: string;
  interactionTotal: number;
}

/**
 * Lệnh /baocao: tóm tắt nhanh tình hình công việc + tương tác theo từng nhân viên ngay trên LINE
 * (dùng được cả chat 1:1 lẫn trong nhóm), không cần mở Dashboard. Chỉ admin mới xem được.
 */
export async function handleBaoCaoCommand(
  event: line.webhook.MessageEvent,
  client: line.messagingApi.MessagingApiClient
) {
  if (!adminDb) return;
  const source = event.source as any;
  const requesterId = source?.userId;

  if (!(await isAdmin(requesterId))) {
    await client.replyMessage({
      replyToken: event.replyToken as string,
      messages: [{ type: 'text', text: '⚠️ Bạn không có quyền xem báo cáo. Vui lòng liên hệ quản trị viên nếu cần được cấp quyền.' }]
    });
    return;
  }

  const [tasksSnap, usersSnap] = await Promise.all([
    adminDb.collection('tasks').get(),
    adminDb.collection('users').get(),
  ]);

  // Thống kê công việc
  let total = 0, inProgress = 0, overdue = 0;
  let completedWithDeadline = 0, onTimeCompleted = 0;
  tasksSnap.docs.forEach((doc) => {
    const t = doc.data();
    total++;
    if (IN_PROGRESS_STATUSES.includes(t.status)) inProgress++;
    if (t.status === 'Quá hạn') overdue++;
    if (t.status === 'Hoàn thành' && t.deadline && t.updatedAt) {
      const deadlineMs = parseVnDeadline(t.deadline);
      const updatedMs = typeof t.updatedAt.toMillis === 'function' ? t.updatedAt.toMillis() : null;
      if (deadlineMs !== null && updatedMs !== null) {
        completedWithDeadline++;
        if (updatedMs <= deadlineMs) onTimeCompleted++;
      }
    }
  });
  const onTimeRate = completedWithDeadline > 0 ? Math.round((onTimeCompleted / completedWithDeadline) * 100) : null;

  // Tương tác theo nhân viên (dedupe theo lineUserId, đề phòng dữ liệu trùng)
  const uniqueUsers = new Map<string, UserInteraction>();
  usersSnap.docs.forEach((doc) => {
    const u = doc.data();
    if (!u.lineUserId) return;
    uniqueUsers.set(u.lineUserId, {
      name: u.name || u.lineUserId,
      interactionTotal: u.interactionTotal || 0,
    });
  });

  const allUsers = Array.from(uniqueUsers.values());
  const interacted = allUsers
    .filter((u) => u.interactionTotal > 0)
    .sort((a, b) => b.interactionTotal - a.interactionTotal);
  const neverInteracted = allUsers.filter((u) => u.interactionTotal === 0);

  let text = `📊 BÁO CÁO NHANH\n🕐 ${formatVnDateTime(Date.now())}\n\n`;
  text += `📋 CÔNG VIỆC\n`;
  text += `• Tổng: ${total} | Đang xử lý: ${inProgress} | Quá hạn: ${overdue}\n`;
  text += `• Hoàn thành đúng hạn: ${onTimeRate !== null ? onTimeRate + '%' : 'Chưa có dữ liệu'}\n\n`;

  text += `💬 TƯƠNG TÁC THEO NHÂN VIÊN (tổng từ trước đến nay)\n`;
  if (interacted.length === 0) {
    text += `Chưa có ai tương tác.\n`;
  } else {
    interacted.slice(0, MAX_LISTED).forEach((u, i) => {
      text += `${i + 1}. ${u.name} — ${u.interactionTotal} lượt\n`;
    });
    if (interacted.length > MAX_LISTED) text += `...và ${interacted.length - MAX_LISTED} người khác\n`;
  }

  text += `\n❌ CHƯA TỪNG TƯƠNG TÁC (${neverInteracted.length})\n`;
  if (neverInteracted.length === 0) {
    text += `🎉 Tất cả đều đã tương tác!\n`;
  } else {
    neverInteracted.slice(0, MAX_LISTED).forEach((u) => { text += `• ${u.name}\n`; });
    if (neverInteracted.length > MAX_LISTED) text += `...và ${neverInteracted.length - MAX_LISTED} người khác\n`;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://botline-zeta.vercel.app';
  text += `\n📈 Xem đầy đủ biểu đồ: ${appUrl}/dashboard/reports`;

  await client.replyMessage({
    replyToken: event.replyToken as string,
    messages: [{ type: 'text', text }]
  });
}
