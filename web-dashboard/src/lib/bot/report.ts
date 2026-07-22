import * as line from '@line/bot-sdk';
import { adminDb } from '@/lib/firebase-admin';
import { isAdmin } from './admin';
import { parseVnDeadline, formatVnDateTime, getVnDateKey, getVnWeekRange, getVnMonthRange } from '@/lib/dateUtils';

const IN_PROGRESS_STATUSES = ['Chưa làm', 'Đang làm'];
const MAX_LISTED = 15;

type Period = 'all' | 'day' | 'week' | 'month';

const PERIOD_TITLES: Record<Period, string> = {
  all: 'TỪ TRƯỚC ĐẾN NAY',
  day: 'HÔM NAY',
  week: 'TUẦN NÀY, Thứ 2 - Chủ nhật',
  month: 'THÁNG NÀY',
};

function parsePeriod(text: string): Period {
  const arg = text.trim().split(/\s+/)[1]?.toLowerCase() || '';
  if (['ngày', 'ngay', 'day'].includes(arg)) return 'day';
  if (['tuần', 'tuan', 'week'].includes(arg)) return 'week';
  if (['tháng', 'thang', 'month'].includes(arg)) return 'month';
  return 'all';
}

interface UserInteraction {
  lineUserId: string;
  name: string;
  total: number;
}

interface GroupScope {
  groupId: string;
  groupName: string;
}

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://botline-zeta.vercel.app';

/**
 * Dựng nội dung báo cáo CÔNG VIỆC (tổng/đang xử lý/quá hạn/% đúng hạn) — trạng thái hiện tại,
 * không tách theo kỳ vì đây là snapshot tức thời, không phải số liệu tích luỹ theo ngày.
 * Dùng chung cho lệnh /baocao và báo cáo tự động hằng ngày.
 */
export async function buildTaskReportText(): Promise<string> {
  if (!adminDb) return 'Chưa cấu hình cơ sở dữ liệu.';

  const tasksSnap = await adminDb.collection('tasks').get();

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

  let msg = `📋 BÁO CÁO CÔNG VIỆC\n🕐 ${formatVnDateTime(Date.now())}\n\n`;
  msg += `• Tổng: ${total} | Đang xử lý: ${inProgress} | Quá hạn: ${overdue}\n`;
  msg += `• Hoàn thành đúng hạn: ${onTimeRate !== null ? onTimeRate + '%' : 'Chưa có dữ liệu'}\n`;
  msg += `\n📈 Xem đầy đủ: ${APP_URL()}/dashboard/reports`;

  return msg;
}

/**
 * Dựng nội dung báo cáo TƯƠNG TÁC theo từng nhân viên cho một kỳ — dùng chung cho lệnh /tuongtac
 * và báo cáo tự động hằng ngày. Không truyền kỳ (mặc định "all") tính tổng dồn từ trước đến nay;
 * "day"/"week"/"month" tính theo lịch VN, dùng chung cách xác định ngày/tuần/tháng với biểu đồ
 * Dashboard > Báo cáo. Truyền groupScope để giới hạn báo cáo trong đúng 1 nhóm (dùng khi gõ lệnh
 * ngay trong nhóm đó) — chỉ tính tương tác xảy ra trong nhóm này, tiêu đề kèm tên nhóm.
 */
export async function buildInteractionReportText(period: Period = 'all', groupScope?: GroupScope): Promise<string> {
  if (!adminDb) return 'Chưa cấu hình cơ sở dữ liệu.';

  const usersSnap = await adminDb.collection('users').get();

  const userNames = new Map<string, string>();
  usersSnap.docs.forEach((doc) => {
    const u = doc.data();
    if (!u.lineUserId) return;
    userNames.set(u.lineUserId, u.name || u.lineUserId);
  });

  let allUsers: UserInteraction[];

  if (groupScope) {
    // Lọc theo groupId (1 field, không cần composite index), rồi lọc tiếp theo ngày ở phía JS —
    // tránh phải tạo composite index thủ công cho (groupId + date) trên Firestore.
    const groupDocsSnap = await adminDb.collection('groupUserDailyInteractions').where('groupId', '==', groupScope.groupId).get();
    const knownUserIds = new Set<string>();
    groupDocsSnap.docs.forEach((d) => {
      const uid = d.data().lineUserId;
      if (uid) knownUserIds.add(uid);
    });

    let relevantDocs = groupDocsSnap.docs;
    if (period === 'day') {
      const todayKey = getVnDateKey();
      relevantDocs = relevantDocs.filter((d) => d.data().date === todayKey);
    } else if (period === 'week' || period === 'month') {
      const { startKey, endKey } = period === 'week' ? getVnWeekRange() : getVnMonthRange();
      relevantDocs = relevantDocs.filter((d) => {
        const date = d.data().date;
        return date >= startKey && date <= endKey;
      });
    }

    const totalsByUser = new Map<string, number>();
    relevantDocs.forEach((d) => {
      const data = d.data();
      if (!data.lineUserId) return;
      totalsByUser.set(data.lineUserId, (totalsByUser.get(data.lineUserId) || 0) + (data.total || 0));
    });

    allUsers = Array.from(knownUserIds).map((uid) => ({
      lineUserId: uid,
      name: userNames.get(uid) || uid.slice(0, 8),
      total: totalsByUser.get(uid) || 0,
    }));
  } else {
    const totalsByUser = new Map<string, number>();
    if (period === 'all') {
      usersSnap.docs.forEach((doc) => {
        const u = doc.data();
        if (!u.lineUserId) return;
        totalsByUser.set(u.lineUserId, (totalsByUser.get(u.lineUserId) || 0) + (u.interactionTotal || 0));
      });
    } else {
      let periodSnap;
      if (period === 'day') {
        periodSnap = await adminDb.collection('userDailyInteractions').where('date', '==', getVnDateKey()).get();
      } else {
        const { startKey, endKey } = period === 'week' ? getVnWeekRange() : getVnMonthRange();
        periodSnap = await adminDb.collection('userDailyInteractions').where('date', '>=', startKey).where('date', '<=', endKey).get();
      }
      periodSnap.docs.forEach((doc) => {
        const d = doc.data();
        if (!d.lineUserId) return;
        totalsByUser.set(d.lineUserId, (totalsByUser.get(d.lineUserId) || 0) + (d.total || 0));
      });
    }

    allUsers = Array.from(userNames.entries()).map(([lineUserId, name]) => ({
      lineUserId,
      name,
      total: totalsByUser.get(lineUserId) || 0,
    }));
  }

  const interacted = allUsers.filter((u) => u.total > 0).sort((a, b) => b.total - a.total);
  const notInteracted = allUsers.filter((u) => u.total === 0);

  let msg = groupScope
    ? `💬 BÁO CÁO TƯƠNG TÁC — ${groupScope.groupName}\n🕐 ${formatVnDateTime(Date.now())}\n\n`
    : `💬 BÁO CÁO TƯƠNG TÁC\n🕐 ${formatVnDateTime(Date.now())}\n\n`;
  msg += `THEO NHÂN VIÊN (${PERIOD_TITLES[period]})\n`;
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
    msg += `\n💡 Xem theo kỳ: /tuongtac ngày, /tuongtac tuần, hoặc /tuongtac tháng`;
  }
  msg += `\n📈 Xem đầy đủ biểu đồ: ${APP_URL()}/dashboard/reports`;

  return msg;
}

async function requireAdmin(event: line.webhook.MessageEvent, client: line.messagingApi.MessagingApiClient): Promise<boolean> {
  const source = event.source as any;
  const requesterId = source?.userId;
  if (await isAdmin(requesterId)) return true;
  await client.replyMessage({
    replyToken: event.replyToken as string,
    messages: [{ type: 'text', text: '⚠️ Bạn không có quyền xem báo cáo. Vui lòng liên hệ quản trị viên nếu cần được cấp quyền.' }]
  });
  return false;
}

/**
 * Lệnh /baocao: tóm tắt nhanh tình hình công việc (không gồm tương tác — xem /tuongtac) ngay trên
 * LINE, dùng được cả chat 1:1 lẫn trong nhóm. Chỉ admin mới xem được.
 */
export async function handleBaoCaoCommand(
  event: line.webhook.MessageEvent,
  client: line.messagingApi.MessagingApiClient
) {
  if (!adminDb) return;
  if (!(await requireAdmin(event, client))) return;

  const msg = await buildTaskReportText();
  await client.replyMessage({
    replyToken: event.replyToken as string,
    messages: [{ type: 'text', text: msg }]
  });
}

/**
 * Lệnh /tuongtac [ngày|tuần|tháng]: báo cáo tương tác theo từng nhân viên, tách riêng khỏi báo cáo
 * công việc. Gõ trong 1 nhóm cụ thể sẽ chỉ báo cáo tương tác trong đúng nhóm đó (tiêu đề kèm tên
 * nhóm); gõ trong chat 1:1 thì báo cáo toàn hệ thống như trước. Chỉ admin mới xem được.
 */
export async function handleTuongTacCommand(
  text: string,
  event: line.webhook.MessageEvent,
  client: line.messagingApi.MessagingApiClient
) {
  if (!adminDb) return;
  if (!(await requireAdmin(event, client))) return;

  const period = parsePeriod(text);

  const source = event.source as any;
  let groupScope: GroupScope | undefined;
  if (source?.type === 'group' && source.groupId) {
    const groupSnap = await adminDb.collection('groups').where('lineGroupId', '==', source.groupId).limit(1).get();
    const groupName = groupSnap.empty ? 'Nhóm này' : (groupSnap.docs[0].data().name || 'Nhóm này');
    groupScope = { groupId: source.groupId, groupName };
  }

  const msg = await buildInteractionReportText(period, groupScope);
  await client.replyMessage({
    replyToken: event.replyToken as string,
    messages: [{ type: 'text', text: msg }]
  });
}
