import * as line from '@line/bot-sdk';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Thụ động học: Lưu lại thông tin người dùng / nhóm mỗi khi có tin nhắn
 * Hàm này nên chạy ngầm (không await) để không block luồng trả lời chính.
 */
export async function captureUserProfile(
  event: line.webhook.MessageEvent,
  client: line.messagingApi.MessagingApiClient
) {
  if (!adminDb) return;
  const source = event.source as any;
  const userId = source.userId;
  const groupId = source.type === 'group' ? source.groupId : null;

  try {
    // 1. Capture User
    if (userId) {
      // Check if user already exists
      const userRef = adminDb.collection('users').where('lineUserId', '==', userId);
      const userSnap = await userRef.limit(1).get();
      
      if (userSnap.empty) {
        // Fetch from LINE
        const profile = await client.getProfile(userId).catch(() => null);
        if (profile) {
          await adminDb.collection('users').add({
            lineUserId: userId,
            name: profile.displayName,
            pictureUrl: profile.pictureUrl || '',
            role: 'member',
            createdAt: FieldValue.serverTimestamp(),
          });
        }
      }
    }

    // 2. Capture Group
    if (groupId) {
      const groupRef = adminDb.collection('groups').where('lineGroupId', '==', groupId);
      const groupSnap = await groupRef.limit(1).get();
      
      if (groupSnap.empty) {
        // Fetch from LINE
        const summary = await client.getGroupSummary(groupId).catch(() => null);
        if (summary) {
          await adminDb.collection('groups').add({
            lineGroupId: groupId,
            name: summary.groupName,
            pictureUrl: summary.pictureUrl || '',
            isMuted: false,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
      }
    }
  } catch (err) {
    console.error('Error in captureUserProfile:', err);
  }
}

/**
 * Lệnh /dongbo: Quét danh sách thành viên trong nhóm và lưu vào DB
 */
export async function handleDongboCommand(
  event: line.webhook.MessageEvent,
  client: line.messagingApi.MessagingApiClient
) {
  if (!adminDb) return;
  const source = event.source as any;
  const groupId = source.type === 'group' ? source.groupId : null;
  const replyToken = event.replyToken as string;

  if (!groupId) {
    await client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: '⚠️ Lệnh /dongbo chỉ có tác dụng khi dùng trong Nhóm.' }]
    });
    return;
  }

  try {
    // Thông báo đang đồng bộ
    await client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: '🔄 Đang đồng bộ danh sách nhân viên từ nhóm... Vui lòng chờ.' }]
    });

    let memberIds: string[] = [];
    let next: string | undefined = undefined;
    
    // Lặp để lấy hết ID
    do {
      const res: any = await client.getGroupMembersIds(groupId, next).catch(e => {
        console.error('getGroupMembersIds error', e);
        return null;
      });
      if (res && res.memberIds) {
        memberIds = memberIds.concat(res.memberIds);
        next = res.next;
      } else {
        break;
      }
    } while (next);

    if (memberIds.length === 0) {
      await client.pushMessage({
        to: groupId,
        messages: [{ type: 'text', text: '⚠️ Không thể lấy danh sách. Có thể bot chưa được cấp quyền hoặc thành viên chưa kết bạn với bot.' }]
      });
      return;
    }

    let addedCount = 0;
    
    // Lấy thông tin từng người và lưu
    for (const uId of memberIds) {
      const userRef = adminDb.collection('users').where('lineUserId', '==', uId);
      const userSnap = await userRef.limit(1).get();
      if (userSnap.empty) {
        // Fetch profile
        const profile = await client.getGroupMemberProfile(groupId, uId).catch(() => null);
        if (profile) {
          await adminDb.collection('users').add({
            lineUserId: uId,
            name: profile.displayName,
            pictureUrl: profile.pictureUrl || '',
            role: 'member',
            createdAt: FieldValue.serverTimestamp(),
          });
          addedCount++;
        }
      }
    }

    await client.pushMessage({
      to: groupId,
      messages: [{ 
        type: 'text', 
        text: `✅ Đã đồng bộ hoàn tất!\nTìm thấy ${memberIds.length} thành viên.\nĐã thêm ${addedCount} thành viên mới vào danh sách.` 
      }]
    });

  } catch (err) {
    console.error('Error in handleDongboCommand:', err);
    await client.pushMessage({
      to: groupId,
      messages: [{ type: 'text', text: '❌ Lỗi khi đồng bộ danh sách. Vui lòng thử lại sau.' }]
    });
  }
}
