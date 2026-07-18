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

/**
 * Định dạng một epoch ms thành "hh:mm dd/mm/yyyy" theo giờ Việt Nam (UTC+7), bất kể server chạy múi giờ nào
 * (dịch instant +7 giờ rồi đọc qua getter UTC — cùng kỹ thuật với parseVnDeadline, không cần thư viện timezone).
 */
export function formatVnDateTime(ms: number): string {
  const shifted = new Date(ms + 7 * 60 * 60 * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())} ${pad(shifted.getUTCDate())}/${pad(shifted.getUTCMonth() + 1)}/${shifted.getUTCFullYear()}`;
}

/**
 * Khoá ngày "YYYY-MM-DD" theo giờ Việt Nam (UTC+7) cho một epoch ms (mặc định là hiện tại).
 * Dùng để gộp số liệu theo ngày (vd thống kê tương tác) nhất quán giữa nơi ghi và nơi đọc.
 */
export function getVnDateKey(ms: number = Date.now()): string {
  const shifted = new Date(ms + 7 * 60 * 60 * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}
