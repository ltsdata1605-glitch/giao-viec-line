import * as line from '@line/bot-sdk';
import { adminDb } from '@/lib/firebase-admin';
import { isAdmin } from './admin';
import { parseVnDeadline, formatVnDateTime, getVnWeekRange, getVnMonthRange } from '@/lib/dateUtils';

const IN_PROGRESS_STATUSES = ['Chưa làm', 'Đang làm'];
const MAX_LISTED = 15;

type Period = 'all' | 'week' | 'month';

const PERIOD_TITLES: Record<Period, string> = {
  all: 'TỪ TRƯỚC ĐẾN NAY',
  week: 'TUẦN NÀY, Thứ 2 - Chủ nhật',
  month: 'THÁNG NÀY',
};

function parsePeriod(text: string): Period {
  const arg = text.trim().split(/\s+/)[1]?.toLowerCase() || '';
  if (['tuần', 'tuan', 'week'].includes(arg)) return 'week';
  if (['tháng', 'thang', 'month'].includes(arg)) return 'month';
  return 'all';
}

interface UserInteraction {
  lineUserId: string;
  name: string;
  total: number;
}

/**
 * Dựng nội dung báo cáo (công việc + tương tác theo từng nhân viên) cho một kỳ, dùng chung cho cả
 * lệnh /baocao (trả lời trực tiếp) lẫn báo cáo tự động hằng ngày (đẩy chủ động qua cron).
 * Không truyền kỳ (mặc định "all") sẽ tính tổng dồn từ trước đến nay; "week"/"month" tính theo lịch VN,
 * dùng chung cách xác định tuần/tháng với biểu đồ Ngày/Tuần/Tháng ở trang Dashboard > Báo cáo.
 */
export async function buildBaoCaoText(period: Period = 'all'): Promise<string> {
  if (!adminDb) return 'Chưa cấu hình cơ sở dữ liệu.';

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

  // Danh sách nhân viên (dedupe theo lineUserId, đề phòng dữ liệu trùng)
  const userNames = new Map<string, string>();
  usersSnap.docs.forEach((doc) => {
    const u = doc.data();
    if (!u.lineUserId) return;
    userNames.set(u.lineUserId, u.name || u.lineUserId);
  });

  // Tổng lượt tương tác theo từng người, đúng theo kỳ đang chọn:
  // - "all": dùng luôn interactionTotal (đã cộng dồn sẵn trên doc user).
  // - "week"/"month": cộng từ userDailyInteractions trong đúng khoảng ngày của kỳ đó.
  const totalsByUser = new Map<string, number>();
  if (period === 'all') {
    usersSnap.docs.forEach((doc) => {
      const u = doc.data();
      if (!u.lineUserId) return;
      totalsByUser.set(u.lineUserId, (totalsByUser.get(u.lineUserId) || 0) + (u.interactionTotal || 0));
    });
  } else {
    const { startKey, endKey } = period === 'week' ? getVnWeekRange() : getVnMonthRange();
    const periodSnap = await adminDb.collection('userDailyInteractions')
      .where('date', '>=', startKey)
      .where('date', '<=', endKey)
      .get();
    periodSnap.docs.forEach((doc) => {
      const d = doc.data();
      if (!d.lineUserId) return;
      totalsByUser.set(d.lineUserId, (totalsByUser.get(d.lineUserId) || 0) + (d.total || 0));
    });
  }

  const allUsers: UserInteraction[] = Array.from(userNames.entries()).map(([lineUserId, name]) => ({
    lineUserId,
    name,
    total: totalsByUser.get(lineUserId) || 0,
  }));
  const interacted = allUsers.filter((u) => u.total > 0).sort((a, b) => b.total - a.total);
  const notInteracted = allUsers.filter((u) => u.total === 0);

  let msg = `📊 BÁO CÁO NHANH\n🕐 ${formatVnDateTime(Date.now())}\n\n`;
  msg += `📋 CÔNG VIỆC\n`;
  msg += `• Tổng: ${total} | Đang xử lý: ${inProgress} | Quá hạn: ${overdue}\n`;
  msg += `• Hoàn thành đúng hạn: ${onTimeRate !== null ? onTimeRate + '%' : 'Chưa có dữ liệu'}\n\n`;

  msg += `💬 TƯƠNG TÁC THEO NHÂN VIÊN (${PERIOD_TITLES[period]})\n`;
  if (interacted.length === 0) {
    msg += `Chưa có ai tương tác.\n`;
  } else {
    interacted.slice(0, MAX_LISTED).forEach((u, i) => {
      msg += `${i + 1}. ${u.name} — ${u.total} lượt\n`;
    });
    if (interacted.length > MAX_LISTED) msg += `...và ${interacted.length - MAX_LISTED} người khác\n`;
  }

  msg += `\n❌ KHÔNG TƯƠNG TÁC (${notInteracted.length})\n`;
  if (notInteracted.length === 0) {
    msg += `🎉 Tất cả đều đã tương tác!\n`;
  } else {
    notInteracted.slice(0, MAX_LISTED).forEach((u) => { msg += `• ${u.name}\n`; });
    if (notInteracted.length > MAX_LISTED) msg += `...và ${notInteracted.length - MAX_LISTED} người khác\n`;
  }

  if (period === 'all') {
    msg += `\n💡 Xem theo kỳ: /baocao tuần hoặc /baocao tháng`;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://botline-zeta.vercel.app';
  msg += `\n📈 Xem đầy đủ biểu đồ: ${appUrl}/dashboard/reports`;

  return msg;
}

/**
 * Lệnh /baocao [tuần|tháng]: tóm tắt nhanh tình hình công việc + tương tác theo từng nhân viên
 * ngay trên LINE (dùng được cả chat 1:1 lẫn trong nhóm), không cần mở Dashboard. Chỉ admin mới xem được.
 */
export async function handleBaoCaoCommand(
  text: string,
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

  const period = parsePeriod(text);
  const msg = await buildBaoCaoText(period);

  await client.replyMessage({
    replyToken: event.replyToken as string,
    messages: [{ type: 'text', text: msg }]
  });
}
