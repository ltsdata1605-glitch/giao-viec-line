'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';

interface Keyword {
  id: string;
  keyword: string;
  reply_text: string;
  image_url?: string;
  image_urls?: string[];
  createdAt?: Date;
  assignees?: string[];
  groupId?: string; // legacy support
  groupIds?: string[];
  scheduleEnabled?: boolean;
  quickReminder?: string;
  sendAt?: number;
  repeat?: string;
  repeatDays?: string[];
}

interface UserData {
  id: string;
  lineUserId: string;
  name: string;
}

interface GroupData {
  id: string;
  lineGroupId: string;
  name: string;
}

export default function KeywordsPage() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [usersList, setUsersList] = useState<UserData[]>([]);
  const [groupsList, setGroupsList] = useState<GroupData[]>([]);
  const [form, setForm] = useState({ 
    keyword: '', 
    reply_text: '', 
    image_urls: [] as string[],
    scheduleEnabled: false,
    groupIds: [] as string[],
    assignees: [] as string[],
    quickReminder: 'Gửi ngay',
    repeat: 'Không',
    repeatDays: [] as string[]
  });
  const [newUrlInput, setNewUrlInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (form.image_urls.length + files.length > 4) {
      alert('Bạn chỉ được upload tối đa 4 ảnh để tránh giới hạn của LINE API.');
      return;
    }

    setUploading(true);
    try {
      const newUrls: string[] = [];
      const imgbbKey = process.env.NEXT_PUBLIC_IMGBB_API_KEY;
      if (!imgbbKey) {
        alert('Vui lòng cấu hình NEXT_PUBLIC_IMGBB_API_KEY trong file .env.local');
        setUploading(false);
        return;
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
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
          newUrls.push(data.data.url);
        } else {
          throw new Error(data.error?.message || 'Upload failed');
        }
      }

      setForm(prev => ({ ...prev, image_urls: [...prev.image_urls, ...newUrls] }));
    } catch (err) {
      console.error('Lỗi upload file:', err);
      alert('Không thể tải ảnh lên lúc này. Vui lòng thử lại sau.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function handleAddUrl() {
    if (!newUrlInput.trim()) return;
    if (form.image_urls.length >= 4) {
      alert('Bạn chỉ được upload tối đa 4 ảnh.');
      return;
    }
    setForm(prev => ({ ...prev, image_urls: [...prev.image_urls, newUrlInput.trim()] }));
    setNewUrlInput('');
  }

  function handleRemoveImage(index: number) {
    setForm(prev => ({
      ...prev,
      image_urls: prev.image_urls.filter((_, i) => i !== index)
    }));
  }

  useEffect(() => {
    loadKeywords();
  }, []);

  async function loadKeywords() {
    try {
      const snap = await getDocs(collection(db, 'keywords'));
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Keyword[];
      setKeywords(data);
    } catch (err) {
      console.error('Error loading keywords:', err);
    } finally {
      setLoading(false);
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

  useEffect(() => {
    loadKeywords();
    loadUsersAndGroups();
  }, []);

  function openCreateModal() {
    setEditingId(null);
    setForm({ 
      keyword: '', 
      reply_text: '', 
      image_urls: [],
      scheduleEnabled: false,
      groupIds: [],
      assignees: [],
      quickReminder: 'Gửi ngay',
      repeat: 'Không',
      repeatDays: []
    });
    setNewUrlInput('');
    setShowModal(true);
  }

  function openEditModal(kw: Keyword) {
    setEditingId(kw.id);
    let urls: string[] = [];
    if (kw.image_urls && kw.image_urls.length > 0) {
      urls = [...kw.image_urls];
    } else if (kw.image_url) {
      urls = [kw.image_url];
    }
    setForm({ 
      keyword: kw.keyword, 
      reply_text: kw.reply_text, 
      image_urls: urls,
      scheduleEnabled: kw.scheduleEnabled || false,
      groupIds: kw.groupIds || (kw.groupId ? [kw.groupId] : []),
      assignees: kw.assignees || [],
      quickReminder: kw.quickReminder || 'Gửi ngay',
      repeat: kw.repeat || 'Không',
      repeatDays: kw.repeatDays || []
    });
    setNewUrlInput('');
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.keyword.trim() || !form.reply_text.trim()) return;
    setSaving(true);
    try {
      let sendAt = 0;
      if (form.scheduleEnabled) {
        sendAt = Date.now();
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
      }

      const payload = {
        keyword: form.keyword.trim().toLowerCase(),
        reply_text: form.reply_text.trim(),
        image_urls: form.image_urls,
        image_url: form.image_urls.length > 0 ? form.image_urls[0] : '', // for legacy compatibility
        scheduleEnabled: form.scheduleEnabled,
        groupIds: form.groupIds,
        assignees: form.assignees,
        quickReminder: form.quickReminder,
        sendAt,
        repeat: form.repeat,
        repeatDays: form.repeatDays,
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(doc(db, 'keywords', editingId), payload);
      } else {
        await addDoc(collection(db, 'keywords'), {
          ...payload,
          createdAt: serverTimestamp()
        });
      }
      setShowModal(false);
      loadKeywords();
    } catch (err) {
      console.error('Error saving keyword:', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Bạn có chắc muốn xóa từ khóa này?')) return;
    try {
      await deleteDoc(doc(db, 'keywords', id));
      setKeywords((prev) => prev.filter((k) => k.id !== id));
    } catch (err) {
      console.error('Error deleting keyword:', err);
    }
  }

  const filteredKeywords = keywords.filter(
    (kw) =>
      kw.keyword.toLowerCase().includes(searchTerm.toLowerCase()) ||
      kw.reply_text.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Thư viện Từ khóa</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Quản lý danh sách từ khóa tự động phản hồi của Bot ({keywords.length} từ khóa)
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-semibold rounded-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] glow-accent"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Thêm từ khóa
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Tìm kiếm từ khóa..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors"
        />
      </div>

      {/* Keywords grid */}
      {filteredKeywords.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--color-bg-card)] flex items-center justify-center">
            <svg className="w-8 h-8 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
            </svg>
          </div>
          <p className="text-[var(--color-text-secondary)] mb-1">
            {searchTerm ? 'Không tìm thấy từ khóa phù hợp' : 'Chưa có từ khóa nào'}
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">Nhấn &quot;Thêm từ khóa&quot; để tạo từ khóa đầu tiên</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredKeywords.map((kw) => (
            <div
              key={kw.id}
              className="glass rounded-2xl p-5 hover:border-[var(--color-border-active)]/30 transition-all duration-300 group"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="inline-flex items-center px-3 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 text-xs font-semibold border border-indigo-500/20">
                  #{kw.keyword}
                </span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEditModal(kw)}
                    className="p-1.5 text-[var(--color-text-muted)] hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                    title="Sửa"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(kw.id)}
                    className="p-1.5 text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Xóa"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              <p className="text-sm text-[var(--color-text-primary)] mb-3 line-clamp-3">{kw.reply_text}</p>

              {/* Hiển thị danh sách ảnh */}
              {((kw.image_urls && kw.image_urls.length > 0) || kw.image_url) && (
                <div className={`mt-3 grid gap-2 ${((kw.image_urls?.length || 1) > 1) ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {(kw.image_urls && kw.image_urls.length > 0 ? kw.image_urls : [kw.image_url]).map((url, i) => (
                    url ? (
                      <div key={i} className="rounded-xl overflow-hidden border border-[var(--color-border)] bg-[var(--color-bg-primary)]">
                        <img
                          src={url}
                          alt={kw.keyword}
                          className="w-full h-24 object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    ) : null
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass rounded-2xl w-full max-w-lg p-6 animate-fade-in-up">
            <h3 className="text-lg font-bold text-[var(--color-text-primary)] mb-5">
              {editingId ? 'Chỉnh sửa từ khóa' : 'Thêm từ khóa mới'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Từ khóa *</label>
                <input
                  type="text"
                  value={form.keyword}
                  onChange={(e) => setForm({ ...form, keyword: e.target.value })}
                  placeholder="Ví dụ: khuyến mãi"
                  className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Nội dung phản hồi *</label>
                <textarea
                  value={form.reply_text}
                  onChange={(e) => setForm({ ...form, reply_text: e.target.value })}
                  placeholder="Bot sẽ gửi nội dung này khi người dùng chat từ khóa..."
                  rows={3}
                  className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5 flex justify-between">
                  <span>Hình ảnh đính kèm (tùy chọn)</span>
                  <span>{form.image_urls.length}/4 ảnh</span>
                </label>
                
                {form.image_urls.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    {form.image_urls.map((url, index) => (
                      <div key={index} className="relative group rounded-xl overflow-hidden border border-[var(--color-border)]">
                        <img src={url} alt="Preview" className="w-full h-20 object-cover" />
                        <button
                          onClick={() => handleRemoveImage(index)}
                          className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {form.image_urls.length < 4 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={newUrlInput}
                        onChange={(e) => setNewUrlInput(e.target.value)}
                        placeholder="Nhập link ảnh (https://...)"
                        className="flex-1 px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors"
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddUrl(); } }}
                      />
                      <button
                        onClick={handleAddUrl}
                        disabled={!newUrlInput.trim()}
                        className="px-4 py-2.5 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] disabled:opacity-50"
                      >
                        Thêm
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className={`cursor-pointer inline-flex items-center gap-2 px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-border)] hover:border-[var(--color-text-muted)] rounded-xl text-xs font-medium text-[var(--color-text-secondary)] transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                        {uploading ? (
                          <>
                            <div className="w-3 h-3 border-2 border-[var(--color-text-secondary)] border-t-transparent rounded-full animate-spin" />
                            Đang tải lên...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                            Tải ảnh từ máy tính (chọn nhiều)
                          </>
                        )}
                        <input type="file" accept="image/*" multiple onChange={handleFileUpload} className="hidden" disabled={uploading} />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input 
                  type="checkbox"
                  className="w-5 h-5 rounded border-[var(--color-border)] text-indigo-600 focus:ring-indigo-500 bg-[var(--color-bg-secondary)]"
                  checked={form.scheduleEnabled}
                  onChange={(e) => setForm({ ...form, scheduleEnabled: e.target.checked })}
                />
                <span className="font-medium text-[var(--color-text-primary)]">Bật Hẹn giờ Gửi Từ khoá</span>
              </label>
            </div>

            {form.scheduleEnabled && (
              <div className="space-y-4 pt-4 mt-2">
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Gửi vào Nhóm (Có thể chọn nhiều)</label>
                  <div className="w-full max-h-40 overflow-y-auto px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] focus-within:border-[var(--color-border-active)] transition-colors">
                    {groupsList.map(g => (
                      <label key={g.id} className="flex items-center space-x-2 py-1 cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="rounded border-[var(--color-border)] text-indigo-600 focus:ring-indigo-500 bg-[var(--color-bg-secondary)]"
                          checked={form.groupIds.includes(g.lineGroupId)}
                          onChange={(e) => {
                            let newGroupIds = [...form.groupIds];
                            if (e.target.checked) {
                              newGroupIds.push(g.lineGroupId);
                            } else {
                              newGroupIds = newGroupIds.filter(id => id !== g.lineGroupId);
                            }
                            setForm({ ...form, groupIds: newGroupIds });
                          }}
                        />
                        <span>{g.name}</span>
                      </label>
                    ))}
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
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Thời gian gửi</label>
                  <div className="flex gap-2">
                    <select 
                      value={['Gửi ngay', '15 Phút', '30 Phút', '1 Giờ', 'Mai 08:00'].includes(form.quickReminder) ? form.quickReminder : 'Tùy chọn'} 
                      onChange={(e) => {
                        if (e.target.value === 'Tùy chọn') {
                          setForm({ ...form, quickReminder: new Date().toISOString().slice(0, 16) });
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
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Lặp lại lịch gửi</label>
                  <select 
                    value={form.repeat} 
                    onChange={(e) => setForm({ ...form, repeat: e.target.value })} 
                    className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors mb-3"
                  >
                    <option value="Không">Không lặp lại</option>
                    <option value="Hằng ngày">Hằng ngày</option>
                    <option value="Hằng tuần">Hằng tuần</option>
                    <option value="Hằng tháng">Hằng tháng</option>
                  </select>
                  
                  {form.repeat === 'Hằng tuần' && (
                    <div className="mt-3">
                      <label className="block text-sm text-[var(--color-text-secondary)] mb-2">Chọn thứ</label>
                      <div className="flex flex-wrap gap-2">
                        {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((day) => (
                          <label key={day} className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg cursor-pointer hover:border-indigo-500 transition-colors">
                            <input 
                              type="checkbox" 
                              className="rounded border-[var(--color-border)] text-indigo-600 focus:ring-indigo-500 bg-[var(--color-bg-secondary)]"
                              checked={form.repeatDays.includes(day)}
                              onChange={(e) => {
                                const currentDays = form.repeatDays;
                                if (e.target.checked) {
                                  setForm({ ...form, repeatDays: [...currentDays, day] });
                                } else {
                                  setForm({ ...form, repeatDays: currentDays.filter(d => d !== day) });
                                }
                              }}
                            />
                            <span className="text-sm font-medium text-[var(--color-text-primary)]">{day}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)] rounded-xl transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleSave}
                disabled={saving || uploading || !form.keyword.trim() || !form.reply_text.trim()}
                className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Đang lưu...' : editingId ? 'Cập nhật' : 'Tạo mới'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
