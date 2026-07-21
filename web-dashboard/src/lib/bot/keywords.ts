import * as line from '@line/bot-sdk';
import { adminDb } from '@/lib/firebase-admin';
// Fallback to client sdk if admin is not configured yet (during development)
import { db } from '@/lib/firebase';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';

export async function getReplyFromFirebase(keyword: string) {
  try {
    const term = keyword.trim().toLowerCase();

    // Prefer Admin SDK if available
    if (adminDb) {
      const snapshot = await adminDb.collection('keywords')
        .where('keyword', '==', term)
        .limit(1)
        .get();

      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        let image_urls: string[] = [];
        if (data.image_urls && Array.isArray(data.image_urls) && data.image_urls.length > 0) {
          image_urls = data.image_urls;
        } else if (data.image_url) {
          image_urls = [data.image_url];
        }

        return {
          reply_text: data.reply_text || '',
          image_urls: image_urls
        };
      }
    } else {
      // Fallback to Client SDK
      const q = query(collection(db, 'keywords'), where('keyword', '==', term), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const data = snap.docs[0].data();
        let image_urls: string[] = [];
        if (data.image_urls && Array.isArray(data.image_urls) && data.image_urls.length > 0) {
          image_urls = data.image_urls;
        } else if (data.image_url) {
          image_urls = [data.image_url];
        }

        return {
          reply_text: data.reply_text || '',
          image_urls: image_urls
        };
      }
    }
  } catch (error) {
    console.error('Error fetching keyword from Firebase:', error);
  }
  return null;
}

/**
 * Lệnh /tukhoa: liệt kê toàn bộ từ khoá đã cấu hình trong Dashboard > Từ khoá Bot, kèm xem trước
 * nội dung phản hồi, để người dùng biết có thể gõ gì để nhận thông tin tự động. Không giới hạn
 * admin vì từ khoá vốn để tra cứu thông tin chung (khuyến mãi, hướng dẫn...) trong nhóm.
 */
export async function handleTuKhoaCommand(
  event: line.webhook.MessageEvent,
  client: line.messagingApi.MessagingApiClient
) {
  let text = '🏷️ DANH SÁCH TỪ KHOÁ BOT\n\nGõ đúng từ khoá để nhận phản hồi tự động:\n\n';

  try {
    if (!adminDb) {
      text += 'Chưa cấu hình cơ sở dữ liệu.';
    } else {
      const snap = await adminDb.collection('keywords').get();
      if (snap.empty) {
        text += 'Chưa có từ khoá nào được cấu hình.';
      } else {
        snap.docs
          .map((doc) => doc.data())
          .sort((a, b) => (a.keyword || '').localeCompare(b.keyword || ''))
          .forEach((kw) => {
            const preview = (kw.reply_text || '').replace(/\s+/g, ' ').trim();
            const truncated = preview.length > 40 ? preview.slice(0, 40) + '...' : preview;
            text += `#${kw.keyword} — ${truncated}\n`;
          });
      }
    }
  } catch (error) {
    console.error('Error listing keywords:', error);
    text += 'Không thể tải danh sách lúc này, vui lòng thử lại sau.';
  }

  text += '\n💡 Gõ /help để xem các lệnh khác của Bot.';

  await client.replyMessage({
    replyToken: event.replyToken as string,
    messages: [{ type: 'text', text }]
  });
}
