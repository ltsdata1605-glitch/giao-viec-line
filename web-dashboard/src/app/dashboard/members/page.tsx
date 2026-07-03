'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';

interface Member {
  id: string;
  name: string;
  lineUserId: string;
  role: string;
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', lineUserId: '', role: 'member' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadMembers(); }, []);

  async function loadMembers() {
    try {
      const snap = await getDocs(collection(db, 'users'));
      const rawMembers = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Member));
      const uniqueMembers = Array.from(new Map(rawMembers.map(m => [m.lineUserId, m])).values());
      setMembers(uniqueMembers);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), lineUserId: form.lineUserId.trim(), role: form.role, updatedAt: serverTimestamp() };
      if (editingId) {
        await updateDoc(doc(db, 'users', editingId), payload);
      } else {
        await addDoc(collection(db, 'users'), { ...payload, createdAt: serverTimestamp() });
      }
      setShowModal(false);
      loadMembers();
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Xóa thành viên này?')) return;
    await deleteDoc(doc(db, 'users', id));
    setMembers((prev) => prev.filter((m) => m.id !== id));
  }

  if (loading) return <div className="space-y-4"><div className="skeleton h-12 w-64 rounded-xl" /><div className="skeleton h-96 rounded-2xl" /></div>;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Thành viên</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">{members.length} thành viên đã đăng ký</p>
        </div>
        <button onClick={() => { setEditingId(null); setForm({ name: '', lineUserId: '', role: 'member' }); setShowModal(true); }} className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-semibold rounded-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] glow-accent">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Thêm thành viên
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {members.map((m) => (
          <div key={m.id} className="glass rounded-2xl p-5 hover:border-[var(--color-border-active)]/30 transition-all duration-300 group">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                {m.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[var(--color-text-primary)] truncate">{m.name}</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">ID: {m.lineUserId || 'N/A'}</p>
                <span className={`inline-flex items-center mt-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${m.role === 'admin' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
                  {m.role || 'member'}
                </span>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => { setEditingId(m.id); setForm({ name: m.name, lineUserId: m.lineUserId, role: m.role || 'member' }); setShowModal(true); }} className="p-1.5 text-[var(--color-text-muted)] hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                <button onClick={() => handleDelete(m.id)} className="p-1.5 text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>
          </div>
        ))}
        {members.length === 0 && (
          <div className="md:col-span-3 glass rounded-2xl p-12 text-center">
            <p className="text-[var(--color-text-secondary)]">Chưa có thành viên nào. Bot sẽ tự thêm khi có người chat.</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass rounded-2xl w-full max-w-md p-6 animate-fade-in-up">
            <h3 className="text-lg font-bold text-[var(--color-text-primary)] mb-5">{editingId ? 'Sửa thành viên' : 'Thêm thành viên'}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Tên *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">LINE User ID</label>
                <input type="text" value={form.lineUserId} onChange={(e) => setForm({ ...form, lineUserId: e.target.value })} className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Vai trò</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors">
                  <option value="member">Thành viên</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] rounded-xl transition-colors">Hủy</button>
              <button onClick={handleSave} disabled={saving || !form.name.trim()} className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50">{saving ? 'Đang lưu...' : 'Lưu'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
