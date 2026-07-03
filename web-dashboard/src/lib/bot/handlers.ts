import * as line from '@line/bot-sdk';
import { getReplyFromFirebase } from './keywords';

// Initialize LINE Client lazily to allow env vars to be loaded
let lineClient: line.messagingApi.MessagingApiClient | null = null;

function getLineClient() {
  if (!lineClient) {
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
    if (channelAccessToken) {
      lineClient = new line.messagingApi.MessagingApiClient({
        channelAccessToken,
      });
    }
  }
  return lineClient;
}

export async function handleLineEvent(event: line.webhook.Event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    // Currently only handle text messages
    return;
  }

  const message = event.message as line.webhook.TextMessageContent;
  const text = message.text.trim();

  // 1. Check for Keyword replies first
  const keywordReply = await getReplyFromFirebase(text);
  
  if (keywordReply) {
    const messages: line.messagingApi.Message[] = [];
    
    if (keywordReply.reply_text) {
      messages.push({
        type: 'text',
        text: keywordReply.reply_text,
      });
    }

    if (keywordReply.image_url) {
      messages.push({
        type: 'image',
        originalContentUrl: keywordReply.image_url,
        previewImageUrl: keywordReply.image_url,
      });
    }

    if (messages.length > 0 && event.replyToken) {
      const client = getLineClient();
      if (client) {
        await client.replyMessage({
          replyToken: event.replyToken,
          messages: messages,
        });
      } else {
        console.error('LINE Client not initialized. Cannot reply.');
      }
    }
    return; // Done handling keyword
  }

  // 2. Handle Task Commands (Giao việc)
  if (text.toLowerCase().startsWith('/giao ')) {
    const { handleGiaoCommand } = await import('./tasks');
    const client = getLineClient();
    if (client) {
      await handleGiaoCommand(text, event as line.webhook.MessageEvent, client);
    }
    return;
  }

  if (['/vieccuatoi', 'việc của tôi', 'viec cua toi'].includes(text.toLowerCase())) {
    const { handleViecCuaToiCommand } = await import('./tasks');
    const client = getLineClient();
    if (client) {
      await handleViecCuaToiCommand(event as line.webhook.MessageEvent, client);
    }
    return;
  }

  if (['/xong', '/huy'].some(cmd => text.toLowerCase().startsWith(cmd + ' '))) {
    const { handleTaskUpdateCommand } = await import('./tasks');
    const client = getLineClient();
    if (client) {
      await handleTaskUpdateCommand(text, event as line.webhook.MessageEvent, client);
    }
    return;
  }
}
