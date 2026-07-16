'use client';

import { useEffect, useState } from 'react';
import { db, storage } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface Task {
  id: string;
  name: string;
  description: string;
  status: string;
  assigneeName: string;
  assignees?: string[];
  assigneeId?: string;
  groupName: string;
  groupId: string;
  groupIds?: string[];
  priority: string;
  deadline: string;
  repeat: string;
  createdAt?: Date;
}

interface UserData { id: string; name: string; lineUserId: string; }
interface GroupData { id: string; name: string; lineGroupId: string; }

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
  const [usersList, setUsersList] = useState<UserData[]>([]);
  const [groupsList, setGroupsList] = useState<GroupData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [newUrlInput, setNewUrlInput] = useState('');

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploadingImage(true);
    try {
      const imgbbKey = process.env.NEXT_PUBLIC_IMGBB_API_KEY;
      if (!imgbbKey) {
        alert('Vui lòng cấu hình NEXT_PUBLIC_IMGBB_API_KEY trong file .env.local');
        setUploadingImage(false);
        return;
      }
      
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = error => reject(error);
      });

      const formData = new FormData();
      formData.append('image', base64);

      const response = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbKey}`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        setForm(prev => ({ ...prev, attachmentUrl: data.data.url }));
      } else {
        throw new Error(data.error?.message || 'Upload failed');
      }
    } catch (error) {
      console.error("Lỗi upload ảnh:", error);
      alert("Không thể tải ảnh lên. Vui lòng thử lại.");
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  }

  const getDefaultDeadline = () => {
    const d = new Date();
    d.setHours(d.getHours() + 2);
    // Format to YYYY-MM-DDTHH:mm
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
  };

  const defaultForm = {
    name: '', description: '', status: 'Chờ gửi', assigneeName: '', assigneeId: '',
    assignees: [] as string[],
    groupName: '', groupId: '', groupIds: [] as string[], priority: 'Bình thường', deadline: getDefaultDeadline(), repeat: 'Không',
    taskType: 'Vận hành',
    quickReminder: 'Gửi ngay',
    acceptanceType: 'Bấm hoàn tất',
    reminderFrequency: '15',
    creatorId: 'U5bff120f01066eefca60fd0c8ea3537c', // Mặc định là Admin
    attachmentUrl: '',
    notes: '',
    intervalHours: '1',
    repeatDays: [] as string[],
    customRepeat: '',
  };
  const [form, setForm] = useState(defaultForm);

  useEffect(() => {
    Promise.all([loadTasks(), loadUsersAndGroups()]).then(() => setLoading(false));
  }, []);

  useEffect(() => {
    // Tự động phân giải ID chưa biết
    if (tasks.length > 0 && (usersList.length > 0 || groupsList.length > 0) && !loading) {
      const unknownUserIds = new Set<string>();
      const unknownGroupIds = new Set<string>();
      tasks.forEach(t => {
        if (t.assigneeId && !usersList.find(u => u.lineUserId === t.assigneeId)) {
          unknownUserIds.add(t.assigneeId);
        }
        if (t.groupId && t.groupId !== 'personal' && !groupsList.find(g => g.lineGroupId === t.groupId)) {
          unknownGroupIds.add(t.groupId);
        }
      });
      unknownUserIds.forEach(id => resolveMissingProfile(id, 'user'));
      unknownGroupIds.forEach(id => resolveMissingProfile(id, 'group'));
    }
  }, [tasks, usersList, groupsList, loading]);

  async function resolveMissingProfile(id: string, type: 'user'|'group') {
    if (id === 'personal' || !id) return;
    try {
      const res = await fetch(`/api/line-profile?${type}Id=${id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.name) {
          // Save to Firestore so we don't have to fetch again
          const collectionName = type === 'user' ? 'users' : 'groups';
          const payload = type === 'user' 
            ? { name: data.name, lineUserId: id, role: 'member', createdAt: serverTimestamp() }
            : { name: data.name, lineGroupId: id, isMuted: false, createdAt: serverTimestamp() };
          
          await addDoc(collection(db, collectionName), payload);
          // Reload lists
          loadUsersAndGroups();
        }
      }
    } catch (e) {
      console.error('Error resolving profile', e);
    }
  }

  async function loadUsersAndGroups() {
    try {
      const uSnap = await getDocs(collection(db, 'users'));
      const uData = uSnap.docs.map(d => ({ id: d.id, ...d.data() } as UserData));
      const uniqueUsers = Array.from(new Map(uData.map(u => [u.lineUserId, u])).values());
      setUsersList(uniqueUsers);

      const gSnap = await getDocs(collection(db, 'groups'));
      const gData = gSnap.docs.map(d => ({ id: d.id, ...d.data() } as GroupData));
      const uniqueGroups = Array.from(new Map(gData.map(g => [g.lineGroupId, g])).values());
      setGroupsList(uniqueGroups);
    } catch (err) {
      console.error('Error loading users/groups', err);
    }
  }

  async function loadTasks() {
    try {
      const snap = await getDocs(collection(db, 'tasks'));
      const data = snap.docs.map((d) => {
        const raw = d.data();
        let name = raw.assigneeName || '';
        let aId = raw.assigneeId || '';
        if (raw.assignees && Array.isArray(raw.assignees) && raw.assignees.length > 0) {
          aId = raw.assignees[0];
        }
        return {
          id: d.id,
          name: raw.name || '',
          description: raw.description || '',
          status: raw.status || 'Chờ gửi',
          assigneeName: name,
          assigneeId: aId,
          assignees: raw.assignees || [],
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
    }
  }

  function openCreateModal() {
    setEditingId(null);
    setForm(defaultForm);
    setNewUrlInput('');
    setShowModal(true);
  }

  function openEditModal(task: Task) {
    setEditingId(task.id);
    setForm({
      name: task.name,
      description: task.description,
      status: task.status,
      assigneeName: task.assigneeName,
      assigneeId: task.assigneeId || '',
      assignees: task.assignees || (task.assigneeId ? [task.assigneeId] : []),
      groupName: task.groupName,
      groupId: task.groupId,
      groupIds: task.groupIds || (task.groupId && task.groupId !== 'personal' ? [task.groupId] : []),
      priority: task.priority,
      deadline: task.deadline,
      repeat: task.repeat,
      taskType: (task as any).taskType || 'Vận hành',
      quickReminder: (task as any).quickReminder || 'Gửi ngay',
      acceptanceType: (task as any).acceptanceType || 'Bấm hoàn tất',
      reminderFrequency: (task as any).reminderFrequency || '15',
      creatorId: (task as any).creatorId || 'U5bff120f01066eefca60fd0c8ea3537c',
      attachmentUrl: (task as any).attachmentUrl || '',
      notes: (task as any).notes || '',
      intervalHours: (task as any).intervalHours || '1',
      repeatDays: (task as any).repeatDays || [],
      customRepeat: (task as any).customRepeat || '',
    });
    setNewUrlInput('');
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      let sendAt = Date.now();
      if (form.quickReminder === '15 Phút') sendAt += 15 * 60000;
      else if (form.quickReminder === '30 Phút') sendAt += 30 * 60000;
      else if (form.quickReminder === '1 Giờ') sendAt += 60 * 60000;
      else if (form.quickReminder === 'Mai 08:00') {
        const t = new Date();
        t.setDate(t.getDate() + 1);
        t.setHours(8, 0, 0, 0);
        sendAt = t.getTime();
      } else if (form.quickReminder !== 'Gửi ngay' && form.quickReminder !== 'Tùy chọn') {
        const parsed = new Date(form.quickReminder).getTime();
        if (!isNaN(parsed)) sendAt = parsed;
      }

      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        status: form.status,
        assigneeName: form.assignees.map(id => usersList.find(u => u.lineUserId === id)?.name || id).join(', '),
        assigneeId: form.assignees[0] || '',
        assignees: form.assignees,
        groupName: form.groupName.trim(),
        groupId: form.groupId.trim(),
        groupIds: form.groupIds,
        priority: form.priority,
        deadline: form.deadline || '',
        repeat: form.repeat,
        taskType: form.taskType,
        quickReminder: form.quickReminder,
        acceptanceType: form.acceptanceType,
        reminderFrequency: form.reminderFrequency,
        attachmentUrl: form.attachmentUrl,
        notes: form.notes,
        intervalHours: (form as any).intervalHours || '1',
        repeatDays: (form as any).repeatDays || [],
        customRepeat: (form as any).customRepeat || '',
        sendAt,
        creatorId: form.creatorId || 'U5bff120f01066eefca60fd0c8ea3537c',
        updatedAt: serverTimestamp(),
      };

      let newTaskId = editingId;
      if (editingId) {
        await updateDoc(doc(db, 'tasks', editingId), payload);
      } else {
        const docRef = await addDoc(collection(db, 'tasks'), { ...payload, createdAt: serverTimestamp() });
        newTaskId = docRef.id;
      }
      
      // Auto-send task if 'Gửi ngay'
      if (form.quickReminder === 'Gửi ngay' && (form.assignees.length > 0 || form.groupId.trim())) {
        try {
          await fetch('/api/notify-task', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskId: newTaskId,
              assignees: form.assignees,
              assigneeId: form.assignees[0] || '',
              groupId: form.groupId.trim(),
              groupIds: form.groupIds,
              taskName: form.name.trim(),
              taskDescription: form.description.trim(),
              creatorId: form.creatorId || 'U5bff120f01066eefca60fd0c8ea3537c'
            })
          });
          // Update status to "Đang làm" after sending
          if (newTaskId) {
            await updateDoc(doc(db, 'tasks', newTaskId), { status: 'Đang làm' });
          }
        } catch (err) {
          console.error('Failed to notify task', err);
        }
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
    <>
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
                      <p className="text-[var(--color-text-secondary)]">
                        {task.assigneeName || (task.assigneeId ? usersList.find(u => u.lineUserId === task.assigneeId)?.name || task.assigneeId.slice(0, 8) : 'N/A')}
                      </p>
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
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 sm:p-6 overflow-y-auto">
          <div className="glass rounded-2xl w-full max-w-2xl p-6 sm:p-8 animate-fade-in-up my-4 sm:my-8 relative">
            <h3 className="text-lg font-bold text-[var(--color-text-primary)] mb-5">
              {editingId ? 'Chỉnh sửa công việc' : 'Tạo công việc mới'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Tên công việc *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tên sự kiện / công việc" className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Mô tả chi tiết</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Nhập ghi chú hoặc mô tả chi tiết..." className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Nhóm (Có thể chọn nhiều)</label>
                <div className="w-full max-h-40 overflow-y-auto px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] focus-within:border-[var(--color-border-active)] transition-colors">
                  {groupsList.map(g => (
                    <label key={g.id} className="flex items-center space-x-2 py-1 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="rounded border-[var(--color-border)] text-indigo-600 focus:ring-indigo-500 bg-[var(--color-bg-secondary)]"
                        checked={form.groupIds.includes(g.lineGroupId) || form.groupId === g.lineGroupId}
                        onChange={(e) => {
                          let newGroupIds = [...form.groupIds];
                          if (form.groupId && form.groupId !== 'personal' && !newGroupIds.includes(form.groupId)) {
                            newGroupIds.push(form.groupId);
                          }
                          if (e.target.checked) {
                            if (!newGroupIds.includes(g.lineGroupId)) newGroupIds.push(g.lineGroupId);
                          } else {
                            newGroupIds = newGroupIds.filter(id => id !== g.lineGroupId);
                          }
                          setForm({ ...form, groupIds: newGroupIds, groupId: '' });
                        }}
                      />
                      <span>{g.name}</span>
                    </label>
                  ))}
                  {form.groupIds.filter(id => !groupsList.find(g => g.lineGroupId === id)).map(id => (
                    <label key={id} className="flex items-center space-x-2 py-1 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="rounded border-[var(--color-border)] text-indigo-600 focus:ring-indigo-500 bg-[var(--color-bg-secondary)]"
                        checked={true}
                        onChange={(e) => {
                          setForm({ ...form, groupIds: form.groupIds.filter(x => x !== id) });
                        }}
                      />
                      <span>{id}</span>
                    </label>
                  ))}
                  {form.groupId && form.groupId !== 'personal' && !groupsList.find(g => g.lineGroupId === form.groupId) && !form.groupIds.includes(form.groupId) && (
                    <label className="flex items-center space-x-2 py-1 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="rounded border-[var(--color-border)] text-indigo-600 focus:ring-indigo-500 bg-[var(--color-bg-secondary)]"
                        checked={true}
                        onChange={(e) => {
                          setForm({ ...form, groupId: '' });
                        }}
                      />
                      <span>{form.groupName || form.groupId}</span>
                    </label>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Người nhận (Có thể chọn nhiều)</label>
                <div className="w-full max-h-40 overflow-y-auto px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] focus-within:border-[var(--color-border-active)] transition-colors">
                  {usersList.map(u => (
                    <label key={u.id} className="flex items-center space-x-2 py-1 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="rounded border-[var(--color-border)] text-indigo-600 focus:ring-indigo-500 bg-[var(--color-bg-secondary)]"
                        checked={form.assignees.includes(u.lineUserId)}
                        onChange={(e) => {
                          let newAssignees = [...form.assignees];
                          if (e.target.checked) {
                            newAssignees.push(u.lineUserId);
                          } else {
                            newAssignees = newAssignees.filter(id => id !== u.lineUserId);
                          }
                          setForm({ ...form, assignees: newAssignees });
                        }}
                      />
                      <span>{u.name}</span>
                    </label>
                  ))}
                  {form.assignees.filter(id => !usersList.find(u => u.lineUserId === id)).map(id => (
                    <label key={id} className="flex items-center space-x-2 py-1 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="rounded border-[var(--color-border)] text-indigo-600 focus:ring-indigo-500 bg-[var(--color-bg-secondary)]"
                        checked={true}
                        onChange={(e) => {
                          setForm({ ...form, assignees: form.assignees.filter(x => x !== id) });
                        }}
                      />
                      <span>{id}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Người giao việc</label>
                <select 
                  value={(form as any).creatorId || 'U5bff120f01066eefca60fd0c8ea3537c'} 
                  onChange={(e) => setForm({ ...form, creatorId: e.target.value })} 
                  className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors"
                >
                  <option value="U5bff120f01066eefca60fd0c8ea3537c">Admin (BOT)</option>
                  {usersList.map(u => (
                    <option key={u.id} value={u.lineUserId}>{u.name}</option>
                  ))}
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
                <input type="datetime-local" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors [color-scheme:dark]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Thời gian gửi</label>
                <div className="flex gap-2">
                  <select 
                    value={['Gửi ngay', '15 Phút', '30 Phút', '1 Giờ', 'Mai 08:00'].includes(form.quickReminder) ? form.quickReminder : 'Tùy chọn'} 
                    onChange={(e) => {
                      if (e.target.value === 'Tùy chọn') {
                        setForm({ ...form, quickReminder: getDefaultDeadline() });
                      } else {
                        setForm({ ...form, quickReminder: e.target.value });
                      }
                    }} 
                    className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors"
                  >
                    <option value="Gửi ngay">Gửi ngay</option>
                    <option value="15 Phút">15 Phút</option>
                    <option value="30 Phút">30 Phút</option>
                    <option value="1 Giờ">1 Giờ</option>
                    <option value="Mai 08:00">Mai 08:00</option>
                    <option value="Tùy chọn">Tùy chọn</option>
                  </select>
                  {!['Gửi ngay', '15 Phút', '30 Phút', '1 Giờ', 'Mai 08:00'].includes(form.quickReminder) && (
                    <input 
                      type="datetime-local" 
                      value={form.quickReminder} 
                      onChange={(e) => setForm({ ...form, quickReminder: e.target.value })} 
                      className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors [color-scheme:dark]" 
                    />
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Tần suất nhắc (phút)</label>
                <input type="text" value={form.reminderFrequency} onChange={(e) => setForm({ ...form, reminderFrequency: e.target.value })} placeholder="15" className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Lặp lại</label>
                <select value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value })} className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors mb-3">
                  <option value="Không">Không</option>
                  <option value="Hàng giờ">Hàng giờ</option>
                  <option value="Hàng ngày">Hàng ngày</option>
                  <option value="Hàng tuần">Hàng tuần</option>
                  <option value="Hàng tháng">Hàng tháng</option>
                  <option value="Trước ngày cuối tháng 2 ngày">Trước ngày cuối tháng 2 ngày</option>
                  <option value="Trước ngày đầu tháng 1 ngày">Trước ngày đầu tháng 1 ngày</option>
                  <option value="Ngày cuối tháng">Ngày cuối tháng</option>
                  <option value="Tuỳ chọn">Tuỳ chọn</option>
                </select>

                {form.repeat === 'Hàng giờ' && (
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Lặp lại sau mấy giờ</label>
                    <input type="number" min="1" value={(form as any).intervalHours || '1'} onChange={(e) => setForm({ ...form, intervalHours: e.target.value })} className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors" />
                  </div>
                )}

                {form.repeat === 'Hàng ngày' && (
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Chọn các ngày trong tuần</label>
                    <div className="flex flex-wrap gap-2">
                      {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(day => (
                        <label key={day} className="flex items-center gap-2 cursor-pointer text-sm text-[var(--color-text-primary)] bg-[var(--color-bg-primary)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg hover:border-[var(--color-text-muted)] transition-colors">
                          <input 
                            type="checkbox" 
                            checked={((form as any).repeatDays || []).includes(day)}
                            onChange={(e) => {
                              const currentDays = (form as any).repeatDays || [];
                              if (e.target.checked) {
                                setForm({ ...form, repeatDays: [...currentDays, day] });
                              } else {
                                setForm({ ...form, repeatDays: currentDays.filter((d: string) => d !== day) });
                              }
                            }}
                            className="w-4 h-4 text-indigo-600 rounded bg-[var(--color-bg-primary)] border-[var(--color-border)] focus:ring-indigo-500 focus:ring-offset-gray-900"
                          />
                          {day}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                
                {form.repeat === 'Tuỳ chọn' && (
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Chu kỳ tuỳ chọn</label>
                    <input type="text" value={(form as any).customRepeat || ''} onChange={(e) => setForm({ ...form, customRepeat: e.target.value })} placeholder="VD: Mỗi 3 ngày" className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors" />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Nghiệm thu</label>
                <select value={form.acceptanceType} onChange={(e) => setForm({ ...form, acceptanceType: e.target.value })} className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors">
                  <option value="Bấm hoàn tất">Bấm hoàn tất</option>
                  <option value="Gửi ảnh chụp">Gửi ảnh chụp</option>
                  <option value="Không cần">Không cần</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Ảnh đính kèm (Tuỳ chọn)</label>
                
                {form.attachmentUrl && (
                  <div className="relative group rounded-xl overflow-hidden border border-[var(--color-border)] mb-3 w-48">
                    <img src={form.attachmentUrl} alt="Preview" className="w-full h-32 object-cover" />
                    <button
                      onClick={() => setForm({...form, attachmentUrl: ''})}
                      className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                )}

                {!form.attachmentUrl && (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={newUrlInput}
                        onChange={(e) => setNewUrlInput(e.target.value)}
                        placeholder="Nhập link ảnh (https://...)"
                        className="flex-1 px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors"
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setForm({...form, attachmentUrl: newUrlInput.trim()}); setNewUrlInput(''); } }}
                      />
                      <button
                        onClick={() => { setForm({...form, attachmentUrl: newUrlInput.trim()}); setNewUrlInput(''); }}
                        disabled={!newUrlInput.trim()}
                        className="px-4 py-2.5 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] disabled:opacity-50"
                      >
                        Thêm
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className={`cursor-pointer inline-flex items-center gap-2 px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-border)] hover:border-[var(--color-text-muted)] rounded-xl text-xs font-medium text-[var(--color-text-secondary)] transition-colors ${uploadingImage ? 'opacity-50 pointer-events-none' : ''}`}>
                        {uploadingImage ? (
                          <>
                            <div className="w-3 h-3 border-2 border-[var(--color-text-secondary)] border-t-transparent rounded-full animate-spin" />
                            Đang tải lên...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                            Tải ảnh từ máy tính
                          </>
                        )}
                        <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={uploadingImage} />
                      </label>
                    </div>
                  </div>
                )}
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
    </>
  );
}
