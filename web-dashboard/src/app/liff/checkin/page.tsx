'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import liff from '@line/liff';
import type { Profile } from '@liff/get-profile';
import type { Context } from '@liff/store';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { getVnDateKey } from '@/lib/dateUtils';

interface GroupData {
  id: string;
  name: string;
  lineGroupId: string;
}

const INPUT_CLS = 'w-full px-3 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-active)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors';
const LABEL_CLS = 'block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5';
const CARD_CLS = 'glass rounded-2xl p-4';
const CARD_TITLE_CLS = 'text-sm font-bold text-[var(--color-text-primary)] border-l-4 border-[var(--color-accent)] pl-2 mb-4';
const RADIO_CLS = 'border-[var(--color-border)] text-indigo-600 focus:ring-indigo-500 bg-[var(--color-bg-secondary)]';

function getDefaultTime(): string {
  const d = new Date();
  d.setHours(d.getHours() + 2);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function LiffCheckinPage() {
  const router = useRouter();
  const [initialized, setInitialized] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [context, setContext] = useState<Context | null>(null);
  const [groupsList, setGroupsList] = useState<GroupData[]>([]);
  const [groupSearch, setGroupSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [time, setTime] = useState(getDefaultTime());
  // "group:<id>" | "room:<id>" | "user:<id>" — gõ lệnh /diemdanh trực tiếp trong nhóm sẽ tạo tin
  // giao việc + phản hồi ngay trong nhóm đó, dễ gây "spam" cho cả nhóm; form này tách rời khỏi nơi
  // đang mở, cho chọn thẳng nhóm cần gửi (kể cả mở form từ chat riêng với bot) để tránh việc đó.
  const [destination, setDestination] = useState('');

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

        // Chọn sẵn nơi hợp lý nhất theo ngữ cảnh mở form — vẫn đổi được sang nhóm khác ngay bên dưới.
        if (ctx?.type === 'group' && ctx.groupId) {
          setDestination(`group:${ctx.groupId}`);
        } else if (ctx?.type === 'room' && ctx.roomId) {
          setDestination(`room:${ctx.roomId}`);
        } else {
          setDestination(`user:${prof.userId}`);
        }

        setInitialized(true);
      } catch (err) {
        console.error('LIFF init error', err);
        setInitialized(true);
      }
    };
    initLiff();

    const fetchGroups = async () => {
      try {
        const gSnap = await getDocs(collection(db, 'groups'));
        const rawGroups = gSnap.docs.map(d => ({ id: d.id, ...d.data() } as GroupData));
        const uniqueGroups = Array.from(new Map(rawGroups.map(g => [g.lineGroupId, g])).values());
        setGroupsList(uniqueGroups);
      } catch (e) {
        console.error('Error fetching groups', e);
      }
    };
    fetchGroups();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !time) {
      alert('Vui lòng nhập tiêu đề và deadline.');
      return;
    }
    const sepIdx = destination.indexOf(':');
    const destType = sepIdx > 0 ? destination.slice(0, sepIdx) : '';
    const destKey = sepIdx > 0 ? destination.slice(sepIdx + 1) : '';
    if (!['group', 'room', 'user'].includes(destType) || !destKey) {
      alert('Vui lòng chọn nơi gửi điểm danh.');
      return;
    }

    setSubmitting(true);
    try {
      const deadline = `${getVnDateKey()}T${time}`;

      const res = await fetch('/api/notify-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          deadline,
          creatorId: profile?.userId || 'unknown',
          creatorName: profile?.displayName || 'Ẩn danh',
          chatKey: destKey,
          chatType: destType,
        }),
      });
      if (!res.ok) throw new Error('Tạo điểm danh thất bại');

      // Điểm danh đã tạo thành công tại đây. Bước gửi tin xác nhận + đóng cửa sổ qua LIFF SDK tách
      // riêng try/catch — chỉ hoạt động khi mở đúng từ trong 1 cuộc trò chuyện LINE thật, nếu thất
      // bại sẽ KHÔNG bị báo nhầm thành "lỗi tạo điểm danh". Lưu ý: nếu gửi vào 1 nhóm KHÁC nhóm đang
      // mở form (hoặc mở form từ chat riêng), tin xác nhận này chỉ hiện ở NƠI ĐANG MỞ FORM — thẻ điểm
      // danh thật đã được đẩy vào đúng nhóm đã chọn qua /api/notify-checkin ở trên rồi.
      try {
        if (liff.isInClient()) {
          await liff.sendMessages([
            { type: 'text', text: `✅ Đã tạo điểm danh: ${title.trim()}\n⏰ Deadline: ${time}` }
          ]);
          liff.closeWindow();
        } else {
          alert('Tạo điểm danh thành công!');
        }
      } catch (liffErr) {
        console.error('LIFF sendMessages/closeWindow error (không ảnh hưởng điểm danh đã tạo):', liffErr);
        alert('✅ Đã tạo điểm danh thành công! (Không tự đóng được cửa sổ này, bạn có thể đóng tay.)');
      }
    } catch (err) {
      console.error(err);
      alert('Có lỗi xảy ra khi tạo điểm danh.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-primary)]">
        <div className="w-10 h-10 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-primary)] p-6">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-3">⚠️</div>
          <h1 className="text-base font-bold text-[var(--color-text-primary)] mb-2">Không lấy được thông tin tài khoản LINE</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">Vui lòng thử mở lại link này.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] pb-24 font-sans text-[var(--color-text-primary)]">
      <div className="bg-[var(--color-bg-secondary)]/80 backdrop-blur-sm px-4 py-3 sticky top-0 z-10 border-b border-[var(--color-border)] flex items-center justify-center">
        <h1 className="text-base font-bold text-[var(--color-text-primary)]">🙋 Tạo điểm danh nhanh</h1>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-4 max-w-md mx-auto animate-fade-in-up">
        <p className="text-sm text-[var(--color-text-secondary)] mb-2">Điền thông tin, chọn nhóm cần gửi và tạo điểm danh — không cần gõ lệnh trực tiếp trong nhóm.</p>

        <button
          type="button"
          onClick={() => router.push('/liff/task')}
          className="w-full text-center text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent-hover)] transition-colors py-1"
        >
          📝 Chuyển sang Form Giao việc
        </button>

        <div className={CARD_CLS}>
          <h2 className={CARD_TITLE_CLS}>Thông tin điểm danh</h2>
          <div className="space-y-4">
            <div>
              <label className={LABEL_CLS}>Tiêu đề <span className="text-red-400">*</span></label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} required
                placeholder="VD: HOÀN TẤT LIKE VÀ SHARE BÀI"
                className={INPUT_CLS} />
            </div>
            <div>
              <label className={LABEL_CLS}>Nội dung chi tiết (không bắt buộc)</label>
              <textarea value={content} onChange={e => setContent(e.target.value)} rows={4}
                placeholder={'VD: Link:\n1. https://...\n2. https://...'}
                className={`${INPUT_CLS} resize-none`} />
              <p className="text-xs text-[var(--color-text-muted)] mt-1.5">Có thể chèn link — link sẽ tự bấm mở được khi gửi vào LINE. Nên tự rút gọn link dài trước khi dán.</p>
            </div>
            <div>
              <label className={LABEL_CLS}>Deadline (hôm nay) <span className="text-red-400">*</span></label>
              <input type="time" step={60} value={time} onChange={e => setTime(e.target.value)} required
                className={`${INPUT_CLS} [color-scheme:dark]`} />
            </div>
          </div>
        </div>

        <div className={CARD_CLS}>
          <h2 className={CARD_TITLE_CLS}>Gửi vào đâu <span className="text-red-400">*</span></h2>
          <div className="space-y-1">
            {context?.type === 'room' && context.roomId && (
              <label className="flex items-center gap-2 py-1.5 cursor-pointer text-sm text-[var(--color-text-primary)]">
                <input type="radio" name="dest" className={RADIO_CLS}
                  checked={destination === `room:${context.roomId}`}
                  onChange={() => setDestination(`room:${context.roomId}`)} />
                <span>🏠 Phòng chat hiện tại</span>
              </label>
            )}
            <label className="flex items-center gap-2 py-1.5 cursor-pointer text-sm text-[var(--color-text-primary)]">
              <input type="radio" name="dest" className={RADIO_CLS}
                checked={destination === `user:${profile.userId}`}
                onChange={() => setDestination(`user:${profile.userId}`)} />
              <span>💬 Chat riêng (chỉ mình tôi)</span>
            </label>

            {groupsList.length > 5 && (
              <input
                type="text"
                value={groupSearch}
                onChange={e => setGroupSearch(e.target.value)}
                placeholder="Tìm tên nhóm..."
                className={`${INPUT_CLS} my-2`}
              />
            )}
            <div className="max-h-48 overflow-y-auto">
              {groupsList.filter(g => g.name.toLowerCase().includes(groupSearch.trim().toLowerCase())).map(g => (
                <label key={g.id} className="flex items-center gap-2 py-1.5 cursor-pointer text-sm text-[var(--color-text-primary)]">
                  <input type="radio" name="dest" className={RADIO_CLS}
                    checked={destination === `group:${g.lineGroupId}`}
                    onChange={() => setDestination(`group:${g.lineGroupId}`)} />
                  <span>{g.name}</span>
                </label>
              ))}
              {groupsList.length === 0 && (
                <p className="text-xs text-[var(--color-text-muted)] py-1">Chưa có nhóm nào được ghi nhận.</p>
              )}
            </div>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 p-4 bg-[var(--color-bg-secondary)]/95 backdrop-blur-sm border-t border-[var(--color-border)] z-20">
          <button
            type="submit"
            disabled={submitting}
            className="w-full max-w-md mx-auto block bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold py-3.5 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center glow-accent"
          >
            {submitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : 'Tạo điểm danh'}
          </button>
        </div>
      </form>
    </div>
  );
}
