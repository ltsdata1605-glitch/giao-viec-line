import * as line from '@line/bot-sdk';
import { getReplyFromFirebase } from './keywords';
import { getPmhKeywords, handlePmhAdminCommand } from './pmh';

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
  // 0. Tự động học (Passive Learning): Chạy ngầm cho mọi message và join
  if (event.type === 'message' || event.type === 'join') {
    const client = getLineClient();
    if (client) {
      const { captureUserProfile } = await import('./sync');
      await captureUserProfile(event as line.webhook.MessageEvent, client).catch(console.error);
    }
  }

  if (event.type === 'postback') {
    const data = event.postback.data;
    if (data.startsWith('action=')) {
      const params = new URLSearchParams(data);
      const action = params.get('action');
      const taskId = params.get('taskId');
      if (action && taskId) {
        const text = `/${action} ${taskId}`;
        const { handleTaskUpdateCommand } = await import('./tasks');
        const client = getLineClient();
        if (client) {
          await handleTaskUpdateCommand(text, event as any, client);
        }
      }
    }
    return;
  }

  if (event.type !== 'message' || event.message.type !== 'text') {
    // Currently only handle text messages for commands
    return;
  }

  const message = event.message as line.webhook.TextMessageContent;
  const text = message.text.trim();
  const source = event.source as any;
  const gId = source.groupId || source.roomId;

  // 0.4 Admin Private Chat cho PMH
  if (!gId && text.toLowerCase().startsWith('pmh')) {
    const client = getLineClient();
    if (client) {
      await handlePmhAdminCommand(text, event as line.webhook.MessageEvent, client);
    }
    return;
  }

  // 0.5 LỌC MÃ PMH TỰ ĐỘNG TRONG NHÓM
  if (gId && (text.includes('PMH') || text.includes('➜') || text.includes('=>') || text.includes('->'))) {
    const pmhKeywords = await getPmhKeywords(); // Lấy từ Firebase thay vì hardcode
    const textLower = text.toLowerCase();
    
    if (pmhKeywords.some(kw => textLower.includes(kw.toLowerCase()))) {
      const lines = text.split(/\r?\n/);
      const matchedPairs: string[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const lineStr = lines[i].trim();
        // Tìm dòng chứa nội dung phát mã (hoặc báo lỗi) có mũi tên
        if (lineStr.includes('➜') || lineStr.includes('->') || lineStr.includes('=>') || lineStr.includes('➡')) {
          let prevLine = (i > 0) ? lines[i-1].trim() : "";
          // Nếu dòng trên là separator hoặc trống thì lùi thêm 1 dòng
          if ((/^[\-—_─━=]{2,}$/.test(prevLine) || prevLine === "") && i > 1) {
            prevLine = lines[i-2].trim();
          }
          
          const combined = (prevLine + " " + lineStr).toLowerCase();
          if (pmhKeywords.some(kw => combined.includes(kw.toLowerCase()))) {
            matchedPairs.push(prevLine + "\n" + lineStr);
          }
        }
      }
      
      if (matchedPairs.length > 0) {
        const replyMsg = "Danh sách mã PMH của bạn là:\n━━━━━━\n" + matchedPairs.join('\n━━━━━━\n');
        const client = getLineClient();
        if (client && event.replyToken) {
          await client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: replyMsg }]
          });
        }
        return; 
      }
    }
  }

  // 1. Lệnh Đồng bộ (/dongbo)
  if (['/dongbo', 'đồng bộ'].includes(text.toLowerCase())) {
    const client = getLineClient();
    if (client) {
      const { handleDongboCommand } = await import('./sync');
      await handleDongboCommand(event as line.webhook.MessageEvent, client);
    }
    return;
  }

  // 1.5 Lệnh /help: liệt kê toàn bộ lệnh bot hỗ trợ
  if (['/help', '/trogiup', 'trợ giúp'].includes(text.toLowerCase())) {
    const { handleHelpCommand } = await import('./help');
    const client = getLineClient();
    if (client) {
      await handleHelpCommand(event as line.webhook.MessageEvent, client);
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
  // Khớp cả "/giao" gõ trơn (không dấu cách, không nội dung) lẫn "/giao <task>" - trước đây chỉ
  // startsWith('/giao ') nên gõ bare "/giao" không khớp gì cả, bot im lặng hoàn toàn.
  const textLowerTrimmed = text.toLowerCase().trim();
  if (textLowerTrimmed === '/giao' || textLowerTrimmed.startsWith('/giao ')) {
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

  // Lệnh /baocao: tóm tắt tình hình công việc, dùng được cả 1:1 lẫn trong nhóm
  if (textLowerTrimmed === '/baocao' || ['báo cáo', 'bao cao'].includes(textLowerTrimmed)) {
    const { handleBaoCaoCommand } = await import('./report');
    const client = getLineClient();
    if (client) {
      await handleBaoCaoCommand(event as line.webhook.MessageEvent, client);
    }
    return;
  }

  // Lệnh /tuongtac [tuần|tháng]: báo cáo tương tác theo từng nhân viên, tách riêng khỏi /baocao
  if (textLowerTrimmed === '/tuongtac' || textLowerTrimmed.startsWith('/tuongtac ') || ['báo cáo tương tác', 'bao cao tuong tac'].includes(textLowerTrimmed)) {
    const { handleTuongTacCommand } = await import('./report');
    const client = getLineClient();
    if (client) {
      await handleTuongTacCommand(text, event as line.webhook.MessageEvent, client);
    }
    return;
  }

  if (['/xong', '/huy', '/nhan'].some(cmd => text.toLowerCase().startsWith(cmd + ' '))) {
    const { handleTaskUpdateCommand } = await import('./tasks');
    const client = getLineClient();
    if (client) {
      await handleTaskUpdateCommand(text, event as line.webhook.MessageEvent, client);
    }
    return;
  }
}
