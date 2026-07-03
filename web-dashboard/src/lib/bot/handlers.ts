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

  // 0. Tự động học (Passive Learning): Chạy ngầm
  const client = getLineClient();
  if (client) {
    // Fire and forget
    import('./sync').then(({ captureUserProfile }) => {
      captureUserProfile(event as line.webhook.MessageEvent, client).catch(console.error);
    });
  }

  // 1. Lệnh Đồng bộ (/dongbo)
  if (['/dongbo', 'đồng bộ'].includes(text.toLowerCase())) {
    if (client) {
      const { handleDongboCommand } = await import('./sync');
      await handleDongboCommand(event as line.webhook.MessageEvent, client);
    }
    return;
  }

  // 2. Check for Keyword replies first
  const keywordReply = await getReplyFromFirebase(text);
  
  if (keywordReply) {
    const messages: line.messagingApi.Message[] = [];
    
    if (keywordReply.reply_text) {
      messages.push({
        type: 'text',
        text: keywordReply.reply_text,
      });
    }

    if (keywordReply.image_urls && keywordReply.image_urls.length > 0) {
      // LINE API allows max 5 messages per reply.
      // We already pushed 1 text message (optionally), so we can push up to 4 or 5 images.
      const availableSlots = 5 - messages.length;
      const urlsToPush = keywordReply.image_urls.slice(0, availableSlots);
      
      urlsToPush.forEach((url: string) => {
        messages.push({
          type: 'image',
          originalContentUrl: url,
          previewImageUrl: url,
        });
      });
    }

    const client = getLineClient();
    if (client && messages.length > 0 && event.replyToken) {
      await client.replyMessage({
        replyToken: event.replyToken,
        messages,
      });
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
