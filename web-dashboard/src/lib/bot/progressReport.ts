import * as line from '@line/bot-sdk';
import type { Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { getVnStartOfDayMs } from '@/lib/dateUtils';

// Chỉ còn 1 khung giờ/ngày (20h30) để tiết kiệm quota tin nhắn chủ động (push) của gói LINE OA —
// trước đây có thêm khung 14h (giữa ngày) nhưng đã bỏ theo yêu cầu giảm tải quota.
const REPORT_TITLE = 'BÁO CÁO TIẾN ĐỘ CUỐI NGÀY';

function statRow(icon: string, label: string, value: number, color: string): line.messagingApi.FlexBox {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: `${icon} ${label}`, size: 'sm', color: '#555555', flex: 4 },
      { type: 'text', text: String(value), size: 'sm', weight: 'bold', color, align: 'end', flex: 1 },
    ],
  };
}

function buildGroupProgressFlex(params: {
  title: string;
  groupName: string;
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  overdue: number;
  completionRate: number;
  topPerformers: { name: string; count: number }[];
}): line.messagingApi.FlexMessage {
  const { title, groupName, total, completed, inProgress, notStarted, overdue, completionRate, topPerformers } = params;

  const bodyContents: line.messagingApi.FlexComponent[] = [
    { type: 'text', text: 'Tổng hợp trạng thái công việc hôm nay:', color: '#888888', size: 'sm', wrap: true },
    { type: 'separator', margin: 'md' },
    statRow('📊', 'Tổng số công việc', total, '#333333'),
    statRow('🎉', 'Đã hoàn thành', completed, '#10b981'),
    statRow('⚡', 'Đang tiến hành', inProgress, '#3b82f6'),
    statRow('🕓', 'Chưa bắt đầu', notStarted, '#64748b'),
    statRow('⚠️', 'Đã quá hạn', overdue, '#ef4444'),
    { type: 'separator', margin: 'md' },
    { type: 'text', text: '🏆 TOP HOÀN THÀNH', weight: 'bold', color: '#10b981', size: 'sm', margin: 'md' },
  ];

  if (topPerformers.length === 0) {
    bodyContents.push({ type: 'text', text: 'Chưa có ai hoàn thành việc nào.', size: 'sm', color: '#888888', margin: 'xs' });
  } else {
    topPerformers.forEach((p, i) => {
      bodyContents.push({ type: 'text', text: `${i + 1}. ${p.name}: ${p.count} việc`, size: 'sm', color: '#333333', margin: 'xs', wrap: true });
    });
  }

  bodyContents.push(
    { type: 'separator', margin: 'md' },
    {
      type: 'box',
      layout: 'horizontal',
      margin: 'md',
      contents: [
        { type: 'text', text: 'Tỷ lệ hoàn thành', color: '#888888', size: 'sm', flex: 3 },
        { type: 'text', text: `${completionRate}%`, weight: 'bold', color: '#10b981', size: 'sm', align: 'end', flex: 1 },
      ],
    }
  );

  return {
    type: 'flex',
    altText: `${title} - ${groupName}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#10b981',
        paddingAll: 'lg',
        contents: [
          { type: 'text', text: `📊 ${title}`, color: '#ffffff', weight: 'bold', size: 'lg', wrap: true },
          { type: 'text', text: `Phạm vi: ${groupName}`, color: '#ffffffcc', size: 'sm', margin: 'sm', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: bodyContents,
      },
    },
  };
}

/**
 * Gửi báo cáo tiến độ công việc (Flex card) cho từng nhóm LINE đã bật "Nhận báo cáo tiến độ tự động"
 * (field groups.progressReportEnabled, mặc định tắt — bật thủ công ở Dashboard > Nhóm). Chỉ tính các
 * công việc được TẠO TRONG HÔM NAY (giờ VN) thuộc nhóm đó — mỗi nhóm chỉ thấy tiến độ của riêng nhóm
 * mình, không gộp chung toàn hệ thống. Nhóm không có việc nào hôm nay thì bỏ qua, không gửi báo cáo rỗng.
 * Trả về số nhóm đã gửi thành công.
 */
export async function sendGroupProgressReports(
  adminDb: Firestore,
  lineClient: line.messagingApi.MessagingApiClient,
  now: number
): Promise<number> {
  const startOfTodayMs = getVnStartOfDayMs(now);

  const [tasksSnap, usersSnap, groupsSnap] = await Promise.all([
    adminDb.collection('tasks').where('createdAt', '>=', Timestamp.fromMillis(startOfTodayMs)).get(),
    adminDb.collection('users').get(),
    adminDb.collection('groups').get(),
  ]);

  const nameByUid = new Map<string, string>();
  usersSnap.docs.forEach((doc) => {
    const u = doc.data();
    if (u.lineUserId) nameByUid.set(u.lineUserId, u.name || u.lineUserId);
  });

  const groupNameById = new Map<string, string>();
  const enabledGroupIds = new Set<string>();
  groupsSnap.docs.forEach((doc) => {
    const g = doc.data();
    if (!g.lineGroupId) return;
    groupNameById.set(g.lineGroupId, g.name || 'Nhóm');
    if (g.progressReportEnabled) enabledGroupIds.add(g.lineGroupId);
  });

  // Gom việc theo từng nhóm (1 việc có thể thuộc nhiều nhóm nếu groupIds > 1 phần tử);
  // bỏ qua việc "Đã hủy" vì không còn tính vào tiến độ đang xử lý.
  const tasksByGroup = new Map<string, FirebaseFirestore.DocumentData[]>();
  tasksSnap.docs.forEach((doc) => {
    const t = doc.data();
    if (t.status === 'Đã hủy') return;
    const groupIds: string[] = t.groupIds && t.groupIds.length > 0
      ? t.groupIds
      : (t.groupId && t.groupId !== 'personal' ? [t.groupId] : []);
    groupIds.forEach((gid) => {
      if (!tasksByGroup.has(gid)) tasksByGroup.set(gid, []);
      tasksByGroup.get(gid)!.push(t);
    });
  });

  const title = REPORT_TITLE;
  let sentCount = 0;

  for (const [groupId, tasks] of tasksByGroup.entries()) {
    if (tasks.length === 0) continue;
    if (!enabledGroupIds.has(groupId)) continue; // nhóm chưa được bật nhận báo cáo tiến độ (mặc định tắt)
    const groupName = groupNameById.get(groupId) || 'Nhóm';

    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === 'Hoàn thành').length;
    const inProgress = tasks.filter((t) => t.status === 'Đang làm').length;
    const notStarted = tasks.filter((t) => t.status === 'Chưa làm' || t.status === 'Chờ gửi').length;
    const overdue = tasks.filter((t) => t.status === 'Quá hạn').length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    const completedByAssignee = new Map<string, number>();
    tasks.filter((t) => t.status === 'Hoàn thành').forEach((t) => {
      (t.assignees || []).forEach((uid: string) => {
        if (!uid || !uid.startsWith('U')) return;
        completedByAssignee.set(uid, (completedByAssignee.get(uid) || 0) + 1);
      });
    });
    const topPerformers = Array.from(completedByAssignee.entries())
      .map(([uid, count]) => ({ name: nameByUid.get(uid) || uid.slice(0, 8), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    const flex = buildGroupProgressFlex({ title, groupName, total, completed, inProgress, notStarted, overdue, completionRate, topPerformers });

    try {
      await lineClient.pushMessage({ to: groupId, messages: [flex] });
      sentCount++;
    } catch (e) {
      console.error('Failed to send group progress report', groupId, e);
    }
  }

  return sentCount;
}
