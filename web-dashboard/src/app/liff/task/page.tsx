'use client';

import { useEffect, useState, useRef } from 'react';
import liff from '@line/liff';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';

interface UserData {
  id: string;
  name: string;
  lineUserId: string;
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

export default function LiffTaskPage() {
  const [initialized, setInitialized] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [context, setContext] = useState<any>(null);
  const [usersList, setUsersList] = useState<UserData[]>([]);
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
    assignerId: '',
    groupId: '',
    followerIds: [] as string[],
    assigneeId: '',
    quickReminder: 'Gửi ngay',
    deadline: getDefaultDeadline(),
    repeat: 'Không',
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
        setProfile(prof);
        setContext(liff.getContext());
        setForm(f => ({ ...f, assignerId: prof.userId, groupId: liff.getContext()?.groupId || '' }));
        setInitialized(true);
      } catch (err) {
        console.error('LIFF init error', err);
        setInitialized(true);
      }
    };
    initLiff();

    const fetchUsers = async () => {
      try {
        const snap = await getDocs(collection(db, 'users'));
        const rawUsers = snap.docs.map(d => ({ id: d.id, ...d.data() } as UserData));
        const uniqueUsers = Array.from(new Map(rawUsers.map(u => [u.lineUserId, u])).values());
        setUsersList(uniqueUsers);
      } catch (e) {
        console.error('Error fetching users', e);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  const handleQuickTemplate = (tpl: typeof QUICK_TEMPLATES[0]) => {
    setForm(f => ({ ...f, name: tpl.title, description: tpl.desc }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    setUploading(true);
    try {
      const file = e.target.files[0];
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/upload', {
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
      console.error('Lỗi upload file:', err);
      alert('Không thể tải ảnh lên. Vui lòng dán link ảnh hoặc thử lại sau.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.assigneeId) {
      alert('Vui lòng nhập tên công việc và chọn người thực hiện.');
      return;
    }
    setSubmitting(true);

    try {
      const assigneeName = usersList.find(u => u.lineUserId === form.assigneeId)?.name || '';
      const groupId = context?.groupId || 'personal';

      const docRef = await addDoc(collection(db, 'tasks'), {
        name: form.name.trim(),
        description: form.description.trim(),
        taskType: form.taskType,
        priority: form.priority,
        groupId: groupId,
        groupName: '', 
        assignees: [form.assigneeId],
        assigneeId: form.assigneeId,
        assigneeName: assigneeName,
        creatorId: profile?.userId || 'unknown',
        status: 'Chưa làm',
        deadline: form.deadline,
        repeat: form.repeat,
        quickReminder: form.quickReminder,
        acceptanceType: form.acceptanceType,
        reminderFrequency: `${form.reminderFrequency} ${form.reminderFreqUnit}`,
        attachmentUrl: form.attachmentUrl,
        notes: form.notes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (profile?.userId && form.assigneeId !== profile.userId) {
        await fetch('/api/notify-task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: docRef.id,
            assigneeId: form.assigneeId,
            creatorId: profile.userId,
            taskName: form.name.trim()
          })
        }).catch(err => console.error('Error notifying', err));
      }

      if (liff.isInClient()) {
        await liff.sendMessages([
          {
            type: 'text',
            text: `✅ Đã tạo công việc mới:\n📌 ${form.name.trim()}\n👤 Người làm: ${assigneeName}\n⏳ Hạn chót: ${form.deadline ? form.deadline.replace('T', ' ') : 'Không có'}`
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

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans text-gray-800">
      {/* Header */}
      <div className="bg-white px-4 py-3 sticky top-0 z-10 border-b border-gray-200 flex items-center justify-center">
        <h1 className="text-base font-bold text-gray-900">📝 Giao việc nhanh</h1>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-4 max-w-md mx-auto">
        <p className="text-sm text-gray-500 mb-2">Nhập nhanh nội dung, chọn nhóm nhận và gửi nhắc việc.</p>

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
              <select value={form.assignerId} onChange={e => setForm({...form, assignerId: e.target.value})}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none">
                <option value={profile?.userId}>{profile?.displayName || 'Tôi'}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nhóm nhận <span className="text-red-500">*</span></label>
              <select value={form.groupId} onChange={e => setForm({...form, groupId: e.target.value})} required
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none">
                <option value={context?.groupId || 'personal'}>-- Nhóm hiện tại --</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Người theo dõi</label>
              <input type="text" placeholder="Chọn người theo dõi..." disabled
                className="w-full px-3 py-2.5 bg-gray-100 border border-gray-200 rounded-lg text-sm outline-none text-gray-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Người thực hiện <span className="text-red-500">*</span></label>
              <select value={form.assigneeId} onChange={e => setForm({...form, assigneeId: e.target.value})} required
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none">
                <option value="">Chọn người thực hiện...</option>
                {usersList.map(u => <option key={u.id} value={u.lineUserId}>{u.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Thời gian nhắc */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h2 className="text-sm font-bold border-l-4 border-green-500 pl-2 mb-2">Thời gian nhắc</h2>
          <p className="text-xs text-gray-400 mb-3">Chọn nhanh thời gian nhắc</p>
          <div className="flex flex-wrap gap-2">
            {['Gửi ngay', '15p', '30p', '10h', '14h', '18h', 'Mai 08:00', 'Tùy chọn'].map(time => (
              <button key={time} type="button" onClick={() => setForm({...form, quickReminder: time})}
                className={`px-3 py-1.5 border rounded-full text-xs transition-colors ${form.quickReminder === time ? 'border-green-500 text-green-600 bg-green-50 font-medium' : 'border-gray-300 text-gray-600 bg-white'}`}>
                {time}
              </button>
            ))}
          </div>
        </div>

        {/* Hạn hoàn thành & lặp lại */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h2 className="text-sm font-bold border-l-4 border-green-500 pl-2 mb-4">Hạn hoàn thành & lặp lại</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Hạn hoàn thành (Deadline)</label>
              <input type="datetime-local" value={form.deadline} onChange={e => setForm({...form, deadline: e.target.value})}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Lặp lại</label>
              <select value={form.repeat} onChange={e => setForm({...form, repeat: e.target.value})}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none">
                <option>Không</option>
                <option>Hàng ngày</option>
                <option>Hàng tuần</option>
              </select>
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
              <label className="block text-xs font-medium text-gray-500 mb-1">Tần suất nhắc (Phút)</label>
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
