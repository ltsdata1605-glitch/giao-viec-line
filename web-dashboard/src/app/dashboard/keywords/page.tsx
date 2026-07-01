'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';

interface Keyword {
  id: string;
  keyword: string;
  reply_text: string;
  image_url: string;
  createdAt?: Date;
}

export default function KeywordsPage() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ keyword: '', reply_text: '', image_url: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // Chuyển file sang Base64 để tránh lỗi FormData/CORS
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = error => reject(error);
      });

      const formData = new FormData();
      formData.append('image', base64);

      const imgbbKey = process.env.NEXT_PUBLIC_IMGBB_API_KEY;
      if (!imgbbKey) {
        alert('Vui lòng cấu hình NEXT_PUBLIC_IMGBB_API_KEY trong file .env.local');
        setUploading(false);
        return;
      }

      // Gọi ImgBB API trực tiếp (Miễn phí, hỗ trợ CORS, độ tin cậy cao)
      const response = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbKey}`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        setForm({ ...form, image_url: data.data.url });
      } else {
        throw new Error(data.error?.message || 'Upload failed');
      }
    } catch (err) {
      console.error('Lỗi upload file:', err);
      alert('Không thể tải ảnh lên lúc này. Vui lòng thử lại sau hoặc nhập link trực tiếp.');
    } finally {
      setUploading(false);
    }
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

  function openCreateModal() {
    setEditingId(null);
    setForm({ keyword: '', reply_text: '', image_url: '' });
    setShowModal(true);
  }

  function openEditModal(kw: Keyword) {
    setEditingId(kw.id);
    setForm({ keyword: kw.keyword, reply_text: kw.reply_text, image_url: kw.image_url || '' });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.keyword.trim() || !form.reply_text.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, 'keywords', editingId), {
          keyword: form.keyword.trim().toLowerCase(),
          reply_text: form.reply_text.trim(),
          image_url: form.image_url.trim(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, 'keywords'), {
          keyword: form.keyword.trim().toLowerCase(),
          reply_text: form.reply_text.trim(),
          image_url: form.image_url.trim(),
          createdAt: serverTimestamp(),
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

              {kw.image_url && (
                <div className="mt-2 rounded-xl overflow-hidden border border-[var(--color-border)] bg-[var(--color-bg-primary)]">
                  <img
                    src={kw.image_url}
                    alt={kw.keyword}
                    className="w-full h-32 object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
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
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Hình ảnh đính kèm (tùy chọn)</label>
                <div className="flex flex-col gap-2">
                  <input
                    type="url"
                    value={form.image_url}
                    onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                    placeholder="Nhập link ảnh (https://...) hoặc tải ảnh lên"
                    className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-active)] transition-colors"
                  />
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-border)] hover:border-[var(--color-text-muted)] rounded-xl text-xs font-medium text-[var(--color-text-secondary)] transition-colors">
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
                          Tải ảnh từ máy tính
                        </>
                      )}
                      <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" disabled={uploading} />
                    </label>
                  </div>
                </div>
              </div>
            </div>

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
