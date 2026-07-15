import { adminDb } from '@/lib/firebase-admin';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import * as line from '@line/bot-sdk';

const DEFAULT_KEYWORDS = ['21707', '22094', '21453'];

export async function getPmhKeywords(): Promise<string[]> {
  try {
    if (adminDb) {
      const docRef = adminDb.collection('settings').doc('pmhConfig');
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        const data = docSnap.data();
        if (data && Array.isArray(data.keywords)) {
          return data.keywords;
        }
      } else {
        // Init with defaults
        await docRef.set({ keywords: DEFAULT_KEYWORDS });
      }
    } else {
      // Fallback to client sdk if needed
      const docRef = doc(db, 'settings', 'pmhConfig');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && Array.isArray(data.keywords)) {
          return data.keywords;
        }
      }
    }
  } catch (err) {
    console.error('Error fetching PMH keywords:', err);
  }
  return DEFAULT_KEYWORDS;
}

export async function handlePmhAdminCommand(text: string, event: line.webhook.MessageEvent, client: line.messagingApi.MessagingApiClient) {
  const source = event.source as any;
  if (!adminDb || !event.replyToken || !source || !source.userId) return;

  const userId = source.userId;
  
  // 1. Kiểm tra quyền Admin
  let isAdmin = false;
  try {
    const userSnap = await adminDb.collection('users').where('lineUserId', '==', userId).limit(1).get();
    if (!userSnap.empty) {
      const userData = userSnap.docs[0].data();
      if (userData.role === 'admin') {
        isAdmin = true;
      }
    }
  } catch (err) {
    console.error('Error checking admin role:', err);
  }

  if (!isAdmin) {
    await client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: '❌ Bạn không có quyền sử dụng lệnh này. Vui lòng liên hệ quản trị viên để cập nhật role thành "admin" trên Firebase.' }]
    });
    return;
  }

  // 2. Phân tích lệnh
  const args = text.split(/\s+/);
  const command = args[0].toLowerCase(); // 'pmh'
  const action = args[1] ? args[1].toLowerCase() : '';
  const keyword = args.slice(2).join(' ').trim();

  const docRef = adminDb.collection('settings').doc('pmhConfig');
  const currentKeywords = await getPmhKeywords();

  try {
    if (action === 'add') {
      if (!keyword) {
        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: '❌ Bạn chưa nhập từ khoá. Cú pháp: pmh add <từ_khoá>' }]
        });
        return;
      }
      if (currentKeywords.includes(keyword)) {
        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: `⚠️ Từ khoá "${keyword}" đã tồn tại trong danh sách.` }]
        });
        return;
      }
      
      const newKeywords = [...currentKeywords, keyword];
      await docRef.set({ keywords: newKeywords }, { merge: true });
      
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: `✅ Đã thêm từ khoá "${keyword}" thành công!\n\nDanh sách hiện tại:\n${newKeywords.map(k => `- ${k}`).join('\n')}` }]
      });

    } else if (action === 'remove' || action === 'xoa') {
      if (!keyword) {
        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: '❌ Bạn chưa nhập từ khoá. Cú pháp: pmh remove <từ_khoá>' }]
        });
        return;
      }
      if (!currentKeywords.includes(keyword)) {
        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: `⚠️ Không tìm thấy từ khoá "${keyword}" trong danh sách.` }]
        });
        return;
      }

      const newKeywords = currentKeywords.filter(k => k !== keyword);
      await docRef.set({ keywords: newKeywords }, { merge: true });

      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: `✅ Đã xoá từ khoá "${keyword}" thành công!\n\nDanh sách hiện tại:\n${newKeywords.map(k => `- ${k}`).join('\n')}` }]
      });

    } else {
      // Default: show list and instructions
      const guideText = `⚙️ HƯỚNG DẪN QUẢN LÝ LỌC PMH\n\n` +
                        `Danh sách từ khoá hiện tại:\n${currentKeywords.map(k => `- ${k}`).join('\n')}\n\n` +
                        `Các lệnh hỗ trợ:\n` +
                        `1. Thêm từ khoá mới:\n` +
                        `👉 Cú pháp: pmh add <từ khoá>\n` +
                        `👉 Ví dụ: pmh add 99999\n\n` +
                        `2. Xoá từ khoá:\n` +
                        `👉 Cú pháp: pmh remove <từ khoá>\n` +
                        `👉 Ví dụ: pmh remove 21707`;
                        
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: guideText }]
      });
    }
  } catch (err) {
    console.error('Error handling PMH admin command:', err);
    await client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: '❌ Có lỗi xảy ra khi cập nhật dữ liệu. Vui lòng thử lại sau.' }]
    });
  }
}
