import { NextResponse } from 'next/server';
import * as line from '@line/bot-sdk';
import { adminDb } from '@/lib/firebase-admin';

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
       const summary = await client.getGroupSummary(groupId);
       return NextResponse.json({ name: summary.groupName, pictureUrl: summary.pictureUrl });
    }
    return NextResponse.json({ error: 'No id provided' }, { status: 400 });
  } catch (error) {
    console.error('Error fetching LINE profile', error);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
