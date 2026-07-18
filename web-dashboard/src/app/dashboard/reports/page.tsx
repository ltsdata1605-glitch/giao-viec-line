'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, Timestamp } from 'firebase/firestore';
import { parseVnDeadline, getVnDateKey } from '@/lib/dateUtils';

interface TaskRow {
  id: string;
  name: string;
  status: string;
  assignees: string[];
  deadline: string;
  createdAtMs: number | null;
  updatedAtMs: number | null;
}

interface UserRow {
  lineUserId: string;
  name: string;
  interactionTotal: number;
}

interface DailyInteraction {
  date: string;
  text: number;
  image: number;
  sticker: number;
  other: number;
  total: number;
}

// Nhóm các loại tin nhắn ít gặp (video/audio/file/location) chung vào "Khác" cho gọn biểu đồ
const OTHER_MESSAGE_TYPES = ['video', 'audio', 'file', 'location'];

// Thứ tự vòng đời + màu khớp đúng bảng màu trạng thái đã dùng ở trang Công việc (statusStyles),
// để một trạng thái luôn cùng một màu xuyên suốt dashboard.
const STATUS_ORDER = ['Chờ gửi', 'Chưa làm', 'Đang làm', 'Hoàn thành', 'Quá hạn', 'Đã hủy'];
const STATUS_COLORS: Record<string, string> = {
  'Chờ gửi': '#eab308',
  'Chưa làm': '#64748b',
  'Đang làm': '#3b82f6',
  'Hoàn thành': '#10b981',
  'Quá hạn': '#ef4444',
  'Đã hủy': '#6b7280',
};

function toMs(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toDate().getTime();
  return null;
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: 'red' | 'emerald' }) {
  const color = accent === 'red' ? 'text-red-400' : accent === 'emerald' ? 'text-emerald-400' : 'text-[var(--color-text-primary)]';
  return (
    <div className="glass rounded-2xl p-5">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-[var(--color-text-muted)] mt-1">{label}</p>
    </div>
  );
}

function StatusBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div title={`${label}: ${count} việc (${Math.round(pct)}%)`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[var(--color-text-secondary)]">{label}</span>
        <span className="text-xs font-semibold text-[var(--color-text-primary)]">{count}</span>
      </div>
      <div className="h-3 rounded bg-[var(--color-bg-card)] overflow-hidden">
        <div
          className="h-full rounded-r transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function TrendChart({ labels, counts }: { labels: string[]; counts: number[] }) {
  const max = Math.max(1, ...counts);
  return (
    <div className="flex items-end justify-between gap-2 h-32">
      {counts.map((count, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1.5" title={`${labels[i]}: ${count} việc`}>
          <span className="text-[10px] text-[var(--color-text-muted)]">{count > 0 ? count : ''}</span>
          <div className="w-full flex items-end h-24">
            <div
              className="w-full rounded-t bg-[var(--color-accent)] transition-all duration-500"
              style={{ height: `${(count / max) * 100}%`, minHeight: count > 0 ? '3px' : '0' }}
            />
          </div>
          <span className="text-[10px] text-[var(--color-text-muted)]">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [interactions, setInteractions] = useState<DailyInteraction[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadTasks() {
    try {
      const snap = await getDocs(collection(db, 'tasks'));
      const data = snap.docs.map((d) => {
        const raw = d.data();
        return {
          id: d.id,
          name: raw.name || '',
          status: raw.status || 'Chờ gửi',
          assignees: raw.assignees || [],
          deadline: raw.deadline || '',
          createdAtMs: toMs(raw.createdAt),
          updatedAtMs: toMs(raw.updatedAt),
        } as TaskRow;
      });
      setTasks(data);
    } catch (err) {
      console.error('Error loading tasks for reports:', err);
    }
  }

  async function loadUsers() {
    try {
      const snap = await getDocs(collection(db, 'users'));
      const rawUsers = snap.docs.map((d) => d.data() as { lineUserId?: string; name?: string; interactionTotal?: number });
      const uniqueUsers = Array.from(new Map(rawUsers.map((u) => [u.lineUserId, u])).values());
      setUsers(uniqueUsers.map((u) => ({
        lineUserId: u.lineUserId || '',
        name: u.name || u.lineUserId || '',
        interactionTotal: u.interactionTotal || 0,
      })));
    } catch (err) {
      console.error('Error loading users for reports:', err);
    }
  }

  async function loadInteractions() {
    try {
      const snap = await getDocs(collection(db, 'dailyInteractions'));
      const data = snap.docs.map((d) => {
        const raw = d.data();
        const other = OTHER_MESSAGE_TYPES.reduce((sum, t) => sum + (raw[t] || 0), 0);
        return {
          date: d.id,
          text: raw.text || 0,
          image: raw.image || 0,
          sticker: raw.sticker || 0,
          other,
          total: raw.total || 0,
        } as DailyInteraction;
      });
      setInteractions(data);
    } catch (err) {
      console.error('Error loading interactions for reports:', err);
    }
  }

  const [now, setNow] = useState(0);

  useEffect(() => {
    // Chốt mốc "hiện tại" tại thời điểm tải dữ liệu (không gọi Date.now() giữa lúc render
    // để tránh vi phạm quy tắc component thuần của React).
    Promise.all([loadTasks(), loadUsers(), loadInteractions()]).then(() => {
      setNow(Date.now());
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-12 w-64 rounded-xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
        </div>
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    );
  }

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

  // Hiệu suất theo người nhận việc
  const assigneeMap = new Map<string, { total: number; completed: number; overdue: number; onTimeCompleted: number; completedWithDeadline: number }>();
  tasks.forEach((t) => {
    t.assignees.forEach((uid) => {
      if (!uid || !uid.startsWith('U')) return; // bỏ qua tên rơi rớt không phải LINE ID thật
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

  const userNameMap = new Map(users.map((u) => [u.lineUserId, u.name]));
  const assigneeStats = Array.from(assigneeMap.entries())
    .map(([uid, stats]) => ({
      uid,
      name: userNameMap.get(uid) || uid.slice(0, 8),
      ...stats,
      onTimeRate: stats.completedWithDeadline > 0 ? Math.round((stats.onTimeCompleted / stats.completedWithDeadline) * 100) : null,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // Xu hướng tạo việc 7 ngày gần nhất
  const dayKeys: string[] = [];
  const dayLabels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    dayKeys.push(d.toISOString().slice(0, 10));
    dayLabels.push(`${d.getDate()}/${d.getMonth() + 1}`);
  }
  const trendCounts = dayKeys.map((key) =>
    tasks.filter((t) => t.createdAtMs !== null && new Date(t.createdAtMs).toISOString().slice(0, 10) === key).length
  );

  // Danh sách quá hạn, trễ nhiều nhất lên đầu
  const overdueList = tasks
    .filter((t) => t.status === 'Quá hạn')
    .map((t) => {
      const deadlineMs = parseVnDeadline(t.deadline);
      const daysOverdue = deadlineMs !== null ? Math.floor((now - deadlineMs) / 86400000) : null;
      const assigneeNames = t.assignees.map((uid) => userNameMap.get(uid) || uid.slice(0, 8)).join(', ');
      return { ...t, daysOverdue, assigneeNames };
    })
    .sort((a, b) => (b.daysOverdue || 0) - (a.daysOverdue || 0))
    .slice(0, 10);

  // Thống kê tương tác: tổng + phân loại theo tin nhắn/hình ảnh/sticker/khác
  const interactionTotal = interactions.reduce((sum, d) => sum + d.total, 0);
  const interactionByType = {
    text: interactions.reduce((sum, d) => sum + d.text, 0),
    image: interactions.reduce((sum, d) => sum + d.image, 0),
    sticker: interactions.reduce((sum, d) => sum + d.sticker, 0),
    other: interactions.reduce((sum, d) => sum + d.other, 0),
  };
  const INTERACTION_TYPE_LABELS: Record<keyof typeof interactionByType, string> = {
    text: 'Tin nhắn văn bản',
    image: 'Hình ảnh',
    sticker: 'Sticker',
    other: 'Khác (video/file/vị trí...)',
  };
  const INTERACTION_TYPE_COLORS: Record<keyof typeof interactionByType, string> = {
    text: '#6366f1',
    image: '#10b981',
    sticker: '#f59e0b',
    other: '#64748b',
  };

  // Xu hướng tương tác 7 ngày gần nhất (khớp đúng khoá ngày dailyInteractions dùng giờ VN)
  const interactionByDate = new Map(interactions.map((d) => [d.date, d.total]));
  const interactionDayLabels: string[] = [];
  const interactionTrendCounts: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const ms = now - i * 86400000;
    const key = getVnDateKey(ms);
    const d = new Date(ms);
    interactionDayLabels.push(`${d.getDate()}/${d.getMonth() + 1}`);
    interactionTrendCounts.push(interactionByDate.get(key) || 0);
  }

  // Top người tương tác nhiều nhất
  const topInteractors = users
    .filter((u) => u.interactionTotal > 0)
    .sort((a, b) => b.interactionTotal - a.interactionTotal)
    .slice(0, 10);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Báo cáo & Thống kê</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">Số liệu thực tế từ hệ thống công việc.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Tổng công việc" value={String(totalTasks)} />
        <StatTile label="Hoàn thành đúng hạn" value={onTimeRate !== null ? `${onTimeRate}%` : 'Chưa có dữ liệu'} accent="emerald" />
        <StatTile label="Đang quá hạn" value={String(overdueCount)} accent="red" />
        <StatTile label="Thời gian xử lý TB" value={avgTurnaroundDays !== null ? `${avgTurnaroundDays.toFixed(1)} ngày` : 'Chưa có dữ liệu'} />
      </div>

      {totalTasks === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--color-bg-card)] flex items-center justify-center">
            <span className="text-3xl">📊</span>
          </div>
          <p className="text-[var(--color-text-secondary)]">Chưa có công việc nào để thống kê.</p>
        </div>
      ) : (
        <>
          <div className="glass rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">Phân bố trạng thái</h2>
            <div className="space-y-3">
              {STATUS_ORDER.map((status) => (
                <StatusBar key={status} label={status} count={statusCounts[status]} total={totalTasks} color={STATUS_COLORS[status]} />
              ))}
            </div>
          </div>

          <div className="glass rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">Công việc mới tạo (7 ngày gần nhất)</h2>
            <TrendChart labels={dayLabels} counts={trendCounts} />
          </div>

          <div className="glass rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-[var(--color-border)]">
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Hiệu suất theo người nhận việc</h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Top 10 theo tổng số việc được giao</p>
            </div>
            {assigneeStats.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--color-text-secondary)]">Chưa có dữ liệu.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      <th className="text-left p-4 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Người nhận</th>
                      <th className="text-right p-4 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Tổng việc</th>
                      <th className="text-right p-4 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Hoàn thành</th>
                      <th className="text-right p-4 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Quá hạn</th>
                      <th className="text-right p-4 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Đúng hạn</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {assigneeStats.map((a) => (
                      <tr key={a.uid} className="hover:bg-[var(--color-bg-card-hover)] transition-colors">
                        <td className="p-4 font-medium text-[var(--color-text-primary)]">{a.name}</td>
                        <td className="p-4 text-right text-[var(--color-text-secondary)]">{a.total}</td>
                        <td className="p-4 text-right text-emerald-400">{a.completed}</td>
                        <td className="p-4 text-right text-red-400">{a.overdue || '-'}</td>
                        <td className="p-4 text-right text-[var(--color-text-secondary)]">{a.onTimeRate !== null ? `${a.onTimeRate}%` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="glass rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-[var(--color-border)]">
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Công việc đang quá hạn</h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Trễ nhiều nhất lên đầu</p>
            </div>
            {overdueList.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--color-text-secondary)]">🎉 Không có công việc nào quá hạn.</div>
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {overdueList.map((t) => (
                  <div key={t.id} className="px-5 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{t.name}</p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">👤 {t.assigneeNames || 'Chưa rõ'}</p>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium border bg-red-500/10 text-red-400 border-red-500/20 flex-shrink-0">
                      Trễ {t.daysOverdue !== null ? `${t.daysOverdue} ngày` : '?'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <div>
        <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Thống kê tương tác</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">Số lượt nhắn tin/hình ảnh/sticker bot ghi nhận được, tính từ khi bật tính năng này.</p>
      </div>

      {interactionTotal === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--color-bg-card)] flex items-center justify-center">
            <span className="text-3xl">💬</span>
          </div>
          <p className="text-[var(--color-text-secondary)]">Chưa có dữ liệu tương tác nào được ghi nhận.</p>
        </div>
      ) : (
        <>
          <StatTile label="Tổng lượt tương tác" value={String(interactionTotal)} />

          <div className="glass rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">Phân loại tương tác</h2>
            <div className="space-y-3">
              {(Object.keys(interactionByType) as Array<keyof typeof interactionByType>).map((type) => (
                <StatusBar
                  key={type}
                  label={INTERACTION_TYPE_LABELS[type]}
                  count={interactionByType[type]}
                  total={interactionTotal}
                  color={INTERACTION_TYPE_COLORS[type]}
                />
              ))}
            </div>
          </div>

          <div className="glass rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">Xu hướng tương tác (7 ngày gần nhất)</h2>
            <TrendChart labels={interactionDayLabels} counts={interactionTrendCounts} />
          </div>

          <div className="glass rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-[var(--color-border)]">
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Người tương tác nhiều nhất</h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Top 10 theo tổng số lượt nhắn tin với bot</p>
            </div>
            {topInteractors.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--color-text-secondary)]">Chưa có dữ liệu.</div>
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {topInteractors.map((u) => (
                  <div key={u.lineUserId} className="px-5 py-3 flex items-center justify-between gap-4">
                    <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{u.name}</p>
                    <span className="text-sm text-[var(--color-text-secondary)] flex-shrink-0">{u.interactionTotal} lượt</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
