import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { adminDb } from '@/lib/firebase-admin';
import { parseVnDeadline, getVnDateKey } from '@/lib/dateUtils';

const STATUS_ORDER = ['Chờ gửi', 'Chưa làm', 'Đang làm', 'Hoàn thành', 'Quá hạn', 'Đã hủy'];
const OTHER_MESSAGE_TYPES = ['video', 'audio', 'file', 'location'];

/**
 * Xuất báo cáo công việc + tương tác ra file Excel (.xlsx) thật, mỗi phần một sheet riêng — dùng
 * ExcelJS thay vì thư viện "xlsx" (SheetJS) vì bản trên npm còn lỗ hổng bảo mật nghiêm trọng chưa
 * có bản vá (Prototype Pollution + ReDoS). Tính toán lại số liệu ở server bằng Admin SDK, không tái
 * dùng logic phía trang Báo cáo (đang chạy client SDK), nhưng cùng công thức để 2 nơi luôn khớp nhau.
 */
export async function GET() {
  if (!adminDb) {
    return NextResponse.json({ error: 'No db' }, { status: 500 });
  }

  const now = Date.now();

  const [tasksSnap, usersSnap, interactionsSnap] = await Promise.all([
    adminDb.collection('tasks').get(),
    adminDb.collection('users').get(),
    adminDb.collection('dailyInteractions').get(),
  ]);

  const tasks = tasksSnap.docs.map((doc) => {
    const raw = doc.data();
    return {
      name: raw.name || '',
      status: raw.status || 'Chờ gửi',
      assignees: (raw.assignees || []) as string[],
      deadline: raw.deadline || '',
      createdAtMs: raw.createdAt?.toMillis?.() ?? null,
      updatedAtMs: raw.updatedAt?.toMillis?.() ?? null,
    };
  });

  const userRows = usersSnap.docs.map((doc) => {
    const raw = doc.data();
    return {
      lineUserId: raw.lineUserId || '',
      name: raw.name || raw.lineUserId || '',
      interactionTotal: raw.interactionTotal || 0,
    };
  });
  const userNameMap = new Map(userRows.map((u) => [u.lineUserId, u.name]));

  const totalTasks = tasks.length;
  const statusCounts: Record<string, number> = {};
  STATUS_ORDER.forEach((s) => { statusCounts[s] = 0; });
  tasks.forEach((t) => { statusCounts[t.status] = (statusCounts[t.status] || 0) + 1; });

  const completedTasks = tasks.filter((t) => t.status === 'Hoàn thành');
  const completedWithDeadline = completedTasks.filter((t) => t.deadline && t.updatedAtMs !== null && parseVnDeadline(t.deadline) !== null);
  const onTimeCompleted = completedWithDeadline.filter((t) => t.updatedAtMs! <= parseVnDeadline(t.deadline)!);
  const onTimeRate = completedWithDeadline.length > 0 ? Math.round((onTimeCompleted.length / completedWithDeadline.length) * 100) : null;
  const overdueCount = statusCounts['Quá hạn'] || 0;

  const turnaroundDaysList = completedTasks
    .filter((t) => t.createdAtMs !== null && t.updatedAtMs !== null)
    .map((t) => (t.updatedAtMs! - t.createdAtMs!) / 86400000);
  const avgTurnaroundDays = turnaroundDaysList.length > 0
    ? turnaroundDaysList.reduce((a, b) => a + b, 0) / turnaroundDaysList.length
    : null;

  const assigneeMap = new Map<string, { total: number; completed: number; overdue: number; onTimeCompleted: number; completedWithDeadline: number }>();
  tasks.forEach((t) => {
    t.assignees.forEach((uid) => {
      if (!uid || !uid.startsWith('U')) return;
      const entry = assigneeMap.get(uid) || { total: 0, completed: 0, overdue: 0, onTimeCompleted: 0, completedWithDeadline: 0 };
      entry.total++;
      if (t.status === 'Hoàn thành') {
        entry.completed++;
        const deadlineMs = t.deadline ? parseVnDeadline(t.deadline) : null;
        if (deadlineMs !== null && t.updatedAtMs !== null) {
          entry.completedWithDeadline++;
          if (t.updatedAtMs <= deadlineMs) entry.onTimeCompleted++;
        }
      }
      if (t.status === 'Quá hạn') entry.overdue++;
      assigneeMap.set(uid, entry);
    });
  });
  const assigneeStats = Array.from(assigneeMap.entries())
    .map(([uid, stats]) => ({
      name: userNameMap.get(uid) || uid.slice(0, 8),
      ...stats,
      onTimeRate: stats.completedWithDeadline > 0 ? Math.round((stats.onTimeCompleted / stats.completedWithDeadline) * 100) : null,
    }))
    .sort((a, b) => b.total - a.total);

  const overdueList = tasks
    .filter((t) => t.status === 'Quá hạn')
    .map((t) => {
      const deadlineMs = parseVnDeadline(t.deadline);
      const daysOverdue = deadlineMs !== null ? Math.floor((now - deadlineMs) / 86400000) : null;
      const assigneeNames = t.assignees.map((uid) => userNameMap.get(uid) || uid.slice(0, 8)).join(', ');
      return { name: t.name, assigneeNames, daysOverdue };
    })
    .sort((a, b) => (b.daysOverdue || 0) - (a.daysOverdue || 0));

  const interactionRows = interactionsSnap.docs.map((doc) => {
    const raw = doc.data();
    const other = OTHER_MESSAGE_TYPES.reduce((sum, t) => sum + (raw[t] || 0), 0);
    return { text: raw.text || 0, image: raw.image || 0, sticker: raw.sticker || 0, other, total: raw.total || 0 };
  });
  const interactionTotal = interactionRows.reduce((sum, d) => sum + d.total, 0);
  const interactionByType = {
    'Tin nhắn văn bản': interactionRows.reduce((sum, d) => sum + d.text, 0),
    'Hình ảnh': interactionRows.reduce((sum, d) => sum + d.image, 0),
    'Sticker': interactionRows.reduce((sum, d) => sum + d.sticker, 0),
    'Khác (video/file/vị trí...)': interactionRows.reduce((sum, d) => sum + d.other, 0),
  };
  const topInteractors = userRows
    .filter((u) => u.interactionTotal > 0)
    .sort((a, b) => b.interactionTotal - a.interactionTotal);

  // --- Dựng workbook ---
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Bot LINE Dashboard';
  workbook.created = new Date(now);

  const headerStyle = { font: { bold: true } };

  const overviewSheet = workbook.addWorksheet('Tổng quan');
  overviewSheet.columns = [{ header: 'Chỉ số', key: 'label', width: 32 }, { header: 'Giá trị', key: 'value', width: 20 }];
  overviewSheet.getRow(1).font = headerStyle.font;
  overviewSheet.addRows([
    { label: 'Tổng công việc', value: totalTasks },
    { label: 'Hoàn thành đúng hạn', value: onTimeRate !== null ? `${onTimeRate}%` : 'Chưa có dữ liệu' },
    { label: 'Đang quá hạn', value: overdueCount },
    { label: 'Thời gian xử lý TB (ngày)', value: avgTurnaroundDays !== null ? Number(avgTurnaroundDays.toFixed(1)) : 'Chưa có dữ liệu' },
    { label: 'Tổng lượt tương tác', value: interactionTotal },
  ]);

  const statusSheet = workbook.addWorksheet('Phân bố trạng thái');
  statusSheet.columns = [{ header: 'Trạng thái', key: 'status', width: 20 }, { header: 'Số lượng', key: 'count', width: 14 }];
  statusSheet.getRow(1).font = headerStyle.font;
  STATUS_ORDER.forEach((s) => statusSheet.addRow({ status: s, count: statusCounts[s] }));

  const assigneeSheet = workbook.addWorksheet('Hiệu suất nhân viên');
  assigneeSheet.columns = [
    { header: 'Người nhận', key: 'name', width: 26 },
    { header: 'Tổng việc', key: 'total', width: 12 },
    { header: 'Hoàn thành', key: 'completed', width: 12 },
    { header: 'Quá hạn', key: 'overdue', width: 12 },
    { header: 'Đúng hạn (%)', key: 'onTimeRate', width: 14 },
  ];
  assigneeSheet.getRow(1).font = headerStyle.font;
  assigneeStats.forEach((a) => assigneeSheet.addRow({ name: a.name, total: a.total, completed: a.completed, overdue: a.overdue, onTimeRate: a.onTimeRate ?? '' }));

  const overdueSheet = workbook.addWorksheet('Công việc quá hạn');
  overdueSheet.columns = [
    { header: 'Tên việc', key: 'name', width: 36 },
    { header: 'Người nhận', key: 'assigneeNames', width: 26 },
    { header: 'Số ngày trễ', key: 'daysOverdue', width: 14 },
  ];
  overdueSheet.getRow(1).font = headerStyle.font;
  overdueList.forEach((t) => overdueSheet.addRow({ name: t.name, assigneeNames: t.assigneeNames || '', daysOverdue: t.daysOverdue ?? '' }));

  const interactionSheet = workbook.addWorksheet('Thống kê tương tác');
  interactionSheet.columns = [{ header: 'Loại', key: 'type', width: 30 }, { header: 'Số lượt', key: 'count', width: 14 }];
  interactionSheet.getRow(1).font = headerStyle.font;
  (Object.entries(interactionByType)).forEach(([type, count]) => interactionSheet.addRow({ type, count }));

  const topInteractorsSheet = workbook.addWorksheet('Top tương tác');
  topInteractorsSheet.columns = [{ header: 'Tên', key: 'name', width: 26 }, { header: 'Số lượt', key: 'total', width: 14 }];
  topInteractorsSheet.getRow(1).font = headerStyle.font;
  topInteractors.forEach((u) => topInteractorsSheet.addRow({ name: u.name, total: u.interactionTotal }));

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="bao-cao-${getVnDateKey(now)}.xlsx"`,
    },
  });
}
