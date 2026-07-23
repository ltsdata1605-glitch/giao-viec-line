// Hình dạng chung của event.source (LINE SDK định nghĩa GroupSource/RoomSource/UserSource là 3 type
// tách biệt với các field bắt buộc khác nhau, ép phải narrow theo `type` trước khi đọc field nào).
// Type này gộp cả 3 field lại thành optional để đọc thoải mái kiểu `source.groupId || source.roomId`
// như code hiện có đang dùng, mà không cần any — mọi giá trị Source thật đều gán được vào đây.
export type LineSource = {
  type: string;
  userId?: string;
  groupId?: string;
  roomId?: string;
};

// Một số handler (VD: xử lý postback "Nhận việc"/"Hoàn tất") chỉ cần source + replyToken, không quan
// tâm event cụ thể là MessageEvent hay PostbackEvent — dùng type tối giản này làm tham số thay vì ép
// kiểu MessageEvent rồi phải "as any" ở nơi gọi khi thực chất truyền vào là PostbackEvent.
export type LineReplyableEvent = {
  source?: LineSource;
  replyToken?: string;
};

/**
 * Xác định "nơi chat" (group/room/user) từ event.source, dùng làm key lưu quoteToken theo từng cuộc
 * trò chuyện vì quoteToken chỉ dùng trích dẫn được trong đúng cuộc trò chuyện đã nhận tin nhắn đó.
 */
export function getChatKey(source?: LineSource | null): string {
  if (!source) return 'unknown';
  if (source.type === 'group') return source.groupId || 'unknown';
  if (source.type === 'room') return source.roomId || 'unknown';
  return source.userId || 'unknown';
}

/**
 * Loại cuộc trò chuyện của event.source: nhóm, phòng chat nhiều người, hay 1:1 với bot.
 */
export function getChatType(source?: LineSource | null): 'group' | 'room' | 'user' {
  if (source?.type === 'group') return 'group';
  if (source?.type === 'room') return 'room';
  return 'user';
}
