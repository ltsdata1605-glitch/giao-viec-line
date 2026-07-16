import { adminDb } from '@/lib/firebase-admin';
import * as line from '@line/bot-sdk';
import { FieldValue } from 'firebase-admin/firestore';

export interface Task {
  id?: string;
  name: string;
  groupId: string;
  groupIds?: string[];
  assignees: string[]; // User IDs (or LINE user IDs/mentions)
  creatorId: string;
  status: 'Chưa làm' | 'Đang làm' | 'Hoàn thành' | 'Đã hủy';
  priority: 'Bình thường' | 'Cao' | 'Gấp';
  deadline: Date | null;
  createdAt: any;
  updatedAt: any;
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
      priority: 'Bình thường',
      deadline: null, // Parsing date logic can be added later
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const docRef = await adminDb.collection('tasks').add(newTask);

    const shortId = docRef.id.slice(-5);
    const assigneesText = assignees.length > 0 ? assignees.join(', ') : 'Bạn';

    let creatorName = 'Admin';
    const creatorId = source?.userId || 'unknown';
    if (adminDb && creatorId !== 'unknown') {
      const snap = await adminDb.collection('users').where('lineUserId', '==', creatorId).limit(1).get();
      if (!snap.empty) {
        creatorName = snap.docs[0].data().name;
      }
    }

    let mentionText = '';
    const mentioneesArr: any[] = [];
    let currentIndex = 0;

    for (let i = 0; i < assignees.length; i++) {
      const uId = assignees[i];
      if (uId.startsWith('U')) { // valid LINE ID check
        const placeholder = `@user${i} `;
        mentionText += placeholder;
        mentioneesArr.push({
          index: currentIndex,
          length: placeholder.length - 1,
          userId: uId
        });
        currentIndex += placeholder.length;
      }
    }

    const textMessage: any = {
      type: 'text',
      text: `${mentionText}Vui lòng đọc kỹ nội dung, thời gian hoàn tất và hình thức báo cáo!`,
      mention: mentioneesArr.length > 0 ? { mentionees: mentioneesArr } : undefined
    };

    const flexMessage: line.messagingApi.FlexMessage = {
      type: 'flex',
      altText: `Nhiệm vụ mới: ${taskName}`,
      contents: {
        type: 'bubble',
        size: 'mega',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'text', text: '🎯 CÔNG VIỆC SIÊU THỊ', color: '#1db446', weight: 'bold', size: 'xl' },
            { type: 'separator', margin: 'lg' },
            { type: 'text', text: taskName, weight: 'bold', size: 'md', wrap: true, margin: 'lg' },
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
                    { type: 'text', text: assigneesText, wrap: true, color: '#333333', size: 'sm', flex: 7, weight: 'bold' }
                  ]
                },
                {
                  type: 'box',
                  layout: 'baseline',
                  spacing: 'sm',
                  contents: [
                    { type: 'text', text: 'Deadline', color: '#aaaaaa', size: 'sm', flex: 3 },
                    { type: 'text', text: 'Không có', wrap: true, color: '#ff4d4f', size: 'sm', flex: 7, weight: 'bold' }
                  ]
                },
                {
                  type: 'box',
                  layout: 'baseline',
                  spacing: 'sm',
                  contents: [
                    { type: 'text', text: 'Nghiệm thu', color: '#aaaaaa', size: 'sm', flex: 3 },
                    { type: 'text', text: 'Bấm hoàn tất', wrap: true, color: '#1db446', size: 'sm', flex: 7, weight: 'bold' }
                  ]
                }
              ]
            }
          ]
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
              action: { type: 'message', label: '✅ Hoàn tất', text: `/xong ${shortId}` }
            },
            {
              type: 'button',
              style: 'secondary',
              height: 'sm',
              action: { type: 'message', label: 'Nhận việc', text: `/nhan ${shortId}` }
            }
          ]
        }
      }
    };

    const messagesToSend = mentioneesArr.length > 0 ? [textMessage, flexMessage] : [flexMessage];

    // Send confirmation
    await client.replyMessage({
      replyToken: event.replyToken as string,
      messages: messagesToSend
    });
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

  // Find task by ID (using suffix match for simplicity as we showed 5 chars)
  const snapshot = await adminDb.collection('tasks').get();
  const doc = snapshot.docs.find(d => d.id.endsWith(taskIdRaw));

  if (!doc) {
    await client.replyMessage({
      replyToken: event.replyToken as string,
      messages: [{ type: 'text', text: '⚠️ Không tìm thấy công việc với ID này.' }]
    });
    return;
  }

  let newStatus = '';
  if (command === '/xong') newStatus = 'Hoàn thành';
  else if (command === '/huy') newStatus = 'Đã hủy';
  else if (command === '/nhan') newStatus = 'Đang làm';

  await doc.ref.update({ status: newStatus, updatedAt: FieldValue.serverTimestamp() });
  
  if (command === '/nhan') {
    const taskData = doc.data();
    const creatorId = taskData.creatorId;
    if (creatorId) {
      let assignerName = 'Bạn';
      const uSnap = await adminDb.collection('users').where('lineUserId', '==', (event.source as any)?.userId || '').limit(1).get();
      if (!uSnap.empty) assignerName = uSnap.docs[0].data().name;

      const mentionText = `@creator `;
      const textMessage: any = {
        type: 'text',
        text: `${mentionText}${assignerName} đã nhận thông tin!`,
        mention: {
          mentionees: [{ index: 0, length: 8, userId: creatorId }]
        }
      };

      await client.replyMessage({
        replyToken: event.replyToken as string,
        messages: [textMessage]
      });
      return;
    }
  }

  await client.replyMessage({
    replyToken: event.replyToken as string,
    messages: [{ type: 'text', text: `✅ Đã chuyển trạng thái công việc [${doc.data().name}] thành: ${newStatus}` }]
  });
}
