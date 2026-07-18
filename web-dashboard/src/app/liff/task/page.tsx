'use client';

import { useEffect, useState } from 'react';
import liff from '@line/liff';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ADMIN_LINE_IDS } from '@/lib/adminIds';

interface UserData {
  id: string;
  name: string;
  lineUserId: string;
  role?: string;
}

interface GroupData {
  id: string;
  name: string;
  lineGroupId: string;
}

const QUICK_TEMPLATES = [
  { label: 'Truyền thông:', title: 'Truyền thông', desc: 'Thực hiện truyền thông về...' },
  { label: 'Online và GHTK', title: 'Xử lý đơn Online', desc: 'Kiểm tra và xử lý các đơn hàng online, đóng gói GHTK.' },
  { label: 'Chụp ảnh trưng bày', title: 'Chụp ảnh trưng bày', desc: 'Chụp ảnh các góc trưng bày gửi báo cáo.' },
  { label: 'Nhắc họp đầu ca', title: 'Họp đầu ca', desc: 'Chuẩn bị nội dung và nhắc mọi người họp đầu ca.' },
  { label: 'Hoàn tất báo cáo', title: 'Làm báo cáo', desc: 'Hoàn tất báo cáo doanh thu và nộp cho quản lý.' },
  { label: 'Kiểm tra vệ sinh quầy kệ', title: 'Kiểm tra vệ sinh quầy kệ', desc: 'Kiểm tra vệ sinh và lau dọn quầy kệ trưng bày theo line được phân công. Đảm bảo sạch và đầy đủ bảng giá' },
  { label: 'Gọi khách hẹn nhận hàng', title: 'Gọi khách hẹn', desc: 'Gọi điện thoại cho khách hàng đã hẹn nhận hàng hôm nay.' },
  { label: 'Chăm sóc khách sau bán', title: 'Chăm sóc khách hàng', desc: 'Gọi điện hỏi thăm khách hàng sau khi mua hàng.' }
];

const QUICK_REMINDER_PRESETS = ['Gửi ngay', '15p', '30p', '10h', '14h', '18h', 'Mai 08:00'];
const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

// Class dùng chung, khớp đúng bảng màu/kiểu dáng của Dashboard (globals.css) để 2 giao diện đồng nhất
const INPUT_CLS = 'w-full px-3 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-active)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors';
const LABEL_CLS = 'block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5';
const CARD_CLS = 'glass rounded-2xl p-4';
const CARD_TITLE_CLS = 'text-sm font-bold text-[var(--color-text-primary)] border-l-4 border-[var(--color-accent)] pl-2 mb-4';
const CHECKBOX_CLS = 'rounded border-[var(--color-border)] text-indigo-600 focus:ring-indigo-500 bg-[var(--color-bg-secondary)]';

/** Quy đổi lựa chọn "Thời gian nhắc" thành mốc gửi thực tế (epoch ms). */
function computeSendAt(quickReminder: string): number {
  const now = Date.now();
  if (quickReminder === 'Gửi ngay') return now;
  if (quickReminder === '15p') return now + 15 * 60000;
  if (quickReminder === '30p') return now + 30 * 60000;
  if (quickReminder === '10h' || quickReminder === '14h' || quickReminder === '18h') {
    const hour = parseInt(quickReminder, 10);
    const t = new Date();
    t.setHours(hour, 0, 0, 0);
    return t.getTime();
  }
  if (quickReminder === 'Mai 08:00') {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    t.setHours(8, 0, 0, 0);
    return t.getTime();
  }
  // "Tùy chọn" -> lúc này quickReminder đã được thay bằng chuỗi datetime-local thật
  const parsed = new Date(quickReminder).getTime();
  return isNaN(parsed) ? now : parsed;
}

export default function LiffTaskPage() {
  const [initialized, setInitialized] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [context, setContext] = useState<any>(null);
  const [usersList, setUsersList] = useState<UserData[]>([]);
  const [groupsList, setGroupsList] = useState<GroupData[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const getDefaultDeadline = () => {
    const d = new Date();
    d.setHours(d.getHours() + 2);
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
  };

  const [form, setForm] = useState({
    name: '',
    description: '',
    taskType: 'Vận hành',
    priority: 'Bình thường',
    groupIds: [] as string[],
    assignees: [] as string[],
    quickReminder: 'Gửi ngay',
    deadline: getDefaultDeadline(),
    repeat: 'Không',
    intervalHours: '1',
    repeatDays: [] as string[],
    customRepeat: '',
    acceptanceType: 'Bấm hoàn tất',
    reminderFrequency: '15',
    reminderFreqUnit: 'Phút',
    attachmentUrl: '',
    notes: '',
  });

  useEffect(() => {
    const initLiff = async () => {
      try {
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID || '';
        await liff.init({ liffId: liffId || 'YOUR_LIFF_ID' });
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }
        const prof = await liff.getProfile();
        const ctx = liff.getContext();
        setProfile(prof);
        setContext(ctx);
        // Mặc định chọn sẵn nhóm hiện tại (nếu mở từ trong nhóm), vẫn chọn thêm/bỏ được
        setForm(f => ({ ...f, groupIds: ctx?.groupId ? [ctx.groupId] : [] }));
        setInitialized(true);
      } catch (err) {
        console.error('LIFF init error', err);
        setInitialized(true);
      }
    };
    initLiff();

    const fetchUsersAndGroups = async () => {
      try {
        const uSnap = await getDocs(collection(db, 'users'));
        const rawUsers = uSnap.docs.map(d => ({ id: d.id, ...d.data() } as UserData));
        const uniqueUsers = Array.from(new Map(rawUsers.map(u => [u.lineUserId, u])).values());
        setUsersList(uniqueUsers);

        const gSnap = await getDocs(collection(db, 'groups'));
        const rawGroups = gSnap.docs.map(d => ({ id: d.id, ...d.data() } as GroupData));
        const uniqueGroups = Array.from(new Map(rawGroups.map(g => [g.lineGroupId, g])).values());
        setGroupsList(uniqueGroups);
      } catch (e) {
        console.error('Error fetching users/groups', e);
      } finally {
        setLoading(false);
      }
    };
    fetchUsersAndGroups();
  }, []);

  const handleQuickTemplate = (tpl: typeof QUICK_TEMPLATES[0]) => {
    setForm(f => ({ ...f, name: tpl.title, description: tpl.desc }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const imgbbKey = process.env.NEXT_PUBLIC_IMGBB_API_KEY;
      if (!imgbbKey) {
        alert('Vui lòng cấu hình NEXT_PUBLIC_IMGBB_API_KEY.');
        setUploading(false);
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
        setForm(f => ({ ...f, attachmentUrl: data.data.url }));
      } else {
        throw new Error(data.error?.message || 'Upload failed');
      }
    } catch (err) {
      console.error('Lỗi upload ảnh:', err);
      alert('Không thể tải ảnh lên. Vui lòng dán link ảnh hoặc thử lại sau.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || form.assignees.length === 0) {
      alert('Vui lòng nhập tên công việc và chọn ít nhất 1 người thực hiện.');
      return;
    }
    setSubmitting(true);

    try {
      const assigneeNameStr = form.assignees.map(id => usersList.find(u => u.lineUserId === id)?.name || id).join(', ');
      const sendAt = computeSendAt(form.quickReminder);
      const status = form.quickReminder === 'Gửi ngay' ? 'Chưa làm' : 'Chờ gửi';

      const docRef = await addDoc(collection(db, 'tasks'), {
        name: form.name.trim(),
        description: form.description.trim(),
        taskType: form.taskType,
        priority: form.priority,
        groupId: form.groupIds[0] || 'personal',
        groupIds: form.groupIds,
        groupName: '',
        assignees: form.assignees,
        assigneeId: form.assignees[0] || '',
        assigneeName: assigneeNameStr,
        creatorId: profile?.userId || 'unknown',
        status,
        deadline: form.deadline,
        repeat: form.repeat,
        intervalHours: form.intervalHours,
        repeatDays: form.repeatDays,
        customRepeat: form.customRepeat,
        quickReminder: form.quickReminder,
        sendAt,
        acceptanceType: form.acceptanceType,
        reminderFrequency: `${form.reminderFrequency} ${form.reminderFreqUnit}`,
        attachmentUrl: form.attachmentUrl,
        notes: form.notes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      // Lưu ID rút gọn để bot tra cứu nhanh qua /xong, /nhan, /huy thay vì quét toàn bộ collection
      await updateDoc(docRef, { shortId: docRef.id.slice(-5) });

      if (status === 'Chưa làm') {
        await fetch('/api/notify-task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: docRef.id,
            assignees: form.assignees,
            groupIds: form.groupIds,
            taskName: form.name.trim(),
            taskDescription: form.description.trim(),
            creatorId: profile?.userId || 'unknown'
          })
        }).catch(err => console.error('Error notifying', err));
      }

      const statusText = status === 'Chưa làm'
        ? 'đã gửi ngay'
        : `đã lên lịch gửi lúc ${new Date(sendAt).toLocaleString('vi-VN')}`;

      if (liff.isInClient()) {
        await liff.sendMessages([
          {
            type: 'text',
            text: `✅ Đã tạo công việc mới (${statusText}):\n📌 ${form.name.trim()}\n👤 Người làm: ${assigneeNameStr || 'Chưa rõ'}\n⏳ Hạn chót: ${form.deadline ? form.deadline.replace('T', ' ') : 'Không có'}`
          }
        ]);
        liff.closeWindow();
      } else {
        alert('Tạo công việc thành công!');
      }
    } catch (err) {
      console.error(err);
      alert('Có lỗi xảy ra khi tạo công việc.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!initialized || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-primary)]">
        <div className="w-10 h-10 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Chỉ admin (hardcode hoặc role="admin" trên Firestore) mới được giao việc
  const currentUserRole = usersList.find(u => u.lineUserId === profile?.userId)?.role;
  const isAllowedToAssign = ADMIN_LINE_IDS.includes(profile?.userId || '') || currentUserRole === 'admin';

  if (!isAllowedToAssign) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-primary)] p-6">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-3">⚠️</div>
          <h1 className="text-base font-bold text-[var(--color-text-primary)] mb-2">Bạn không có quyền giao việc</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">Vui lòng liên hệ quản trị viên nếu cần được cấp quyền giao việc.</p>
        </div>
      </div>
    );
  }

  const isCustomReminder = !QUICK_REMINDER_PRESETS.includes(form.quickReminder);

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] pb-24 font-sans text-[var(--color-text-primary)]">
      {/* Header */}
      <div className="bg-[var(--color-bg-secondary)]/80 backdrop-blur-sm px-4 py-3 sticky top-0 z-10 border-b border-[var(--color-border)] flex items-center justify-center">
        <h1 className="text-base font-bold text-[var(--color-text-primary)]">📝 Giao việc nhanh</h1>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-4 max-w-md mx-auto animate-fade-in-up">
        <p className="text-sm text-[var(--color-text-secondary)] mb-2">Nhập nhanh nội dung, chọn nhóm/người nhận và gửi nhắc việc.</p>

        {/* Mẫu nhanh */}
        <div>
          <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-2">Mẫu nhanh</h3>
          <div className="flex flex-wrap gap-2">
            {QUICK_TEMPLATES.map((tpl, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleQuickTemplate(tpl)}
                className="px-3 py-1.5 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-full text-xs text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors"
              >
                {tpl.label}
              </button>
            ))}
          </div>
        </div>

        {/* Thông tin công việc */}
        <div className={CARD_CLS}>
          <h2 className={CARD_TITLE_CLS}>Thông tin công việc</h2>
          <div className="space-y-4">
            <div>
              <label className={LABEL_CLS}>Tên sự kiện <span className="text-red-400">*</span></label>
              <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required
                className={INPUT_CLS} />
            </div>
            <div>
              <label className={LABEL_CLS}>Nội dung chi tiết</label>
              <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={3}
                className={`${INPUT_CLS} resize-none`} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL_CLS}>Loại công việc</label>
                <select value={form.taskType} onChange={e => setForm({...form, taskType: e.target.value})}
                  className={INPUT_CLS}>
                  <option>Vận hành</option>
                  <option>Truyền thông</option>
                  <option>Kế toán</option>
                  <option>Nhân sự</option>
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>Độ ưu tiên</label>
                <select value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}
                  className={INPUT_CLS}>
                  <option>Bình thường</option>
                  <option>Quan trọng</option>
                  <option>GẤP</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Người nhận */}
        <div className={CARD_CLS}>
          <h2 className={CARD_TITLE_CLS}>Người nhận</h2>
          <div className="space-y-4">
            <div>
              <label className={LABEL_CLS}>Người giao việc</label>
              <div className="w-full px-3 py-2.5 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-secondary)]">
                {profile?.displayName || 'Tôi'}
              </div>
            </div>
            <div>
              <label className={LABEL_CLS}>Nhóm nhận (có thể chọn nhiều)</label>
              <div className="w-full max-h-32 overflow-y-auto px-3 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)]">
                {groupsList.map(g => (
                  <label key={g.id} className="flex items-center gap-2 py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      className={CHECKBOX_CLS}
                      checked={form.groupIds.includes(g.lineGroupId)}
                      onChange={e => {
                        const ids = form.groupIds;
                        setForm({ ...form, groupIds: e.target.checked ? [...ids, g.lineGroupId] : ids.filter(id => id !== g.lineGroupId) });
                      }}
                    />
                    <span>{g.name}</span>
                  </label>
                ))}
                {form.groupIds.filter(id => !groupsList.find(g => g.lineGroupId === id)).map(id => (
                  <label key={id} className="flex items-center gap-2 py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      className={CHECKBOX_CLS}
                      checked={true}
                      onChange={() => setForm({ ...form, groupIds: form.groupIds.filter(x => x !== id) })}
                    />
                    <span className="text-[var(--color-text-muted)]">{id === context?.groupId ? 'Nhóm hiện tại' : id}</span>
                  </label>
                ))}
                {groupsList.length === 0 && form.groupIds.length === 0 && (
                  <p className="text-xs text-[var(--color-text-muted)] py-1">Chưa có nhóm nào — có thể để trống và giao thẳng cho cá nhân.</p>
                )}
              </div>
            </div>
            <div>
              <label className={LABEL_CLS}>Người thực hiện (có thể chọn nhiều) <span className="text-red-400">*</span></label>
              <div className="w-full max-h-32 overflow-y-auto px-3 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)]">
                {usersList.map(u => (
                  <label key={u.id} className="flex items-center gap-2 py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      className={CHECKBOX_CLS}
                      checked={form.assignees.includes(u.lineUserId)}
                      onChange={e => {
                        const ids = form.assignees;
                        setForm({ ...form, assignees: e.target.checked ? [...ids, u.lineUserId] : ids.filter(id => id !== u.lineUserId) });
                      }}
                    />
                    <span>{u.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Thời gian nhắc */}
        <div className={CARD_CLS}>
          <h2 className="text-sm font-bold text-[var(--color-text-primary)] border-l-4 border-[var(--color-accent)] pl-2 mb-2">Thời gian nhắc</h2>
          <p className="text-xs text-[var(--color-text-muted)] mb-3">Chọn nhanh thời gian nhắc</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_REMINDER_PRESETS.map(time => (
              <button key={time} type="button" onClick={() => setForm({...form, quickReminder: time})}
                className={`px-3 py-1.5 border rounded-full text-xs transition-colors ${form.quickReminder === time ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent-hover)] border-[var(--color-accent)]/30 font-medium' : 'text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-[var(--color-text-muted)]'}`}>
                {time}
              </button>
            ))}
            <button type="button" onClick={() => setForm({...form, quickReminder: getDefaultDeadline()})}
              className={`px-3 py-1.5 border rounded-full text-xs transition-colors ${isCustomReminder ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent-hover)] border-[var(--color-accent)]/30 font-medium' : 'text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-[var(--color-text-muted)]'}`}>
              Tùy chọn
            </button>
          </div>
          {isCustomReminder && (
            <input type="datetime-local" value={form.quickReminder} onChange={e => setForm({...form, quickReminder: e.target.value})}
              className={`${INPUT_CLS} mt-3 [color-scheme:dark]`} />
          )}
        </div>

        {/* Hạn hoàn thành & lặp lại */}
        <div className={CARD_CLS}>
          <h2 className={CARD_TITLE_CLS}>Hạn hoàn thành &amp; lặp lại</h2>
          <div className="space-y-3">
            <div>
              <label className={LABEL_CLS}>Hạn hoàn thành (Deadline)</label>
              <input type="datetime-local" value={form.deadline} onChange={e => setForm({...form, deadline: e.target.value})}
                className={`${INPUT_CLS} [color-scheme:dark]`} />
            </div>
            <div>
              <label className={LABEL_CLS}>Lặp lại</label>
              <select value={form.repeat} onChange={e => setForm({...form, repeat: e.target.value})}
                className={INPUT_CLS}>
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
                <div className="mt-3">
                  <label className={LABEL_CLS}>Lặp lại sau mấy giờ</label>
                  <input type="number" min="1" value={form.intervalHours} onChange={e => setForm({...form, intervalHours: e.target.value})}
                    className={INPUT_CLS} />
                </div>
              )}

              {form.repeat === 'Hàng ngày' && (
                <div className="mt-3">
                  <label className={LABEL_CLS}>Chọn các ngày trong tuần</label>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map(day => (
                      <label key={day} className={`flex items-center gap-2 cursor-pointer text-sm px-3 py-1.5 rounded-lg border transition-colors ${form.repeatDays.includes(day) ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent-hover)] border-[var(--color-accent)]/30 font-medium' : 'text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-text-muted)]'}`}>
                        <input
                          type="checkbox"
                          checked={form.repeatDays.includes(day)}
                          onChange={e => {
                            const days = form.repeatDays;
                            setForm({ ...form, repeatDays: e.target.checked ? [...days, day] : days.filter(d => d !== day) });
                          }}
                          className="hidden"
                        />
                        {day}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {form.repeat === 'Tuỳ chọn' && (
                <div className="mt-3">
                  <label className={LABEL_CLS}>Chu kỳ tuỳ chọn</label>
                  <input type="text" value={form.customRepeat} onChange={e => setForm({...form, customRepeat: e.target.value})} placeholder="VD: Mỗi 3 ngày"
                    className={INPUT_CLS} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Nghiệm thu & nhắc lại */}
        <div className={CARD_CLS}>
          <h2 className={CARD_TITLE_CLS}>Nghiệm thu &amp; nhắc lại</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Yêu cầu nghiệm thu</label>
              <select value={form.acceptanceType} onChange={e => setForm({...form, acceptanceType: e.target.value})}
                className={INPUT_CLS}>
                <option>Bấm hoàn tất</option>
                <option>Gửi ảnh chụp</option>
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>Tần suất nhắc</label>
              <div className="flex gap-2">
                <input type="number" value={form.reminderFrequency} onChange={e => setForm({...form, reminderFrequency: e.target.value})}
                  className={`${INPUT_CLS} w-1/2`} />
                <select value={form.reminderFreqUnit} onChange={e => setForm({...form, reminderFreqUnit: e.target.value})}
                  className={`${INPUT_CLS} w-1/2`}>
                  <option>Phút</option>
                  <option>Giờ</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Ảnh đính kèm */}
        <div className={CARD_CLS}>
          <h2 className={CARD_TITLE_CLS}>Ảnh đính kèm</h2>
          <div>
            <label className={LABEL_CLS}>Ảnh đính kèm gợi ý (Tối đa 1 ảnh hiện tại)</label>
            <div className="w-full relative px-3 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-secondary)] flex items-center mb-2 overflow-hidden">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                disabled={uploading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
              <span className={`px-2 py-1 rounded text-xs mr-2 transition-colors ${uploading ? 'bg-[var(--color-bg-card-hover)] text-[var(--color-text-muted)]' : 'bg-[var(--color-bg-card)] text-[var(--color-text-secondary)]'}`}>
                {uploading ? 'Đang tải lên...' : 'Chọn tệp'}
              </span>
              <span className="truncate flex-1">
                {form.attachmentUrl ? 'Đã tải lên 1 tệp' : 'Chưa chọn tệp nào'}
              </span>
            </div>

            {form.attachmentUrl && (
              <div className="mb-3 relative inline-block rounded-xl overflow-hidden border border-[var(--color-border)]">
                <img src={form.attachmentUrl} alt="Preview" className="h-24 w-auto object-cover" />
                <button
                  type="button"
                  onClick={() => setForm({...form, attachmentUrl: ''})}
                  className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-lg hover:bg-red-500 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            <label className={LABEL_CLS}>Hoặc dán link ảnh</label>
            <input type="text" value={form.attachmentUrl} onChange={e => setForm({...form, attachmentUrl: e.target.value})} placeholder="https://example.com/image.jpg"
              className={INPUT_CLS} />
          </div>
        </div>

        {/* Ghi chú */}
        <div className={CARD_CLS}>
          <h2 className={CARD_TITLE_CLS}>Ghi chú</h2>
          <div>
            <label className={LABEL_CLS}>Ghi chú thêm</label>
            <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={3} placeholder="Ghi chú thêm cho người thực hiện..."
              className={`${INPUT_CLS} resize-none`} />
          </div>
        </div>

        {/* Submit button fixed at bottom */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-[var(--color-bg-secondary)]/95 backdrop-blur-sm border-t border-[var(--color-border)] z-20">
          <button
            type="submit"
            disabled={submitting}
            className="w-full max-w-md mx-auto block bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold py-3.5 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center glow-accent"
          >
            {submitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : 'Gửi giao việc'}
          </button>
        </div>
      </form>
    </div>
  );
}
