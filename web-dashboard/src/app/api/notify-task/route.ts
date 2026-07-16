import { NextResponse } from 'next/server';
import * as line from '@line/bot-sdk';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const { taskId, assigneeId, assignees, groupId, taskName, taskDescription, creatorId } = await request.json();
    
    // Support both legacy single assigneeId and new array assignees
    let targetAssignees: string[] = [];
    if (assignees && Array.isArray(assignees) && assignees.length > 0) {
      targetAssignees = assignees;
    } else if (assigneeId) {
      targetAssignees = [assigneeId];
    }

    if (targetAssignees.length === 0 || !taskName) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const client = new line.messagingApi.MessagingApiClient({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
    });

    let creatorName = 'Admin';
    if (adminDb && creatorId) {
      const snap = await adminDb.collection('users').where('lineUserId', '==', creatorId).limit(1).get();
      if (!snap.empty) {
        creatorName = snap.docs[0].data().name;
      }
    }

    let assigneeNameStr = '';
    let deadlineStr = '';
    let acceptanceTypeStr = '';

    if (adminDb) {
      const taskSnap = await adminDb.collection('tasks').doc(taskId).get();
      if (taskSnap.exists) {
        const taskData = taskSnap.data();
        assigneeNameStr = taskData?.assigneeName || '';
        deadlineStr = taskData?.deadline || '';
        acceptanceTypeStr = taskData?.acceptanceType || '';
      }
    }

    const shortId = taskId.slice(-5);
    
    // Construct Text message with mentions
    let mentionText = '';
    const mentionees: any[] = [];
    let currentIndex = 0;

    for (let i = 0; i < targetAssignees.length; i++) {
      const uId = targetAssignees[i];
      const placeholder = `@user${i} `;
      mentionText += placeholder;
      mentionees.push({
        index: currentIndex,
        length: placeholder.length - 1, // '@user0' length is 6
        userId: uId
      });
      currentIndex += placeholder.length;
    }

    const textMessage: any = {
      type: 'text',
      text: `${mentionText}Vui lòng đọc kỹ nội dung, thời gian hoàn tất và hình thức báo cáo!`,
      mention: mentionees.length > 0 ? { mentionees } : undefined
    };
    
    const bodyContents: any[] = [
      { type: 'text', text: taskName, weight: 'bold', size: 'lg', wrap: true }
    ];

    if (taskDescription) {
      bodyContents.push({
        type: 'text',
        text: taskDescription,
        color: '#666666',
        size: 'sm',
        wrap: true,
        margin: 'md'
      });
    }

    bodyContents.push({
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
            { type: 'text', text: assigneeNameStr || 'Chưa rõ', wrap: true, color: '#333333', size: 'sm', flex: 7, weight: 'bold' }
          ]
        },
        {
          type: 'box',
          layout: 'baseline',
          spacing: 'sm',
          contents: [
            { type: 'text', text: 'Deadline', color: '#aaaaaa', size: 'sm', flex: 3 },
            { type: 'text', text: deadlineStr || 'Không có', wrap: true, color: '#ff4d4f', size: 'sm', flex: 7, weight: 'bold' }
          ]
        },
        {
          type: 'box',
          layout: 'baseline',
          spacing: 'sm',
          contents: [
            { type: 'text', text: 'Nghiệm thu', color: '#aaaaaa', size: 'sm', flex: 3 },
            { type: 'text', text: acceptanceTypeStr || 'Bấm hoàn tất', wrap: true, color: '#1db446', size: 'sm', flex: 7, weight: 'bold' }
          ]
        }
      ]
    });

    const flexMessage: line.messagingApi.FlexMessage = {
      type: 'flex',
      altText: `Nhiệm vụ mới: ${taskName}`,
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#1db446',
          contents: [
            { type: 'text', text: '🎯 CÔNG VIỆC SIÊU THỊ', color: '#ffffff', weight: 'bold', size: 'lg' }
          ]
        },
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

    const messagesToSend: line.messagingApi.Message[] = targetAssignees.length > 0 && targetAssignees[0] !== 'all' ? [textMessage, flexMessage] : [flexMessage];

    if (groupId) {
      // Send to Group
      await client.pushMessage({
        to: groupId,
        messages: messagesToSend
      });
    } else {
      // Multicast to multiple users, or single push if only 1
      if (targetAssignees.length === 1) {
        await client.pushMessage({
          to: targetAssignees[0],
          messages: messagesToSend
        });
      } else {
        await client.multicast({
          to: targetAssignees,
          messages: messagesToSend
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Push notification error', err);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}
