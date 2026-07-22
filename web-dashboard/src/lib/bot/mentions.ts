import * as line from '@line/bot-sdk';

/**
 * Đoạn nội dung tin nhắn textV2: văn bản thường, tag (mention) một user cụ thể, hoặc tag "@all"
 * (toàn bộ thành viên nhóm/phòng — chỉ có tác dụng trong group/room, LINE bỏ qua trong chat 1:1).
 */
export type MentionSegment = { text: string } | { mentionUserId: string } | { mentionAll: true };

/**
 * Dựng tin nhắn textV2 từ danh sách đoạn văn bản/tag, dùng chung cho mọi luồng cần tag người dùng
 * hoặc tag cả nhóm. LINE chỉ hỗ trợ tag (mention) chủ động qua type "textV2" + substitution, không
 * phải type "text".
 */
export function buildMentionText(segments: MentionSegment[], quoteToken?: string): line.messagingApi.TextMessageV2 {
  let text = '';
  const substitution: Record<string, line.messagingApi.MentionSubstitutionObject> = {};
  let counter = 0;

  for (const seg of segments) {
    if ('mentionUserId' in seg) {
      const key = `m${counter++}`;
      substitution[key] = { type: 'mention', mentionee: { type: 'user', userId: seg.mentionUserId } };
      text += `{${key}}`;
    } else if ('mentionAll' in seg) {
      const key = `m${counter++}`;
      substitution[key] = { type: 'mention', mentionee: { type: 'all' } };
      text += `{${key}}`;
    } else {
      text += seg.text;
    }
  }

  return {
    type: 'textV2',
    text,
    substitution,
    ...(quoteToken ? { quoteToken } : {})
  };
}
