import { NextRequest, NextResponse } from 'next/server';
import * as line from '@line/bot-sdk';
import { handleLineEvent } from '@/lib/bot/handlers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const channelSecret = process.env.LINE_CHANNEL_SECRET || '';

    if (process.env.NODE_ENV !== 'development') {
      const signature = req.headers.get('x-line-signature') as string;
      if (!signature) {
        return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
      }
      if (!line.validateSignature(body, channelSecret, signature)) {
        console.error('Invalid signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const data = JSON.parse(body);
    const events = data.events;

    if (!events || events.length === 0) {
      return NextResponse.json({ message: 'No events' }, { status: 200 });
    }

    // Process all events
    await Promise.all(
      events.map(async (event: any) => {
        try {
          await handleLineEvent(event);
        } catch (err) {
          console.error('Error handling event:', err);
        }
      })
    );

    return NextResponse.json({ message: 'OK' }, { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
