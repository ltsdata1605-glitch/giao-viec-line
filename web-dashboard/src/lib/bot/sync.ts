import * as line from '@line/bot-sdk';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getVnDateKey } from '@/lib/dateUtils';

/**
 * Thụ động học: Lưu lại thông tin người dùng / nhóm mỗi khi có tin nhắn
 * Hàm này nên chạy ngầm (không await) để không block luồng trả lời chính.
 * Đồng thời đếm số lượt tương tác theo loại tin nhắn (text/image/sticker/...) cho thống kê Báo cáo.
 */
export async function captureUserProfile(
  event: line.webhook.MessageEvent,
  client: line.messagingApi.MessagingApiClient
) {
  if (!adminDb) return;
  const source = event.source as any;
  const userId = source.userId;
  const groupId = source.type === 'group' ? source.groupId : null;
  const roomId = source.type === 'room' ? source.roomId : null;
  // JoinEvent không có field message -> messageType null, chỉ capture profile, không đếm tương tác
  const messageType: string | null = (event as any).message?.type || null;

  try {
    // 1. Capture User + đếm tương tác theo người
    if (userId) {
      const userRef = adminDb.collection('users').where('lineUserId', '==', userId);
      const userSnap = await userRef.limit(1).get();

      let userDocRef = userSnap.empty ? null : userSnap.docs[0].ref;

      if (userSnap.empty) {
        // Trong nhóm/phòng chat PHẢI dùng getGroupMemberProfile/getRoomMemberProfile — getProfile()
        // chỉ trả về hồ sơ nếu người đó đã kết bạn 1:1 với bot, nên trước đây bỏ sót gần hết thành
        // viên chỉ tương tác trong nhóm mà chưa từng chat riêng với bot (getProfile() âm thầm lỗi 403).
        const profile = await (
          groupId ? client.getGroupMemberProfile(groupId, userId)
          : roomId ? client.getRoomMemberProfile(roomId, userId)
          : client.getProfile(userId)
        ).catch(() => null);
        if (profile) {
          userDocRef = await adminDb.collection('users').add({
            lineUserId: userId,
            name: profile.displayName,
            pictureUrl: profile.pictureUrl || '',
            role: 'member',
            createdAt: FieldValue.serverTimestamp(),
          });
        }
      }

      if (userDocRef && messageType) {
        await userDocRef.update({
          [`interactionCounts.${messageType}`]: FieldValue.increment(1),
          interactionTotal: FieldValue.increment(1),
          lastInteractionAt: FieldValue.serverTimestamp(),
        }).catch((err) => console.error('Error updating user interaction counters', err));
      }
    }

    // 2. Capture Group + đếm tương tác theo nhóm
    if (groupId) {
      const groupRef = adminDb.collection('groups').where('lineGroupId', '==', groupId);
      const groupSnap = await groupRef.limit(1).get();

      let groupDocRef = groupSnap.empty ? null : groupSnap.docs[0].ref;

      if (groupSnap.empty) {
        // Fetch from LINE
        const summary = await client.getGroupSummary(groupId).catch(e => {
          console.log('Cannot fetch group summary, using fallback', e);
          return null;
        });

        groupDocRef = await adminDb.collection('groups').add({
          lineGroupId: groupId,
          name: summary ? summary.groupName : `Nhóm ${groupId.substring(0, 6)}`,
          pictureUrl: summary ? (summary.pictureUrl || '') : '',
          isMuted: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      if (groupDocRef && messageType) {
        await groupDocRef.update({
          [`interactionCounts.${messageType}`]: FieldValue.increment(1),
          interactionTotal: FieldValue.increment(1),
        }).catch((err) => console.error('Error updating group interaction counters', err));
      }
    }

    // 3. Gộp thống kê tương tác toàn hệ thống theo ngày, phục vụ biểu đồ xu hướng ở trang Báo cáo
    if (messageType) {
      await adminDb.collection('dailyInteractions').doc(getVnDateKey()).set({
        [messageType]: FieldValue.increment(1),
        total: FieldValue.increment(1),
      }, { merge: true }).catch((err) => console.error('Error updating dailyInteractions', err));
    }

    // 4. Đếm tương tác theo ngày cho từng người, phục vụ lệnh /baocao xem theo tuần/tháng
    // (interactionTotal ở bước 1 chỉ là tổng dồn từ trước đến nay, không tách được theo kỳ).
    if (userId && messageType) {
      const dateKey = getVnDateKey();
      await adminDb.collection('userDailyInteractions').doc(`${userId}_${dateKey}`).set({
        lineUserId: userId,
        date: dateKey,
        total: FieldValue.increment(1),
      }, { merge: true }).catch((err) => console.error('Error updating userDailyInteractions', err));
    }

    // 5. Đếm tương tác theo ngày cho từng người TRONG TỪNG NHÓM riêng biệt, phục vụ /tuongtac khi gõ
    // trong 1 nhóm cụ thể chỉ báo cáo đúng nhóm đó (thay vì gộp toàn hệ thống như userDailyInteractions).
    if (userId && groupId && messageType) {
      const dateKey = getVnDateKey();
      await adminDb.collection('groupUserDailyInteractions').doc(`${groupId}_${userId}_${dateKey}`).set({
        groupId,
        lineUserId: userId,
        date: dateKey,
        total: FieldValue.increment(1),
      }, { merge: true }).catch((err) => console.error('Error updating groupUserDailyInteractions', err));
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
