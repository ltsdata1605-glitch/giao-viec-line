'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, getDocs, where, orderBy, limit, Timestamp } from 'firebase/firestore';

interface StatCard {
  label: string;
  value: string;
  change: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<StatCard[]>([]);
  const [recentTasks, setRecentTasks] = useState<Array<{
    id: string;
    name: string;
    status: string;
    assignee: string;
    deadline: string;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    try {
      // Load stats
      const tasksSnap = await getDocs(collection(db, 'tasks'));
      const keywordsSnap = await getDocs(collection(db, 'keywords'));
      const membersSnap = await getDocs(collection(db, 'users'));
      const groupsSnap = await getDocs(collection(db, 'groups'));

      const totalTasks = tasksSnap.size;
      const totalKeywords = keywordsSnap.size;
      const totalMembers = membersSnap.size;
      const totalGroups = groupsSnap.size;

      // Count overdue tasks
      let overdueTasks = 0;
      let completedTasks = 0;
      tasksSnap.forEach((doc) => {
        const data = doc.data();
        if (data.status === 'Quá hạn') overdueTasks++;
        if (data.status === 'Đã gửi') completedTasks++;
      });

      setStats([
        {
          label: 'Tổng công việc',
          value: String(totalTasks),
          change: `${completedTasks} hoàn thành`,
          icon: (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          ),
          color: 'text-blue-400',
          bgColor: 'bg-blue-500/10',
        },
        {
          label: 'Từ khóa Bot',
          value: String(totalKeywords),
          change: 'Đang hoạt động',
          icon: (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
            </svg>
          ),
          color: 'text-purple-400',
          bgColor: 'bg-purple-500/10',
        },
        {
          label: 'Thành viên',
          value: String(totalMembers),
          change: `${totalGroups} nhóm`,
          icon: (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ),
          color: 'text-emerald-400',
          bgColor: 'bg-emerald-500/10',
        },
        {
          label: 'Quá hạn',
          value: String(overdueTasks),
          change: 'Cần xử lý',
          icon: (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
          color: 'text-red-400',
          bgColor: 'bg-red-500/10',
        },
      ]);

      // Load recent tasks
      try {
        const recentQ = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'), limit(5));
        const recentSnap = await getDocs(recentQ);
        const tasks = recentSnap.docs.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            name: d.name || d.tenSuKien || 'Không tên',
            status: d.status || d.trangThai || 'Chờ gửi',
            assignee: d.assigneeName || d.nguoiNhan || 'N/A',
            deadline: d.deadline ? (d.deadline instanceof Timestamp ? d.deadline.toDate().toLocaleDateString('vi-VN') : String(d.deadline)) : 'N/A',
          };
        });
        setRecentTasks(tasks);
      } catch {
        // Index might not exist yet
        setRecentTasks([]);
      }
    } catch (err) {
      console.error('Error loading dashboard:', err);
      // Set default empty stats
      setStats([
        { label: 'Tổng công việc', value: '0', change: 'Chưa có dữ liệu', icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
        { label: 'Từ khóa Bot', value: '0', change: 'Chưa có dữ liệu', icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" /></svg>, color: 'text-purple-400', bgColor: 'bg-purple-500/10' },
        { label: 'Thành viên', value: '0', change: 'Chưa có dữ liệu', icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
        { label: 'Quá hạn', value: '0', change: 'Chưa có dữ liệu', icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>, color: 'text-red-400', bgColor: 'bg-red-500/10' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const statusColor: Record<string, string> = {
    'Chờ gửi': 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    'Đang làm': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    'Đã gửi': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    'Quá hạn': 'bg-red-500/10 text-red-400 border-red-500/20',
    'Đã hủy': 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    'Cần hỗ trợ': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-28 rounded-2xl" />
          ))}
        </div>
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Tổng quan</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Xin chào! Đây là bảng điều khiển của hệ thống Bot LINE.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <div
            key={i}
            className="glass rounded-2xl p-5 hover:border-[var(--color-border-active)]/30 transition-all duration-300 group cursor-default"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`p-2.5 rounded-xl ${stat.bgColor}`}>
                <span className={stat.color}>{stat.icon}</span>
              </div>
            </div>
            <p className="text-2xl font-bold text-[var(--color-text-primary)] mb-1">{stat.value}</p>
            <div className="flex items-center justify-between">
              <p className="text-xs text-[var(--color-text-muted)]">{stat.label}</p>
              <p className={`text-xs ${stat.color}`}>{stat.change}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recent tasks */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Công việc gần đây</h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">5 công việc mới nhất trong hệ thống</p>
        </div>

        {recentTasks.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--color-bg-card)] flex items-center justify-center">
              <svg className="w-8 h-8 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-[var(--color-text-secondary)] mb-1">Chưa có công việc nào</p>
            <p className="text-xs text-[var(--color-text-muted)]">Hãy thêm công việc từ trang &quot;Công việc&quot; hoặc qua Bot LINE</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {recentTasks.map((task) => (
              <div key={task.id} className="px-5 py-4 flex items-center gap-4 hover:bg-[var(--color-bg-card-hover)] transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{task.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">👤 {task.assignee} • ⏰ {task.deadline}</p>
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium border ${statusColor[task.status] || 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
                  {task.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
