import { adminDb } from '@/lib/firebase-admin';
import * as line from '@line/bot-sdk';
import { FieldValue } from 'firebase-admin/firestore';
import { isAdmin } from './admin';
import { parseGiaoDeadline, parseGiaoPriority, stripMatchedText } from './giaoParser';

// Vòng đời trạng thái task thống nhất giữa bot, dashboard và cron:
// Chờ gửi (đã tạo, hẹn giờ gửi) -> Chưa làm (đã gửi, chưa ai nhận) -> Đang làm (đã có người nhận)
// -> Hoàn thành | Đã hủy | Quá hạn (deadline trôi qua mà chưa xong)
export type TaskStatus = 'Chờ gửi' | 'Chưa làm' | 'Đang làm' | 'Hoàn thành' | 'Quá hạn' | 'Đã hủy';

// Các trạng thái "kết thúc": không cho phép chuyển tiếp sang trạng thái khác qua lệnh bot nữa
export const FINAL_TASK_STATUSES: TaskStatus[] = ['Hoàn thành', 'Đã hủy'];

export interface Task {
  id?: string;
  name: string;
  groupId: string;
  groupIds?: string[];
  assignees: string[]; // User IDs (or LINE user IDs/mentions)
  creatorId: string;
  status: TaskStatus;
  // Khớp đúng các giá trị dashboard thực tế dùng (PRIORITY_LIST trong tasks/page.tsx)
  priority: 'Bình thường' | 'Quan trọng' | 'GẤP';
  // Lưu dạng chuỗi "YYYY-MM-DDTHH:mm" (từ input datetime-local) trên toàn dự án, không phải đối tượng Date
  deadline: string | null;
  createdAt: any;
  updatedAt: any;
  // ID rút gọn (5 ký tự cuối của docId) để tra cứu nhanh qua lệnh bot, tránh phải quét toàn bộ collection.
  shortId?: string;
  // Quote token của thẻ Flex công việc đã gửi, theo từng nơi nhận (groupId/roomId/userId).
  // Dùng để trả lời trích dẫn (quote reply) lại đúng thẻ Flex khi công việc hoàn thành.
  flexQuoteTokens?: Record<string, string>;
  // Tần suất nhắc lại, dạng "15" (phút) hoặc "2 Giờ" tuỳ nơi tạo task. Dùng parseReminderMinutes() để đọc.
  reminderFrequency?: string;
  // Mốc thời gian (epoch ms) lần nhắc gần nhất, để cron biết đã tới lượt nhắc tiếp theo chưa.
  lastReminderAt?: number;
}

/**
 * Đoạn nội dung tin nhắn textV2: hoặc văn bản thường, hoặc một lượt tag (mention) một user.
 */
type MentionSegment = { text: string } | { mentionUserId: string };

/**
 * Dựng tin nhắn textV2 từ danh sách đoạn văn bản/tag, dùng chung cho mọi luồng cần tag người dùng.
 * LINE chỉ hỗ trợ tag (mention) chủ động qua type "textV2" + substitution, không phải type "text".
 */
function buildMentionText(segments: MentionSegment[], quoteToken?: string): line.messagingApi.TextMessageV2 {
  let text = '';
  const substitution: Record<string, line.messagingApi.MentionSubstitutionObject> = {};
  let counter = 0;

  for (const seg of segments) {
    if ('mentionUserId' in seg) {
      const key = `m${counter++}`;
      substitution[key] = { type: 'mention', mentionee: { type: 'user', userId: seg.mentionUserId } };
      text += `{${key}}`;
    } else {
      text += seg.text;
    }
  }

  return {
    type: 'textV2',
    text,
    substitution,
    ...(quoteToken ? { quoteToken } : {})
  };
}

/**
 * Xác định "nơi chat" (group/room/user) từ event.source, dùng làm key lưu quoteToken theo từng cuộc trò chuyện
 * vì quoteToken chỉ dùng trích dẫn được trong đúng cuộc trò chuyện đã nhận tin nhắn đó.
 */
function getChatKey(source: any): string {
  if (!source) return 'unknown';
  if (source.type === 'group') return source.groupId;
  if (source.type === 'room') return source.roomId;
  return source.userId || 'unknown';
}

/**
 * Tra cứu tên hiển thị của user theo LINE ID, mặc định trả về 'Admin' nếu không có.
 */
export async function getUserDisplayName(userId?: string): Promise<string> {
  if (!adminDb || !userId || userId === 'unknown') return 'Admin';
  const snap = await adminDb.collection('users').where('lineUserId', '==', userId).limit(1).get();
  if (!snap.empty) {
    return snap.docs[0].data().name;
  }
  return 'Admin';
}

/**
 * Dựng tin nhắn tag (mention) danh sách người nhận việc (dùng chung cho lệnh /giao và API notify-task).
 * Trả về null nếu không có ai được mention hợp lệ (ID bắt đầu bằng 'U').
 */
export function buildAssigneeMentionMessage(assignees: string[]): line.messagingApi.TextMessageV2 | null {
  const validIds = assignees.filter(id => id.startsWith('U')); // valid LINE ID check

  if (validIds.length === 0) return null;

  const segments: MentionSegment[] = validIds.map(userId => ({ mentionUserId: userId }));
  segments.push({ text: ' Vui lòng đọc kỹ nội dung, thời gian hoàn tất và hình thức báo cáo!' });

  return buildMentionText(segments);
}

/**
 * Dựng tin nhắn nhắc lại công việc chưa hoàn thành, tag người nhận việc, kèm trích dẫn thẻ Flex gốc nếu có.
 */
export function buildTaskReminderMessage(taskName: string, assignees: string[], quoteToken?: string): line.messagingApi.TextMessageV2 {
  const validIds = assignees.filter(id => id.startsWith('U'));
  const segments: MentionSegment[] = validIds.map(userId => ({ mentionUserId: userId }));
  segments.push({ text: ` ⏰ Nhắc nhở: công việc "${taskName}" vẫn chưa hoàn thành, vui lòng xử lý sớm!` });
  return buildMentionText(segments, quoteToken);
}

/**
 * Dựng tin nhắn leo thang gửi riêng cho người giao việc khi công việc đã quá hạn mà chưa hoàn thành.
 */
export function buildTaskEscalationMessage(taskName: string, creatorId: string, assigneeText: string): line.messagingApi.TextMessageV2 {
  const segments: MentionSegment[] = [];
  if (creatorId.startsWith('U')) segments.push({ mentionUserId: creatorId });
  segments.push({ text: ` 🔴 Công việc "${taskName}" giao cho ${assigneeText} đã QUÁ HẠN mà chưa hoàn thành. Vui lòng kiểm tra và nhắc nhở!` });
  return buildMentionText(segments);
}

/**
 * Đọc tần suất nhắc lại (phút) từ chuỗi lưu trên task, hỗ trợ cả "15" (mặc định phút) lẫn "15 Phút"/"2 Giờ".
 * Trả về null nếu không cấu hình hoặc không hợp lệ (không nhắc).
 */
export function parseReminderMinutes(raw: unknown): number | null {
  if (!raw || typeof raw !== 'string') return null;
  const match = /(\d+)\s*(phút|giờ)?/i.exec(raw.trim());
  if (!match) return null;
  const n = parseInt(match[1], 10);
  if (!n || n <= 0) return null;
  const unit = (match[2] || 'phút').toLowerCase();
  return unit === 'giờ' ? n * 60 : n;
}

/**
 * Định dạng chuỗi deadline "YYYY-MM-DDTHH:mm" thành "DD/MM HH:mm" để hiển thị trên thẻ Flex.
 * Trả về undefined nếu không có deadline (builder sẽ tự hiện "Không có").
 */
function formatDeadlineDisplay(deadline?: string | null): string | undefined {
  if (!deadline) return undefined;
  const [datePart, timePart] = deadline.split('T');
  const [year, month, day] = datePart.split('-');
  return timePart ? `${day}/${month} ${timePart}` : `${day}/${month}/${year}`;
}

/**
 * Dựng Flex Message thẻ công việc (dùng chung cho lệnh /giao và API notify-task).
 */
export function buildTaskFlexMessage(params: {
  taskName: string;
  shortId: string;
  creatorName: string;
  assigneeText: string;
  deadlineText?: string;
  acceptanceText?: string;
  description?: string;
  // Chỉ hiện dòng "Ưu tiên" khi có giá trị (vd "GẤP"/"Quan trọng"), ẩn với việc mức "Bình thường" cho gọn thẻ
  priorityText?: string;
}): line.messagingApi.FlexMessage {
  const { taskName, shortId, creatorName, assigneeText, deadlineText, acceptanceText, description, priorityText } = params;

  const bodyContents: any[] = [
    { type: 'text', text: '🎯 CÔNG VIỆC SIÊU THỊ', color: '#1db446', weight: 'bold', size: 'xl' },
    { type: 'separator', margin: 'lg' },
    { type: 'text', text: taskName, weight: 'bold', size: 'md', wrap: true, margin: 'lg' }
  ];

  if (description) {
    bodyContents.push({
      type: 'text',
      text: description,
      color: '#666666',
      size: 'sm',
      wrap: true,
      margin: 'md'
    });
  }

  const infoRows: any[] = [
    {
      type: 'box',
      layout: 'baseline',
      spacing: 'sm',
      contents: [
        { type: 'text', text: 'Người giao', color: '#aaaaaa', size: 'sm', flex: 3 },
        { type: 'text', text: creatorName, wrap: true, color: '#333333', size: 'sm', flex: 7, weight: 'bold' }
      ]
    },
    {
      type: 'box',
      layout: 'baseline',
      spacing: 'sm',
      contents: [
        { type: 'text', text: 'Người nhận', color: '#aaaaaa', size: 'sm', flex: 3 },
        { type: 'text', text: assigneeText, wrap: true, color: '#333333', size: 'sm', flex: 7, weight: 'bold' }
      ]
    },
    {
      type: 'box',
      layout: 'baseline',
      spacing: 'sm',
      contents: [
        { type: 'text', text: 'Deadline', color: '#aaaaaa', size: 'sm', flex: 3 },
        { type: 'text', text: deadlineText || 'Không có', wrap: true, color: '#ff4d4f', size: 'sm', flex: 7, weight: 'bold' }
      ]
    },
    {
      type: 'box',
      layout: 'baseline',
      spacing: 'sm',
      contents: [
        { type: 'text', text: 'Nghiệm thu', color: '#aaaaaa', size: 'sm', flex: 3 },
        { type: 'text', text: acceptanceText || 'Bấm hoàn tất', wrap: true, color: '#1db446', size: 'sm', flex: 7, weight: 'bold' }
      ]
    }
  ];

  if (priorityText) {
    infoRows.push({
      type: 'box',
      layout: 'baseline',
      spacing: 'sm',
      contents: [
        { type: 'text', text: '⚡ Ưu tiên', color: '#ff4d4f', size: 'sm', flex: 3, weight: 'bold' },
        { type: 'text', text: priorityText, wrap: true, color: '#ff4d4f', size: 'sm', flex: 7, weight: 'bold' }
      ]
    });
  }

  bodyContents.push({
    type: 'box',
    layout: 'vertical',
    margin: 'lg',
    spacing: 'sm',
    contents: infoRows
  });

  return {
    type: 'flex',
    altText: `Nhiệm vụ mới: ${taskName}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: bodyContents
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
            action: { type: 'postback', label: '✅ Hoàn tất', data: `action=xong&taskId=${shortId}` }
          },
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            action: { type: 'postback', label: 'Nhận việc', data: `action=nhan&taskId=${shortId}` }
          }
        ]
      }
    }
  };
}

/**
 * Handle "/giao" command
 * Syntax: /giao [Task Name] @[User] [Deadline]
 */
export async function handleGiaoCommand(
  text: string,
  event: line.webhook.MessageEvent,
  client: line.messagingApi.MessagingApiClient
) {
  // Extract task details from text
  const parts = text.split('\n');
  const firstLine = parts[0];
  let taskName = firstLine.replace('/giao', '').trim();

  if (!taskName) {
    const liffUrl = process.env.NEXT_PUBLIC_LIFF_URL || `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}`;
    await client.replyMessage({
      replyToken: event.replyToken as string,
      messages: [
        {
          type: 'template',
          altText: 'Vui lòng mở Form trên điện thoại để Giao Việc.',
          template: {
            type: 'buttons',
            text: 'Bấm vào nút bên dưới để mở Form Giao Việc nhanh chóng:',
            actions: [
              {
                type: 'uri',
                label: '📝 Mở Form Giao Việc',
                uri: liffUrl
              }
            ]
          }
        }
      ]
    });
    return;
  }

  // Detect assignees (In LINE, mentions are usually provided in event.message.mention)
  const message = event.message as line.webhook.TextMessageContent;
  let assignees: string[] = [];
  let assigneeNames: string[] = [];

  if (message.mention && message.mention.mentionees) {
    message.mention.mentionees.forEach(m => {
      if (m.type === 'user' && (m as any).userId) {
        assignees.push((m as any).userId);
        // We could fetch user profile if needed
      }
    });
  }

  if (assignees.length === 0) {
    // If no mentions, try to parse from text (e.g. "@Name") - simpler fallback
    const mentionMatch = text.match(/@(\S+)/g);
    if (mentionMatch) {
      assigneeNames = mentionMatch.map(m => m.substring(1));
      // Without DB of names->LINE ID, we just store names as assignees for now
      assignees = [...assigneeNames];
    }
  }

  // Nhận diện nhanh hạn chót + độ ưu tiên ngay trong dòng lệnh, không bắt buộc phải mở Form LIFF
  const parsedDeadline = parseGiaoDeadline(taskName);
  if (parsedDeadline) taskName = stripMatchedText(taskName, parsedDeadline.matchedText);

  const parsedPriority = parseGiaoPriority(taskName);
  if (parsedPriority) taskName = stripMatchedText(taskName, parsedPriority.matchedText);

  // Create Task in Firestore
  if (adminDb) {
    const source = event.source as any;
    const newTask: Task = {
      name: taskName,
      groupId: source?.type === 'group' ? source.groupId : 'personal',
      groupIds: source?.type === 'group' ? [source.groupId] : [],
      assignees: assignees.length > 0 ? assignees : [source?.userId || 'unknown'],
      creatorId: source?.userId || 'unknown',
      status: 'Chưa làm',
      priority: parsedPriority?.priority || 'Bình thường',
      deadline: parsedDeadline?.deadline || null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const docRef = await adminDb.collection('tasks').add(newTask);

    const shortId = docRef.id.slice(-5);
    const assigneesText = assignees.length > 0 ? assignees.join(', ') : 'Bạn';
    const creatorId = source?.userId || 'unknown';
    const creatorName = await getUserDisplayName(creatorId);

    const mentionMessage = buildAssigneeMentionMessage(assignees);
    const flexMessage = buildTaskFlexMessage({
      taskName,
      shortId,
      creatorName,
      assigneeText: assigneesText,
      deadlineText: formatDeadlineDisplay(parsedDeadline?.deadline),
      priorityText: parsedPriority?.priority
    });

    const messagesToSend = mentionMessage ? [mentionMessage, flexMessage] : [flexMessage];

    // Send confirmation
    const response = await client.replyMessage({
      replyToken: event.replyToken as string,
      messages: messagesToSend
    });

    // Lưu shortId (để tra cứu nhanh qua /xong, /nhan, /huy) và quote token của thẻ Flex vừa gửi
    // (để trích dẫn lại khi công việc hoàn thành)
    const updates: Record<string, string> = { shortId };
    const flexSent = response.sentMessages[response.sentMessages.length - 1];
    if (flexSent?.quoteToken) {
      updates[`flexQuoteTokens.${getChatKey(source)}`] = flexSent.quoteToken;
    }
    await docRef.update(updates);
  }
}

/**
 * Handle "/vieccuatoi" command
 */
export async function handleViecCuaToiCommand(
  event: line.webhook.MessageEvent,
  client: line.messagingApi.MessagingApiClient
) {
  if (!adminDb) return;
  const source = event.source as any;
  const userId = source?.userId;
  if (!userId) return;

  const snapshot = await adminDb.collection('tasks')
    .where('assignees', 'array-contains', userId)
    .where('status', 'in', ['Chưa làm', 'Đang làm'])
    .get();

  if (snapshot.empty) {
    await client.replyMessage({
      replyToken: event.replyToken as string,
      messages: [{ type: 'text', text: '🎉 Chúc mừng! Hiện tại bạn không có công việc nào chưa hoàn thành.' }]
    });
    return;
  }

  // Build a simple text list for now (Flex message can be implemented later)
  let text = '📋 DANH SÁCH VIỆC CỦA TÔI:\n';
  snapshot.docs.forEach((doc, index) => {
    const data = doc.data() as Task;
    text += `\n${index + 1}. [${data.status}] ${data.name} (ID: ${doc.id.slice(-5)})`;
  });

  await client.replyMessage({
    replyToken: event.replyToken as string,
    messages: [{ type: 'text', text }]
  });
}

/**
 * Handle status update commands: /xong, /huy, /nhan
 */
export async function handleTaskUpdateCommand(
  text: string,
  event: line.webhook.MessageEvent,
  client: line.messagingApi.MessagingApiClient
) {
  if (!adminDb) return;
  const parts = text.split(' ');
  const command = parts[0].toLowerCase();
  const taskIdRaw = parts[1]; // expecting short ID or full ID

  if (!taskIdRaw) {
    await client.replyMessage({
      replyToken: event.replyToken as string,
      messages: [{ type: 'text', text: `⚠️ Vui lòng nhập ID công việc. VD: ${command} a1b2c` }]
    });
    return;
  }

  // Tra theo shortId trước (query trực tiếp, nhanh); chỉ quét toàn bộ collection để tương thích
  // ngược với các task cũ được tạo trước khi field shortId tồn tại.
  let doc = (await adminDb.collection('tasks').where('shortId', '==', taskIdRaw).limit(1).get()).docs[0];
  if (!doc) {
    const snapshot = await adminDb.collection('tasks').get();
    doc = snapshot.docs.find(d => d.id.endsWith(taskIdRaw)) as typeof doc;
  }

  if (!doc) {
    await client.replyMessage({
      replyToken: event.replyToken as string,
      messages: [{ type: 'text', text: '⚠️ Không tìm thấy công việc với ID này.' }]
    });
    return;
  }

  const taskData = doc.data();
  const currentStatus: TaskStatus = taskData.status;
  const creatorId = taskData.creatorId || 'unknown';
  const clickerId = (event.source as any)?.userId || '';

  let newStatus = '';
  if (command === '/xong') newStatus = 'Hoàn thành';
  else if (command === '/huy') newStatus = 'Đã hủy';
  else if (command === '/nhan') newStatus = 'Đang làm';

  // Chặn chuyển trạng thái từ các trạng thái đã kết thúc (Hoàn thành/Đã hủy) để tránh
  // "Nhận việc"/"Hoàn tất" mở lại một việc đã xong hoặc đã bị hủy trước đó.
  if (FINAL_TASK_STATUSES.includes(currentStatus)) {
    const message = currentStatus === newStatus
      ? `ℹ️ Công việc "${taskData.name}" đã ở trạng thái "${currentStatus}" rồi.`
      : `⚠️ Công việc "${taskData.name}" đã "${currentStatus}", không thể chuyển sang "${newStatus}" nữa.`;
    await client.replyMessage({
      replyToken: event.replyToken as string,
      messages: [{ type: 'text', text: message }]
    });
    return;
  }

  // Chỉ người giao việc hoặc admin mới được hủy công việc (tránh người ngoài cuộc hủy việc của người khác)
  if (command === '/huy' && clickerId !== creatorId && !isAdmin(clickerId)) {
    await client.replyMessage({
      replyToken: event.replyToken as string,
      messages: [{ type: 'text', text: `⚠️ Chỉ người giao việc hoặc admin mới được hủy công việc "${taskData.name}".` }]
    });
    return;
  }

  await doc.ref.update({ status: newStatus, updatedAt: FieldValue.serverTimestamp() });

  if (command === '/nhan') {
    const segments: MentionSegment[] = [];
    if (creatorId !== 'unknown') segments.push({ mentionUserId: creatorId });
    if (clickerId) {
      if (segments.length > 0) segments.push({ text: ' ' });
      segments.push({ mentionUserId: clickerId });
    }
    segments.push({ text: ' đã nhận thông tin!' });

    await client.replyMessage({
      replyToken: event.replyToken as string,
      messages: [buildMentionText(segments)]
    });
    return;
  }

  if (command === '/xong') {
    const segments: MentionSegment[] = [
      { text: `✅ Công việc "${taskData.name}" đã được hoàn tất bởi ` }
    ];
    if (clickerId) segments.push({ mentionUserId: clickerId });
    if (creatorId !== 'unknown') {
      segments.push({ text: ' và ' });
      segments.push({ mentionUserId: creatorId });
    }

    // Trả lời trích dẫn lại đúng thẻ Flex công việc đã gửi trong cuộc trò chuyện này (nếu có)
    const chatKey = getChatKey(event.source as any);
    const quoteToken = taskData.flexQuoteTokens?.[chatKey];

    await client.replyMessage({
      replyToken: event.replyToken as string,
      messages: [buildMentionText(segments, quoteToken)]
    });
    return;
  }

  await client.replyMessage({
    replyToken: event.replyToken as string,
    messages: [{ type: 'text', text: `✅ Đã chuyển trạng thái công việc [${taskData.name}] thành: ${newStatus}` }]
  });
}
