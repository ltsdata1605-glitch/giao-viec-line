'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';

interface Task {
  id: string;
  name: string;
  description: string;
  status: string;
  assigneeName: string;
  assigneeId: string;
  groupName: string;
  groupId: string;
  priority: string;
  deadline: string;
  repeat: string;
  createdAt?: Date;
}

const STATUS_LIST = ['Chờ gửi', 'Đang làm', 'Cần hỗ trợ', 'Đã gửi', 'Quá hạn', 'Đã hủy'];
const PRIORITY_LIST = ['Bình thường', 'Quan trọng', 'GẤP'];

const statusStyles: Record<string, string> = {
  'Chờ gửi': 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  'Đang làm': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Đã gửi': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Quá hạn': 'bg-red-500/10 text-red-400 border-red-500/20',
  'Đã hủy': 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  'Cần hỗ trợ': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
};

const priorityStyles: Record<string, string> = {
  'Bình thường': 'text-[var(--color-text-muted)]',
  'Quan trọng': 'text-amber-400',
  'GẤP': 'text-red-400 font-bold',
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);

  const defaultForm = {
    name: '', description: '', status: 'Chờ gửi', assigneeName: '', assigneeId: '',
    groupName: '', groupId: '', priority: 'Bình thường', deadline: '', repeat: 'Không',
  };
  const [form, setForm] = useState(defaultForm);

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    try {
      const snap = await getDocs(collection(db, 'tasks'));
      const data = snap.docs.map((d) => {
        const raw = d.data();
        return {
          id: d.id,
          name: raw.name || '',
          description: raw.description || '',
          status: raw.status || 'Chờ gửi',
          assigneeName: raw.assigneeName || '',
          assigneeId: raw.assigneeId || '',
          groupName: raw.groupName || '',
          groupId: raw.groupId || '',
          priority: raw.priority || 'Bình thường',
          deadline: raw.deadline instanceof Timestamp
            ? raw.deadline.toDate().toISOString().slice(0, 16)
            : (raw.deadline || ''),
          repeat: raw.repeat || 'Không',
        };
      }) as Task[];
      setTasks(data);
    } catch (err) {
      console.error('Error loading tasks:', err);
    } finally {
      setLoading(false);
    }
  }

  function openCreateModal() {
    setEditingId(null);
    setForm(defaultForm);
    setShowModal(true);
  }

  function openEditModal(task: Task) {
    setEditingId(task.id);
    setForm({
      name: task.name,
      description: task.description,
      status: task.status,
      assigneeName: task.assigneeName,
      assigneeId: task.assigneeId,
      groupName: task.groupName,
      groupId: task.groupId,
      priority: task.priority,
      deadline: task.deadline,
      repeat: task.repeat,
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        status: form.status,
        assigneeName: form.assigneeName.trim(),
        assigneeId: form.assigneeId.trim(),
        groupName: form.groupName.trim(),
        groupId: form.groupId.trim(),
        priority: form.priority,
        deadline: form.deadline || '',
        repeat: form.repeat,
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(doc(db, 'tasks', editingId), payload);
      } else {
        await addDoc(collection(db, 'tasks'), { ...payload, createdAt: serverTimestamp() });
      }
      setShowModal(false);
      loadTasks();
    } catch (err) {
      console.error('Error saving task:', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Bạn có chắc muốn xóa công việc này?')) return;
    try {
      await deleteDoc(doc(db, 'tasks', id));
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      console.error('Error deleting task:', err);
    }
  }

  const filteredTasks = tasks.filter((t) => {
    const matchSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.assigneeName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = filterStatus === 'all' || t.status === filterStatus;
    return matchSearch && matchStatus;
  });

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-12 w-64 rounded-xl" />
        <div className="skeleton h-96 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Quản lý Công việc</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {tasks.length} công việc trong hệ thống
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-semibold rounded-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] glow-accent"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Tạo công việc
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Tìm kiếm công việc..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-2 text-xs font-medium rounded-xl border transition-colors ${filterStatus === 'all' ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent-hover)] border-[var(--color-accent)]/30' : 'text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-[var(--color-text-muted)]'}`}
          >
            Tất cả
          </button>
          {STATUS_LIST.map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-2 text-xs font-medium rounded-xl border transition-colors ${filterStatus === s ? statusStyles[s] : 'text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-[var(--color-text-muted)]'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Tasks table */}
      <div className="glass rounded-2xl overflow-hidden">
        {filteredTasks.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--color-bg-card)] flex items-center justify-center">
              <svg className="w-8 h-8 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-[var(--color-text-secondary)]">Không tìm thấy công việc</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="text-left p-4 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Tên công việc</th>
                  <th className="text-left p-4 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider hidden md:table-cell">Người nhận</th>
                  <th className="text-left p-4 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Trạng thái</th>
                  <th className="text-left p-4 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider hidden lg:table-cell">Ưu tiên</th>
                  <th className="text-left p-4 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider hidden lg:table-cell">Hạn chót</th>
                  <th className="text-right p-4 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filteredTasks.map((task) => (
                  <tr key={task.id} className="hover:bg-[var(--color-bg-card-hover)] transition-colors">
                    <td className="p-4">
                      <p className="font-medium text-[var(--color-text-primary)]">{task.name}</p>
                      {task.groupName && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">📍 {task.groupName}</p>}
                    </td>
                    <td className="p-4 hidden md:table-cell">
                      <p className="text-[var(--color-text-secondary)]">{task.assigneeName || 'N/A'}</p>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium border ${statusStyles[task.status] || 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
                        {task.status}
                      </span>
                    </td>
                    <td className="p-4 hidden lg:table-cell">
                      <span className={`text-xs ${priorityStyles[task.priority] || ''}`}>
                        {task.priority === 'GẤP' ? '🔴 GẤP' : task.priority === 'Quan trọng' ? '🟡 Quan trọng' : '🟢 Bình thường'}
                      </span>
                    </td>
                    <td className="p-4 hidden lg:table-cell text-[var(--color-text-secondary)] text-xs">
                      {task.deadline ? new Date(task.deadline).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEditModal(task)} className="p-1.5 text-[var(--color-text-muted)] hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors" title="Sửa">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button onClick={() => handleDelete(task.id)} className="p-1.5 text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" title="Xóa">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass rounded-2xl w-full max-w-2xl p-6 animate-fade-in-up max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-[var(--color-text-primary)] mb-5">
              {editingId ? 'Chỉnh sửa công việc' : 'Tạo công việc mới'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Tên công việc *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tên sự kiện / công việc" className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Mô tả</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Người nhận</label>
                <input type="text" value={form.assigneeName} onChange={(e) => setForm({ ...form, assigneeName: e.target.value })} placeholder="Tên nhân viên" className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Nhóm</label>
                <input type="text" value={form.groupName} onChange={(e) => setForm({ ...form, groupName: e.target.value })} placeholder="Tên nhóm" className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Trạng thái</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors">
                  {STATUS_LIST.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Mức ưu tiên</label>
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors">
                  {PRIORITY_LIST.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Hạn chót (Deadline)</label>
                <input type="datetime-local" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Lặp lại</label>
                <select value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value })} className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors">
                  <option value="Không">Không</option>
                  <option value="Hàng ngày">Hàng ngày</option>
                  <option value="Hàng tuần">Hàng tuần</option>
                  <option value="Hàng tháng">Hàng tháng</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)] rounded-xl transition-colors">Hủy</button>
              <button onClick={handleSave} disabled={saving || !form.name.trim()} className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? 'Đang lưu...' : editingId ? 'Cập nhật' : 'Tạo mới'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
