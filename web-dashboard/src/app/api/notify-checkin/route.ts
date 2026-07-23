import { NextResponse } from 'next/server';
import * as line from '@line/bot-sdk';
import { createCheckinAndNotify } from '@/lib/bot/checkin';

// Được gọi từ form LIFF /liff/checkin (thay vì gõ lệnh /diemdanh trong chat) — không có replyToken vì
// không có webhook event, nên phải dùng pushMessage thay vì replyMessage để gửi thẻ Flex vào đúng
// nơi (nhóm/phòng/chat riêng) mà form được mở từ đó.
export async function POST(request: Request) {
  try {
    const { title, content, deadline, creatorId, creatorName, chatKey, chatType } = await request.json();

    if (!title || !deadline || !chatKey || !chatType) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }
    if (!['group', 'room', 'user'].includes(chatType)) {
      return NextResponse.json({ error: 'Invalid chatType' }, { status: 400 });
    }

    const client = new line.messagingApi.MessagingApiClient({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
    });

    const result = await createCheckinAndNotify(
      {
        title,
        content: content || '',
        deadline,
        creatorId: creatorId || 'unknown',
        creatorName: creatorName || 'Ẩn danh',
        chatKey,
        chatType,
      },
      (messages) => client.pushMessage({ to: chatKey, messages })
    );

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('Push checkin notification error', err);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}
