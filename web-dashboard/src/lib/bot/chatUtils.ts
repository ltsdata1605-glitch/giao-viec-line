/**
 * Xác định "nơi chat" (group/room/user) từ event.source, dùng làm key lưu quoteToken theo từng cuộc
 * trò chuyện vì quoteToken chỉ dùng trích dẫn được trong đúng cuộc trò chuyện đã nhận tin nhắn đó.
 */
export function getChatKey(source: any): string {
  if (!source) return 'unknown';
  if (source.type === 'group') return source.groupId;
  if (source.type === 'room') return source.roomId;
  return source.userId || 'unknown';
}

/**
 * Loại cuộc trò chuyện của event.source: nhóm, phòng chat nhiều người, hay 1:1 với bot.
 */
export function getChatType(source: any): 'group' | 'room' | 'user' {
  if (source?.type === 'group') return 'group';
  if (source?.type === 'room') return 'room';
  return 'user';
}
