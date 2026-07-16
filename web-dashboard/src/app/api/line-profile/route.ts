import { NextResponse } from 'next/server';
import * as line from '@line/bot-sdk';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const groupId = searchParams.get('groupId');
  
  const client = new line.messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
  });

  try {
    if (userId) {
       const profile = await client.getProfile(userId);
       return NextResponse.json({ name: profile.displayName, pictureUrl: profile.pictureUrl });
    }
    if (groupId) {
       const summary = await client.getGroupSummary(groupId).catch(() => null);
       if (summary) {
         return NextResponse.json({ name: summary.groupName, pictureUrl: summary.pictureUrl });
       } else {
         return NextResponse.json({ name: `Nhóm ${groupId.substring(0, 6)}`, pictureUrl: '' });
       }
    }
    return NextResponse.json({ error: 'No id provided' }, { status: 400 });
  } catch (error) {
    console.error('Error fetching LINE profile', error);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
