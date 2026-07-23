import * as line from '@line/bot-sdk';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getVnDateKey, parseVnDeadline } from '@/lib/dateUtils';
import { buildMentionText, type MentionSegment } from './mentions';
import { getChatKey, getChatType, type LineReplyableEvent } from './chatUtils';

export interface CheckinParticipant {
  userId: string;
  name: string;
}

export interface Checkin {
  id?: string;
  title: string;
  // Lưu dạng chuỗi "YYYY-MM-DDTHH:mm" giống hệt Task.deadline, để tái dùng parseVnDeadline().
  deadline: string;
  creatorId: string;
  creatorName: string;
  chatKey: string;
  chatType: 'group' | 'room' | 'user';
  shortId: string;
  participants: CheckinParticipant[];
  status: 'open' | 'closed';
  flexQuoteToken?: string;
  // Đã gửi cảnh báo sắp tới hạn (mốc còn ~60 phút / ~30 phút) hay chưa — mỗi mốc chỉ gửi đúng 1 lần.
  reminder60Sent?: boolean;
  reminder30Sent?: boolean;
  createdAt: unknown;
  updatedAt: unknown;
}

/**
 * Phân tích cú pháp "/diemdanh <tiêu đề> /deadline <giờ>" (vd "21h00", "21h", "21:00").
 * Deadline luôn hiểu là HÔM NAY theo giờ VN — trả về null nếu không tìm thấy "/deadline" hợp lệ
 * hoặc tiêu đề rỗng.
 */
export function parseDiemDanhCommand(text: string): { title: string; deadline: string } | null {
  const deadlineMatch = /\/deadline\s+(\d{1,2})[h:](\d{2})?/i.exec(text);
  if (!deadlineMatch) return null;

  const hour = parseInt(deadlineMatch[1], 10);
  const minute = deadlineMatch[2] ? parseInt(deadlineMatch[2], 10) : 0;
  if (hour > 23 || minute > 59) return null;

  const title = text.slice(0, deadlineMatch.index).replace(/^\/diemdanh\s*/i, '').trim();
  if (!title) return null;

  const pad = (n: number) => n.toString().padStart(2, '0');
  const deadline = `${getVnDateKey()}T${pad(hour)}:${pad(minute)}`;
  return { title, deadline };
}

/** "2026-07-22T21:00" -> "21h00", để hiển thị đúng kiểu người dùng đã gõ. */
function formatDeadlineHM(deadline: string): string {
  const timePart = deadline.split('T')[1] || '';
  const [hh, mm] = timePart.split(':');
  return `${hh || '?'}h${mm || '00'}`;
}

function buildCheckinFlexMessage(params: {
  title: string;
  deadlineText: string;
  shortId: string;
  creatorName: string;
  participantCount: number;
}): line.messagingApi.FlexMessage {
  const { title, deadlineText, shortId, creatorName, participantCount } = params;
  return {
    type: 'flex',
    altText: `Điểm danh: ${title}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '🙋 ĐIỂM DANH', color: '#6366f1', weight: 'bold', size: 'xl' },
          { type: 'separator', margin: 'lg' },
          { type: 'text', text: title, weight: 'bold', size: 'md', wrap: true, margin: 'lg' },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'sm',
            contents: [
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                  { type: 'text', text: 'Người tạo', color: '#aaaaaa', size: 'sm', flex: 3 },
                  { type: 'text', text: creatorName, wrap: true, color: '#333333', size: 'sm', flex: 7, weight: 'bold' },
                ],
              },
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                  { type: 'text', text: 'Deadline', color: '#aaaaaa', size: 'sm', flex: 3 },
                  { type: 'text', text: deadlineText, wrap: true, color: '#ff4d4f', size: 'sm', flex: 7, weight: 'bold' },
                ],
              },
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                  { type: 'text', text: 'Đã điểm danh', color: '#aaaaaa', size: 'sm', flex: 3 },
                  { type: 'text', text: `${participantCount} người`, wrap: true, color: '#10b981', size: 'sm', flex: 7, weight: 'bold' },
                ],
              },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            height: 'sm',
            color: '#1db446',
            action: { type: 'postback', label: '✅ Hoàn tất', data: `action=diemdanh_done&cid=${shortId}` },
          },
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            action: { type: 'postback', label: '🙋 Điểm danh', data: `action=diemdanh_checkin&cid=${shortId}` },
          },
        ],
      },
    },
  };
}

/** Dựng nội dung danh sách điểm danh hiện tại, đúng theo mẫu người dùng yêu cầu. */
function buildRosterText(checkin: Checkin, prefix?: string): string {
  let text = prefix ? `${prefix}\n\n` : '';
  text += `${checkin.title}\n`;
  text += `Deadline: ${formatDeadlineHM(checkin.deadline)}\n`;
  text += `Hoàn tất: ${checkin.participants.length}\n\n`;
  text += `Đã hoàn tất:\n`;
  if (checkin.participants.length === 0) {
    text += 'Chưa có ai điểm danh.';
  } else {
    checkin.participants.forEach((p, i) => { text += `${i + 1}. ${p.name}\n`; });
  }
  return text.trimEnd();
}

/**
 * Tra tên hiển thị của người bấm nút: ưu tiên đọc từ collection users (đã học được qua tin nhắn
 * trước đó); nếu chưa có (vd người chỉ từng bấm nút, chưa từng nhắn tin) thì gọi thẳng API đúng
 * theo ngữ cảnh chat (group/room/user) để lấy tên thật, đồng thời lưu lại vào users cho lần sau.
 */
async function resolveDisplayName(
  userId: string,
  chatType: 'group' | 'room' | 'user',
  chatKey: string,
  client: line.messagingApi.MessagingApiClient
): Promise<string> {
  if (adminDb) {
    const snap = await adminDb.collection('users').where('lineUserId', '==', userId).limit(1).get();
    if (!snap.empty) return snap.docs[0].data().name || userId.slice(0, 8);
  }

  try {
    const profile = chatType === 'group'
      ? await client.getGroupMemberProfile(chatKey, userId)
      : chatType === 'room'
        ? await client.getRoomMemberProfile(chatKey, userId)
        : await client.getProfile(userId);

    if (profile?.displayName) {
      if (adminDb) {
        adminDb.collection('users').add({
          lineUserId: userId,
          name: profile.displayName,
          pictureUrl: profile.pictureUrl || '',
          role: 'member',
          createdAt: FieldValue.serverTimestamp(),
        }).catch((err) => console.error('Error saving user from checkin', err));
      }
      return profile.displayName;
    }
  } catch (err) {
    console.error('Error resolving display name for checkin', userId, err);
  }
  return userId.slice(0, 8);
}

/**
 * Lệnh /diemdanh <tiêu đề> /deadline <giờ>: bất kỳ ai cũng tạo được (không giới hạn admin).
 */
export async function handleDiemDanhCommand(
  text: string,
  event: line.webhook.MessageEvent,
  client: line.messagingApi.MessagingApiClient
) {
  if (!adminDb) return;

  const parsed = parseDiemDanhCommand(text);
  if (!parsed) {
    await client.replyMessage({
      replyToken: event.replyToken as string,
      messages: [{ type: 'text', text: '⚠️ Cú pháp: /diemdanh <tiêu đề> /deadline <giờ>\nVD: /diemdanh HOÀN TẤT BÀI TEST /deadline 21h00' }],
    });
    return;
  }

  const creatorId = event.source?.userId || 'unknown';
  const chatKey = getChatKey(event.source);
  const chatType = getChatType(event.source);
  const creatorName = await resolveDisplayName(creatorId, chatType, chatKey, client);

  const newCheckin: Checkin = {
    title: parsed.title,
    deadline: parsed.deadline,
    creatorId,
    creatorName,
    chatKey,
    chatType,
    shortId: '',
    participants: [],
    status: 'open',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const docRef = await adminDb.collection('checkins').add(newCheckin);
  const shortId = docRef.id.slice(-5);

  const flexMessage = buildCheckinFlexMessage({
    title: parsed.title,
    deadlineText: formatDeadlineHM(parsed.deadline),
    shortId,
    creatorName,
    participantCount: 0,
  });

  const response = await client.replyMessage({
    replyToken: event.replyToken as string,
    messages: [flexMessage],
  });

  const updates: Record<string, unknown> = { shortId };
  const flexSent = response.sentMessages[response.sentMessages.length - 1];
  if (flexSent?.quoteToken) updates.flexQuoteToken = flexSent.quoteToken;
  await docRef.update(updates);
}

/** Xử lý postback từ 2 nút trên thẻ điểm danh: "diemdanh_checkin" (điểm danh) và "diemdanh_done" (hoàn tất). */
export async function handleCheckinPostback(
  action: string,
  checkinId: string,
  event: LineReplyableEvent,
  client: line.messagingApi.MessagingApiClient
) {
  if (!adminDb) return;

  const snap = await adminDb.collection('checkins').where('shortId', '==', checkinId).limit(1).get();
  if (snap.empty) {
    await client.replyMessage({
      replyToken: event.replyToken as string,
      messages: [{ type: 'text', text: '⚠️ Không tìm thấy đợt điểm danh này.' }],
    });
    return;
  }

  const doc = snap.docs[0];
  const checkin = doc.data() as Checkin;
  const clickerId: string = event.source?.userId || '';

  if (action === 'diemdanh_done') {
    if (clickerId !== checkin.creatorId) {
      await client.replyMessage({
        replyToken: event.replyToken as string,
        messages: [{ type: 'text', text: `⚠️ Chỉ người tạo điểm danh "${checkin.title}" mới có thể bấm "Hoàn tất".` }],
      });
      return;
    }
    if (checkin.status === 'closed') {
      await client.replyMessage({
        replyToken: event.replyToken as string,
        messages: [buildMentionText([{ text: buildRosterText(checkin, 'ℹ️ Điểm danh này đã kết thúc trước đó.') }], checkin.flexQuoteToken)],
      });
      return;
    }

    await doc.ref.update({ status: 'closed', updatedAt: FieldValue.serverTimestamp() });
    await client.replyMessage({
      replyToken: event.replyToken as string,
      messages: [buildMentionText([{ text: buildRosterText(checkin, '🎉 Đã kết thúc điểm danh!') }], checkin.flexQuoteToken)],
    });
    return;
  }

  if (action === 'diemdanh_checkin') {
    if (checkin.status === 'closed') {
      await client.replyMessage({
        replyToken: event.replyToken as string,
        messages: [buildMentionText([{ text: buildRosterText(checkin, '⚠️ Điểm danh này đã kết thúc, không thể điểm danh thêm.') }], checkin.flexQuoteToken)],
      });
      return;
    }

    // Đã điểm danh trước đó rồi: im lặng bỏ qua, không phản hồi gì — tránh mỗi lần bấm lại (vô tình
    // bấm trùng) lại gửi thêm tin vào nhóm.
    if (checkin.participants.some((p) => p.userId === clickerId)) {
      return;
    }

    const name = await resolveDisplayName(clickerId, checkin.chatType, checkin.chatKey, client);
    const participants = [...checkin.participants, { userId: clickerId, name }];
    await doc.ref.update({ participants, updatedAt: FieldValue.serverTimestamp() });
    const updatedCheckin = { ...checkin, participants };

    await client.replyMessage({
      replyToken: event.replyToken as string,
      messages: [buildMentionText([{ text: buildRosterText(updatedCheckin) }], checkin.flexQuoteToken)],
    });
  }
}

/**
 * Gửi cảnh báo sắp tới hạn cho các đợt điểm danh còn mở (2 lần: còn ~60 phút và ~30 phút), tag
 * "@all" (chỉ có tác dụng trong nhóm/phòng, bỏ qua nếu tạo trong chat 1:1). Dùng cho cron.
 * Trả về số lượng đã gửi.
 */
export async function sendCheckinReminders(
  client: line.messagingApi.MessagingApiClient,
  now: number
): Promise<number> {
  if (!adminDb) return 0;

  const openSnap = await adminDb.collection('checkins').where('status', '==', 'open').get();
  let sentCount = 0;

  for (const doc of openSnap.docs) {
    const checkin = doc.data() as Checkin;
    const deadlineMs = parseVnDeadline(checkin.deadline);
    if (deadlineMs === null) continue;
    const minutesLeft = (deadlineMs - now) / 60000;

    let field: 'reminder60Sent' | 'reminder30Sent' | null = null;
    if (minutesLeft <= 60 && minutesLeft > 30 && !checkin.reminder60Sent) field = 'reminder60Sent';
    else if (minutesLeft <= 30 && minutesLeft > 0 && !checkin.reminder30Sent) field = 'reminder30Sent';
    if (!field) continue;

    const segments: MentionSegment[] = [];
    if (checkin.chatType !== 'user') segments.push({ mentionAll: true });
    segments.push({ text: ` ⏰ Còn khoảng ${Math.max(1, Math.round(minutesLeft))} phút nữa là tới hạn điểm danh "${checkin.title}"!\nAi chưa điểm danh vui lòng bấm nút "Điểm danh" ngay.` });

    try {
      await client.pushMessage({
        to: checkin.chatKey,
        messages: [buildMentionText(segments, checkin.flexQuoteToken)],
      });
      await doc.ref.update({ [field]: true });
      sentCount++;
    } catch (e) {
      console.error('Failed to send checkin reminder', doc.id, e);
    }
  }

  return sentCount;
}
