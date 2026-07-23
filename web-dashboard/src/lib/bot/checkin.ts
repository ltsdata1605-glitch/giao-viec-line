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
  // Nội dung chi tiết tuỳ chọn (VD: danh sách link cần like/share) — gửi kèm 1 tin nhắn văn bản riêng
  // (không phải thẻ Flex) để LINE tự nhận diện link thành dạng bấm mở được.
  content?: string;
  flexQuoteToken?: string;
  // Đã gửi cảnh báo sắp tới hạn (mốc còn ~60 phút / ~30 phút) hay chưa — mỗi mốc chỉ gửi đúng 1 lần.
  reminder60Sent?: boolean;
  reminder30Sent?: boolean;
  createdAt: unknown;
  updatedAt: unknown;
}

/**
 * Phân tích cú pháp "/diemdanh <tiêu đề> [/noidung <nội dung>] /deadline <giờ>" (vd "21h00", "21h",
 * "21:00"). Phần "/noidung" tuỳ chọn, có thể xuống dòng nhiều lần (VD danh sách link) — tách theo vị
 * trí "/noidung"/"/deadline" trong toàn bộ chuỗi (không bắt buộc mỗi lệnh phải nằm riêng 1 dòng) nên
 * vẫn tương thích với cú pháp cũ gõ gọn trên 1 dòng "/diemdanh <tiêu đề> /deadline <giờ>".
 * Deadline luôn hiểu là HÔM NAY theo giờ VN — trả về null nếu không tìm thấy "/deadline" hợp lệ
 * hoặc tiêu đề rỗng.
 */
export function parseDiemDanhCommand(text: string): { title: string; content: string; deadline: string } | null {
  const deadlineMatch = /\/deadline\s+(\d{1,2})[h:](\d{2})?/i.exec(text);
  if (!deadlineMatch) return null;

  const hour = parseInt(deadlineMatch[1], 10);
  const minute = deadlineMatch[2] ? parseInt(deadlineMatch[2], 10) : 0;
  if (hour > 23 || minute > 59) return null;

  const beforeDeadline = text.slice(0, deadlineMatch.index);
  const noidungMatch = /\/noidung\s*/i.exec(beforeDeadline);

  let title: string;
  let content = '';
  if (noidungMatch) {
    title = beforeDeadline.slice(0, noidungMatch.index).replace(/^\/diemdanh\s*/i, '').trim();
    content = beforeDeadline.slice(noidungMatch.index + noidungMatch[0].length).trim();
  } else {
    title = beforeDeadline.replace(/^\/diemdanh\s*/i, '').trim();
  }
  if (!title) return null;

  const pad = (n: number) => n.toString().padStart(2, '0');
  const deadline = `${getVnDateKey()}T${pad(hour)}:${pad(minute)}`;
  return { title, content, deadline };
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
      messages: [{
        type: 'text',
        text: '⚠️ Cú pháp: /diemdanh <tiêu đề>\n/noidung <nội dung, có thể nhiều dòng, ví dụ danh sách link> (không bắt buộc)\n/deadline <giờ>\n\nVD:\n/diemdanh HOÀN TẤT LIKE VÀ SHARE BÀI\n/noidung Link:\n1. https://...\n2. https://...\n/deadline 20h00'
      }],
    });
    return;
  }

  const creatorId = event.source?.userId || 'unknown';
  const chatKey = getChatKey(event.source);
  const chatType = getChatType(event.source);
  const creatorName = await resolveDisplayName(creatorId, chatType, chatKey, client);

  const newCheckin: Checkin = {
    title: parsed.title,
    content: parsed.content,
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

  // Thẻ Flex giữ nguyên như cũ (tiêu đề/deadline/nút bấm); nếu có "/noidung" thì gửi kèm 1 tin nhắn
  // văn bản thường ngay sau đó — LINE tự nhận diện link trong tin nhắn thường thành dạng bấm mở được,
  // trong khi khối text của thẻ Flex thì không tự làm được điều này.
  const messagesToSend: line.messagingApi.Message[] = [flexMessage];
  if (parsed.content) {
    messagesToSend.push({
      type: 'text',
      text: `${parsed.title}\n\n${parsed.content}\nDeadline: ${formatDeadlineHM(parsed.deadline)}`,
    });
  }

  const response = await client.replyMessage({
    replyToken: event.replyToken as string,
    messages: messagesToSend,
  });

  const updates: Record<string, unknown> = { shortId };
  // Thẻ Flex luôn là tin đầu tiên trong mảng gửi đi (bất kể có gửi kèm tin nội dung hay không) nên
  // quote token của nó luôn nằm ở index 0 — dùng để trích dẫn lại đúng thẻ Flex (không phải tin nội
  // dung) khi nhắc nhở sắp tới hạn hoặc phản hồi điểm danh sau này.
  const flexSent = response.sentMessages[0];
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
  const initialCheckin = doc.data() as Checkin;
  const clickerId: string = event.source?.userId || '';

  if (action === 'diemdanh_done') {
    if (clickerId !== initialCheckin.creatorId) {
      await client.replyMessage({
        replyToken: event.replyToken as string,
        messages: [{ type: 'text', text: `⚠️ Chỉ người tạo điểm danh "${initialCheckin.title}" mới có thể bấm "Hoàn tất".` }],
      });
      return;
    }

    // Đọc trạng thái mới nhất + ghi trong CÙNG 1 transaction để tránh 2 lượt bấm gần như đồng thời
    // (VD người tạo bấm 2 lần liên tiếp) cùng đọc status "open" trước khi lượt kia ghi xong, dẫn đến
    // cả 2 đều gửi tin "Đã kết thúc điểm danh!" trùng lặp.
    type DoneOutcome = { kind: 'already-closed'; checkin: Checkin } | { kind: 'closed'; checkin: Checkin };
    const outcome: DoneOutcome = await adminDb.runTransaction(async (tx) => {
      const s = await tx.get(doc.ref);
      const c = s.data() as Checkin;
      if (c.status === 'closed') return { kind: 'already-closed', checkin: c };
      tx.update(doc.ref, { status: 'closed', updatedAt: FieldValue.serverTimestamp() });
      return { kind: 'closed', checkin: { ...c, status: 'closed' } };
    });

    const prefix = outcome.kind === 'already-closed' ? 'ℹ️ Điểm danh này đã kết thúc trước đó.' : '🎉 Đã kết thúc điểm danh!';
    await client.replyMessage({
      replyToken: event.replyToken as string,
      messages: [buildMentionText([{ text: buildRosterText(outcome.checkin, prefix) }], initialCheckin.flexQuoteToken)],
    });
    return;
  }

  if (action === 'diemdanh_checkin') {
    if (initialCheckin.status === 'closed') {
      await client.replyMessage({
        replyToken: event.replyToken as string,
        messages: [buildMentionText([{ text: buildRosterText(initialCheckin, '⚠️ Điểm danh này đã kết thúc, không thể điểm danh thêm.') }], initialCheckin.flexQuoteToken)],
      });
      return;
    }

    // Đã điểm danh trước đó rồi: im lặng bỏ qua, không phản hồi gì — tránh mỗi lần bấm lại (vô tình
    // bấm trùng) lại gửi thêm tin vào nhóm. Đây chỉ là kiểm tra nhanh theo dữ liệu vừa đọc để khỏi tốn
    // công tra tên/vào transaction cho trường hợp phổ biến; transaction bên dưới mới là nơi kiểm tra
    // chính xác cuối cùng.
    if (initialCheckin.participants.some((p) => p.userId === clickerId)) {
      return;
    }

    const name = await resolveDisplayName(clickerId, initialCheckin.chatType, initialCheckin.chatKey, client);

    // Đọc danh sách điểm danh mới nhất + ghi thêm người trong CÙNG 1 transaction — tránh mất dữ liệu
    // khi 2 người bấm "Điểm danh" gần như đồng thời: nếu chỉ đọc-rồi-ghi thường (không transaction),
    // cả 2 request có thể cùng đọc chung 1 danh sách cũ trước khi request kia ghi xong, khiến người
    // ghi sau "ghi đè" mất luôn người ghi trước khỏi danh sách.
    type CheckinOutcome = { kind: 'closed'; checkin: Checkin } | { kind: 'silent' } | { kind: 'added'; checkin: Checkin };
    const outcome: CheckinOutcome = await adminDb.runTransaction(async (tx) => {
      const s = await tx.get(doc.ref);
      const c = s.data() as Checkin;
      if (c.status === 'closed') return { kind: 'closed', checkin: c };
      if (c.participants.some((p) => p.userId === clickerId)) return { kind: 'silent' };
      const participants = [...c.participants, { userId: clickerId, name }];
      tx.update(doc.ref, { participants, updatedAt: FieldValue.serverTimestamp() });
      return { kind: 'added', checkin: { ...c, participants } };
    });

    if (outcome.kind === 'silent') return;

    if (outcome.kind === 'closed') {
      await client.replyMessage({
        replyToken: event.replyToken as string,
        messages: [buildMentionText([{ text: buildRosterText(outcome.checkin, '⚠️ Điểm danh này đã kết thúc, không thể điểm danh thêm.') }], initialCheckin.flexQuoteToken)],
      });
      return;
    }

    await client.replyMessage({
      replyToken: event.replyToken as string,
      messages: [buildMentionText([{ text: buildRosterText(outcome.checkin) }], initialCheckin.flexQuoteToken)],
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
