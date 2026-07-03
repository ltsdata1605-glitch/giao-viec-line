'use client';

import { useEffect, useState } from 'react';
import liff from '@line/liff';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';

interface UserData {
  id: string;
  name: string;
  lineUserId: string;
}

export default function LiffTaskPage() {
  const [initialized, setInitialized] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [context, setContext] = useState<any>(null);
  const [usersList, setUsersList] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const getDefaultDeadline = () => {
    const d = new Date();
    d.setHours(d.getHours() + 2);
    // Format to YYYY-MM-DDTHH:mm
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
  };

  const [form, setForm] = useState({
    name: '',
    description: '',
    assigneeId: '',
    priority: 'Bình thường',
    deadline: getDefaultDeadline(),
  });

  useEffect(() => {
    // 1. Initialize LIFF
    const initLiff = async () => {
      try {
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID || '';
        if (!liffId) {
          console.warn('NEXT_PUBLIC_LIFF_ID is not defined');
        }
        await liff.init({ liffId: liffId || 'YOUR_LIFF_ID' });
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }
        const prof = await liff.getProfile();
        setProfile(prof);
        setContext(liff.getContext());
        setInitialized(true);
      } catch (err) {
        console.error('LIFF init error', err);
        setInitialized(true); // Still allow testing in browser maybe
      }
    };
    initLiff();

    // 2. Fetch users for dropdown
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.assigneeId) {
      alert('Vui lòng nhập tên công việc và chọn người nhận.');
      return;
    }
    setSubmitting(true);

    try {
      const assigneeName = usersList.find(u => u.lineUserId === form.assigneeId)?.name || '';
      const groupId = context?.groupId || 'personal';
      
      // We don't have group name here easily, but the dashboard fetches it.
      // We can just rely on the bot / dashboard to resolve it.

      // 1. Save to Firebase
      const docRef = await addDoc(collection(db, 'tasks'), {
        name: form.name.trim(),
        description: form.description.trim(),
        groupId: groupId,
        groupName: '', // Dashboard will resolve or it can be empty
        assignees: [form.assigneeId],
        assigneeId: form.assigneeId,
        assigneeName: assigneeName,
        creatorId: profile?.userId || 'unknown',
        status: 'Chưa làm',
        priority: form.priority,
        deadline: form.deadline,
        repeat: 'Không',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 2. Send notification API if it's assigned to someone else
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

      // 3. Send message back to chat
      if (liff.isInClient()) {
        await liff.sendMessages([
          {
            type: 'text',
            text: `✅ Đã tạo công việc mới:\n📌 ${form.name.trim()}\n👤 Người làm: ${assigneeName}\n⏳ Hạn chót: ${form.deadline ? form.deadline.replace('T', ' ') : 'Không có'}`
          }
        ]);
        liff.closeWindow();
      } else {
        alert('Tạo công việc thành công! (Bạn đang mở bằng trình duyệt ngoài)');
        setForm({ name: '', description: '', assigneeId: '', priority: 'Bình thường', deadline: '' });
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 font-sans text-gray-800">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-sm p-6">
        <h1 className="text-xl font-bold text-center text-gray-900 mb-6">Tạo Công Việc</h1>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tên công việc <span className="text-red-500">*</span></label>
            <input 
              type="text" 
              value={form.name}
              onChange={e => setForm({...form, name: e.target.value})}
              placeholder="Vd: Làm báo cáo tuần"
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Người nhận <span className="text-red-500">*</span></label>
            <select 
              value={form.assigneeId}
              onChange={e => setForm({...form, assigneeId: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              required
            >
              <option value="">-- Chọn nhân viên --</option>
              {usersList.map(u => (
                <option key={u.id} value={u.lineUserId}>{u.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hạn chót</label>
            <input 
              type="datetime-local" 
              value={form.deadline}
              onChange={e => setForm({...form, deadline: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mức độ ưu tiên</label>
            <select 
              value={form.priority}
              onChange={e => setForm({...form, priority: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="Bình thường">Bình thường</option>
              <option value="Quan trọng">Quan trọng</option>
              <option value="GẤP">GẤP</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả thêm (Tùy chọn)</label>
            <textarea 
              value={form.description}
              onChange={e => setForm({...form, description: e.target.value})}
              rows={3}
              placeholder="Nhập ghi chú hoặc mô tả chi tiết..."
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
            />
          </div>

          <button 
            type="submit"
            disabled={submitting}
            className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
            ) : 'Giao Việc Ngay'}
          </button>
        </form>
      </div>
    </div>
  );
}
