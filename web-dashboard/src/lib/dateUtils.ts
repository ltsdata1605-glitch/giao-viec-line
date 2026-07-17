/**
 * Quy đổi deadline lưu dạng chuỗi "YYYY-MM-DDTHH:mm" (không có timezone, từ input datetime-local)
 * sang mốc thời gian thực tế (epoch ms). Chuỗi không có timezone được hiểu là giờ Việt Nam (UTC+7).
 * Cũng nhận Date hoặc Firestore Timestamp (có .toDate()) để dùng chung được ở cả server và client.
 */
export function parseVnDeadline(raw: unknown): number | null {
  if (!raw) return null;
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === 'object' && raw !== null && 'toDate' in raw && typeof (raw as { toDate: unknown }).toDate === 'function') {
    return (raw as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof raw === 'string') {
    const hasTimezone = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(raw);
    const iso = hasTimezone ? raw : `${raw}+07:00`;
    const ms = new Date(iso).getTime();
    return isNaN(ms) ? null : ms;
  }
  return null;
}
