'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import liff from '@line/liff';
import type { Profile } from '@liff/get-profile';
import type { Context } from '@liff/store';
import { getVnDateKey } from '@/lib/dateUtils';

const INPUT_CLS = 'w-full px-3 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-active)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors';
const LABEL_CLS = 'block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5';
const CARD_CLS = 'glass rounded-2xl p-4';
const CARD_TITLE_CLS = 'text-sm font-bold text-[var(--color-text-primary)] border-l-4 border-[var(--color-accent)] pl-2 mb-4';

function getDefaultTime(): string {
  const d = new Date();
  d.setHours(d.getHours() + 2);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Suy ra "nơi chat" (nhóm/phòng/1:1) từ context LIFF — khớp đúng cách bot xác định chatKey/chatType
// (xem getChatKey/getChatType trong lib/bot/chatUtils.ts) để thẻ Flex gửi đúng nơi và trích dẫn được.
// Trả về null nếu mở form không phải từ trong 1 cuộc trò chuyện LINE thật (VD mở bằng trình duyệt
// thường) — trường hợp này không có "nơi chat" nào để gửi thẻ điểm danh vào.
function resolveChat(ctx: Context | null, userId: string): { chatKey: string; chatType: 'group' | 'room' | 'user' } | null {
  if (!ctx) return null;
  if (ctx.type === 'group' && ctx.groupId) return { chatKey: ctx.groupId, chatType: 'group' };
  if (ctx.type === 'room' && ctx.roomId) return { chatKey: ctx.roomId, chatType: 'room' };
  if (ctx.type === 'utou' && userId) return { chatKey: userId, chatType: 'user' };
  return null;
}

export default function LiffCheckinPage() {
  const router = useRouter();
  const [initialized, setInitialized] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [context, setContext] = useState<Context | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [time, setTime] = useState(getDefaultTime());

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
        setInitialized(true);
      } catch (err) {
        console.error('LIFF init error', err);
        setInitialized(true);
      }
    };
    initLiff();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !time) {
      alert('Vui lòng nhập tiêu đề và deadline.');
      return;
    }
    const chat = resolveChat(context, profile?.userId || '');
    if (!chat) {
      alert('Không xác định được nơi gửi. Vui lòng mở form này từ trong 1 cuộc trò chuyện LINE.');
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
          chatKey: chat.chatKey,
          chatType: chat.chatType,
        }),
      });
      if (!res.ok) throw new Error('Tạo điểm danh thất bại');

      // Điểm danh đã tạo thành công tại đây. Bước gửi tin xác nhận + đóng cửa sổ qua LIFF SDK tách
      // riêng try/catch — chỉ hoạt động khi mở đúng từ trong 1 cuộc trò chuyện LINE thật, nếu thất
      // bại sẽ KHÔNG bị báo nhầm thành "lỗi tạo điểm danh".
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

  const chat = resolveChat(context, profile?.userId || '');

  if (!chat) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-primary)] p-6">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-3">⚠️</div>
          <h1 className="text-base font-bold text-[var(--color-text-primary)] mb-2">Không mở được form ở đây</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">Vui lòng mở link này từ trong 1 cuộc trò chuyện LINE (nhóm hoặc chat riêng với bot) để tạo điểm danh.</p>
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
        <p className="text-sm text-[var(--color-text-secondary)] mb-2">
          Điểm danh sẽ được gửi vào {chat.chatType === 'group' ? 'nhóm hiện tại' : chat.chatType === 'room' ? 'phòng chat hiện tại' : 'cuộc trò chuyện này'}.
        </p>

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

        <button
          type="button"
          onClick={() => router.push('/liff/task')}
          className="w-full text-center text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent-hover)] transition-colors py-1"
        >
          📝 Chuyển sang Form Giao việc
        </button>

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
