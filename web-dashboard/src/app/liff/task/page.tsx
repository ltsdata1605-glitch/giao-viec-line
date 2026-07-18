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
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  // Chỉ admin (hardcode hoặc role="admin" trên Firestore) mới được giao việc
  const currentUserRole = usersList.find(u => u.lineUserId === profile?.userId)?.role;
  const isAllowedToAssign = ADMIN_LINE_IDS.includes(profile?.userId || '') || currentUserRole === 'admin';

  if (!isAllowedToAssign) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50 p-6">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-3">⚠️</div>
          <h1 className="text-base font-bold text-gray-900 mb-2">Bạn không có quyền giao việc</h1>
          <p className="text-sm text-gray-500">Vui lòng liên hệ quản trị viên nếu cần được cấp quyền giao việc.</p>
        </div>
      </div>
    );
  }

  const isCustomReminder = !QUICK_REMINDER_PRESETS.includes(form.quickReminder);

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans text-gray-800">
      {/* Header */}
      <div className="bg-white px-4 py-3 sticky top-0 z-10 border-b border-gray-200 flex items-center justify-center">
        <h1 className="text-base font-bold text-gray-900">📝 Giao việc nhanh</h1>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-4 max-w-md mx-auto">
        <p className="text-sm text-gray-500 mb-2">Nhập nhanh nội dung, chọn nhóm/người nhận và gửi nhắc việc.</p>

        {/* Mẫu nhanh */}
        <div>
          <h3 className="text-sm font-bold text-gray-800 mb-2">Mẫu nhanh</h3>
          <div className="flex flex-wrap gap-2">
            {QUICK_TEMPLATES.map((tpl, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleQuickTemplate(tpl)}
                className="px-3 py-1.5 bg-white border border-gray-300 rounded-full text-xs text-gray-600 hover:border-green-500 hover:text-green-600 transition-colors"
              >
                {tpl.label}
              </button>
            ))}
          </div>
        </div>

        {/* Thông tin công việc */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h2 className="text-sm font-bold border-l-4 border-green-500 pl-2 mb-4">Thông tin công việc</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tên sự kiện <span className="text-red-500">*</span></label>
              <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-green-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nội dung chi tiết</label>
              <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={3}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-green-500 outline-none resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Loại công việc</label>
                <select value={form.taskType} onChange={e => setForm({...form, taskType: e.target.value})}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none">
                  <option>Vận hành</option>
                  <option>Truyền thông</option>
                  <option>Kế toán</option>
                  <option>Nhân sự</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Độ ưu tiên</label>
                <select value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none">
                  <option>Bình thường</option>
                  <option>Quan trọng</option>
                  <option>GẤP</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Người nhận */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h2 className="text-sm font-bold border-l-4 border-green-500 pl-2 mb-4">Người nhận</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Người giao việc</label>
              <div className="w-full px-3 py-2.5 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-600">
                {profile?.displayName || 'Tôi'}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nhóm nhận (có thể chọn nhiều)</label>
              <div className="w-full max-h-32 overflow-y-auto px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                {groupsList.map(g => (
                  <label key={g.id} className="flex items-center gap-2 py-1 cursor-pointer">
                    <input
                      type="checkbox"
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
                      checked={true}
                      onChange={() => setForm({ ...form, groupIds: form.groupIds.filter(x => x !== id) })}
                    />
                    <span className="text-gray-400">{id === context?.groupId ? 'Nhóm hiện tại' : id}</span>
                  </label>
                ))}
                {groupsList.length === 0 && form.groupIds.length === 0 && (
                  <p className="text-xs text-gray-400 py-1">Chưa có nhóm nào — có thể để trống và giao thẳng cho cá nhân.</p>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Người thực hiện (có thể chọn nhiều) <span className="text-red-500">*</span></label>
              <div className="w-full max-h-32 overflow-y-auto px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                {usersList.map(u => (
                  <label key={u.id} className="flex items-center gap-2 py-1 cursor-pointer">
                    <input
                      type="checkbox"
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h2 className="text-sm font-bold border-l-4 border-green-500 pl-2 mb-2">Thời gian nhắc</h2>
          <p className="text-xs text-gray-400 mb-3">Chọn nhanh thời gian nhắc</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_REMINDER_PRESETS.map(time => (
              <button key={time} type="button" onClick={() => setForm({...form, quickReminder: time})}
                className={`px-3 py-1.5 border rounded-full text-xs transition-colors ${form.quickReminder === time ? 'border-green-500 text-green-600 bg-green-50 font-medium' : 'border-gray-300 text-gray-600 bg-white'}`}>
                {time}
              </button>
            ))}
            <button type="button" onClick={() => setForm({...form, quickReminder: getDefaultDeadline()})}
              className={`px-3 py-1.5 border rounded-full text-xs transition-colors ${isCustomReminder ? 'border-green-500 text-green-600 bg-green-50 font-medium' : 'border-gray-300 text-gray-600 bg-white'}`}>
              Tùy chọn
            </button>
          </div>
          {isCustomReminder && (
            <input type="datetime-local" value={form.quickReminder} onChange={e => setForm({...form, quickReminder: e.target.value})}
              className="w-full mt-3 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none" />
          )}
        </div>

        {/* Hạn hoàn thành & lặp lại */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h2 className="text-sm font-bold border-l-4 border-green-500 pl-2 mb-4">Hạn hoàn thành & lặp lại</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Hạn hoàn thành (Deadline)</label>
              <input type="datetime-local" value={form.deadline} onChange={e => setForm({...form, deadline: e.target.value})}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Lặp lại</label>
              <select value={form.repeat} onChange={e => setForm({...form, repeat: e.target.value})}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none">
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
                <div className="mt-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Lặp lại sau mấy giờ</label>
                  <input type="number" min="1" value={form.intervalHours} onChange={e => setForm({...form, intervalHours: e.target.value})}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none" />
                </div>
              )}

              {form.repeat === 'Hàng ngày' && (
                <div className="mt-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Chọn các ngày trong tuần</label>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map(day => (
                      <label key={day} className={`px-2.5 py-1 rounded-full text-xs border cursor-pointer ${form.repeatDays.includes(day) ? 'border-green-500 text-green-600 bg-green-50 font-medium' : 'border-gray-300 text-gray-600 bg-white'}`}>
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
                <div className="mt-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Chu kỳ tuỳ chọn</label>
                  <input type="text" value={form.customRepeat} onChange={e => setForm({...form, customRepeat: e.target.value})} placeholder="VD: Mỗi 3 ngày"
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Nghiệm thu & nhắc lại */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h2 className="text-sm font-bold border-l-4 border-green-500 pl-2 mb-4">Nghiệm thu & nhắc lại</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Yêu cầu nghiệm thu</label>
              <select value={form.acceptanceType} onChange={e => setForm({...form, acceptanceType: e.target.value})}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none">
                <option>Bấm hoàn tất</option>
                <option>Gửi ảnh chụp</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tần suất nhắc</label>
              <div className="flex gap-2">
                <input type="number" value={form.reminderFrequency} onChange={e => setForm({...form, reminderFrequency: e.target.value})}
                  className="w-1/2 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none" />
                <select value={form.reminderFreqUnit} onChange={e => setForm({...form, reminderFreqUnit: e.target.value})}
                  className="w-1/2 px-2 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none">
                  <option>Phút</option>
                  <option>Giờ</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Ảnh đính kèm */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h2 className="text-sm font-bold border-l-4 border-green-500 pl-2 mb-4">Ảnh đính kèm</h2>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Ảnh đính kèm gợi ý (Tối đa 1 ảnh hiện tại)</label>
            <div className="w-full relative px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500 flex items-center mb-2 overflow-hidden">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                disabled={uploading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
              <span className={`px-2 py-1 rounded text-xs mr-2 transition-colors ${uploading ? 'bg-gray-300 text-gray-500' : 'bg-gray-200 text-gray-700'}`}>
                {uploading ? 'Đang tải lên...' : 'Chọn tệp'}
              </span>
              <span className="truncate flex-1">
                {form.attachmentUrl ? 'Đã tải lên 1 tệp' : 'Chưa chọn tệp nào'}
              </span>
            </div>

            {form.attachmentUrl && (
              <div className="mb-3 relative inline-block rounded-lg overflow-hidden border border-gray-200">
                <img src={form.attachmentUrl} alt="Preview" className="h-24 w-auto object-cover" />
                <button
                  type="button"
                  onClick={() => setForm({...form, attachmentUrl: ''})}
                  className="absolute top-1 right-1 bg-white rounded-full p-1 shadow-sm text-red-500 hover:text-red-700"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            <label className="block text-xs font-medium text-gray-500 mb-1">Hoặc dán link ảnh</label>
            <input type="text" value={form.attachmentUrl} onChange={e => setForm({...form, attachmentUrl: e.target.value})} placeholder="https://example.com/image.jpg"
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none" />
          </div>
        </div>

        {/* Ghi chú */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h2 className="text-sm font-bold border-l-4 border-green-500 pl-2 mb-4">Ghi chú</h2>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Ghi chú thêm</label>
            <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={3} placeholder="Ghi chú thêm cho người thực hiện..."
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none resize-none" />
          </div>
        </div>

        {/* Submit button fixed at bottom */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 z-20 shadow-lg">
          <button
            type="submit"
            disabled={submitting}
            className="w-full max-w-md mx-auto block bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 rounded-xl transition-colors disabled:opacity-70 flex justify-center"
          >
            {submitting ? (
              <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
            ) : 'Gửi giao việc'}
          </button>
        </div>
      </form>
    </div>
  );
}
