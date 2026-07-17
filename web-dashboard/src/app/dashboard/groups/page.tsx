'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';

interface Group {
  id: string;
  name: string;
  lineGroupId: string;
  isMuted: boolean;
  muteUntil?: Date;
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', lineGroupId: '', isMuted: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadGroups(); }, []);

  async function loadGroups() {
    try {
      const snap = await getDocs(collection(db, 'groups'));
      const rawGroups = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Group));
      const uniqueGroups = Array.from(new Map(rawGroups.map(g => [g.lineGroupId, g])).values());
      setGroups(uniqueGroups);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), lineGroupId: form.lineGroupId.trim(), isMuted: form.isMuted, updatedAt: serverTimestamp() };
      if (editingId) {
        await updateDoc(doc(db, 'groups', editingId), payload);
      } else {
        await addDoc(collection(db, 'groups'), { ...payload, createdAt: serverTimestamp() });
      }
      setShowModal(false);
      loadGroups();
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Xóa nhóm này?')) return;
    await deleteDoc(doc(db, 'groups', id));
    setGroups((prev) => prev.filter((m) => m.id !== id));
  }

  if (loading) return <div className="space-y-4"><div className="skeleton h-12 w-64 rounded-xl" /><div className="skeleton h-96 rounded-2xl" /></div>;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Nhóm LINE</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">{groups.length} nhóm Bot đang hoạt động</p>
        </div>
        <button onClick={() => { setEditingId(null); setForm({ name: '', lineGroupId: '', isMuted: false }); setShowModal(true); }} className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-semibold rounded-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] glow-accent">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Thêm nhóm thủ công
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {groups.map((g) => (
          <div key={g.id} className="glass rounded-2xl p-5 hover:border-[var(--color-border-active)]/30 transition-all duration-300 group">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--color-bg-card)] flex items-center justify-center text-xl flex-shrink-0">
                👥
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[var(--color-text-primary)] truncate">{g.name}</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">ID: {g.lineGroupId || 'N/A'}</p>
                {g.isMuted ? (
                  <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                    Đang im lặng
                  </span>
                ) : (
                  <span className="inline-flex items-center mt-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Bật thông báo
                  </span>
                )}
              </div>
              <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                <button onClick={() => { setEditingId(g.id); setForm({ name: g.name, lineGroupId: g.lineGroupId, isMuted: g.isMuted }); setShowModal(true); }} className="p-1.5 text-[var(--color-text-muted)] hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                <button onClick={() => handleDelete(g.id)} className="p-1.5 text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <div className="md:col-span-3 glass rounded-2xl p-12 text-center">
            <p className="text-[var(--color-text-secondary)]">Chưa có nhóm nào. Nhóm sẽ xuất hiện khi có người mời Bot vào.</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass rounded-2xl w-full max-w-md p-6 animate-fade-in-up">
            <h3 className="text-lg font-bold text-[var(--color-text-primary)] mb-5">{editingId ? 'Cấu hình nhóm' : 'Thêm nhóm'}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Tên nhóm *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">LINE Group ID</label>
                <input type="text" value={form.lineGroupId} onChange={(e) => setForm({ ...form, lineGroupId: e.target.value })} className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors" />
              </div>
              <label className="flex items-center gap-3 p-4 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl cursor-pointer hover:border-[var(--color-border-active)] transition-colors">
                <input type="checkbox" checked={form.isMuted} onChange={(e) => setForm({ ...form, isMuted: e.target.checked })} className="w-5 h-5 rounded border-[var(--color-border)] text-indigo-500 focus:ring-indigo-500 bg-transparent" />
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">Tắt thông báo Bot (Im lặng)</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Bot sẽ không gửi tin nhắn tự động vào nhóm này</p>
                </div>
              </label>
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
