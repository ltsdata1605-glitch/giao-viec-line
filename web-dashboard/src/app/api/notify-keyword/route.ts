import { NextResponse } from 'next/server';
import * as line from '@line/bot-sdk';

export async function POST(request: Request) {
  try {
    const { keywordId, keyword, reply_text, image_urls, assignees, groupId, groupIds } = await request.json();
    
    let targetAssignees: string[] = [];
    if (assignees && Array.isArray(assignees) && assignees.length > 0) {
      targetAssignees = assignees;
    }

    let targetGroupIds: string[] = [];
    if (groupIds && Array.isArray(groupIds) && groupIds.length > 0) {
      targetGroupIds = groupIds;
    } else if (groupId) {
      targetGroupIds = [groupId];
    }

    if (targetGroupIds.length === 0 && targetAssignees.length === 0) {
      return NextResponse.json({ error: 'Missing target' }, { status: 400 });
    }

    const client = new line.messagingApi.MessagingApiClient({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
    });

    const messages: line.messagingApi.Message[] = [];
    
    if (reply_text) {
      messages.push({
        type: 'text',
        text: reply_text,
      });
    }

    if (image_urls && Array.isArray(image_urls) && image_urls.length > 0) {
      // LINE API allows max 5 messages per push.
      const availableSlots = 5 - messages.length;
      const urlsToPush = image_urls.slice(0, availableSlots);
      
      urlsToPush.forEach((url: string) => {
        messages.push({
          type: 'image',
          originalContentUrl: url,
          previewImageUrl: url,
        });
      });
    }

    if (messages.length === 0) {
      return NextResponse.json({ error: 'No content to send' }, { status: 400 });
    }

    if (targetGroupIds.length > 0) {
      // Send to all Groups
      for (const gId of targetGroupIds) {
        await client.pushMessage({
          to: gId,
          messages
        });
      }
    } else {
      // Multicast to multiple users, or single push if only 1
      if (targetAssignees.length === 1) {
        await client.pushMessage({
          to: targetAssignees[0],
          messages
        });
      } else {
        await client.multicast({
          to: targetAssignees,
          messages
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Push keyword notification error', err);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}
