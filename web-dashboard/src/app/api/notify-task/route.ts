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

    await client.pushMessage({
      to: assigneeId,
      messages: [
        {
          type: 'text',
          text: `🔔 BẠN CÓ CÔNG VIỆC MỚI!\nNgười giao: ${creatorName}\n📌 Tên việc: ${taskName}\n🆔 ID: ${taskId.slice(-5)}\n\n(Vui lòng gửi "/xong ${taskId.slice(-5)}" khi hoàn thành)`
        }
      ]
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Push notification error', err);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}
