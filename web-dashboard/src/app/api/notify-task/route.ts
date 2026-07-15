import { NextResponse } from 'next/server';
import * as line from '@line/bot-sdk';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const { taskId, assigneeId, taskName, creatorId } = await request.json();
    if (!assigneeId || !taskName) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    if (assigneeId === creatorId) {
      return NextResponse.json({ success: true, ignored: true });
    }

    const client = new line.messagingApi.MessagingApiClient({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
    });

    // We can fetch creator name
    let creatorName = 'Ai đó';
    if (adminDb && creatorId) {
      const snap = await adminDb.collection('users').where('lineUserId', '==', creatorId).limit(1).get();
      if (!snap.empty) {
        creatorName = snap.docs[0].data().name;
      }
    }

    const shortId = taskId.slice(-5);
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
            { type: 'text', text: '🎯 NHIỆM VỤ MỚI', color: '#ffffff', weight: 'bold', size: 'sm' }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'text', text: taskName, weight: 'bold', size: 'lg', wrap: true },
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
                    { type: 'text', text: 'Mã Việc', color: '#aaaaaa', size: 'sm', flex: 3 },
                    { type: 'text', text: shortId, wrap: true, color: '#333333', size: 'sm', flex: 7 }
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
              action: { type: 'message', label: '✅ Hoàn thành', text: `/xong ${shortId}` }
            },
            {
              type: 'button',
              style: 'secondary',
              height: 'sm',
              action: { type: 'message', label: '❌ Huỷ', text: `/huy ${shortId}` }
            }
          ]
        }
      }
    };

    await client.pushMessage({
      to: assigneeId,
      messages: [flexMessage]
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Push notification error', err);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}
