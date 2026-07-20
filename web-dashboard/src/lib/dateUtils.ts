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

/**
 * Mốc epoch ms 00:00 giờ Việt Nam của ngày chứa `ms` (mặc định hiện tại). Dùng để truy vấn
 * "các bản ghi tạo trong hôm nay giờ VN" trên field lưu Timestamp/epoch thực (vd createdAt).
 */
export function getVnStartOfDayMs(ms: number = Date.now()): number {
  const [y, m, d] = getVnDateKey(ms).split('-').map(Number);
  return Date.UTC(y, m - 1, d, 0, 0, 0, 0) - 7 * 60 * 60 * 1000;
}

/**
 * Khoá tuần "YYYY-MM-DD" (ngày Thứ Hai của tuần chứa epoch ms đó) theo giờ Việt Nam.
 * Một tuần được tính từ Thứ Hai đến Chủ Nhật.
 */
export function getVnWeekKey(ms: number = Date.now()): string {
  const shifted = new Date(ms + 7 * 60 * 60 * 1000);
  const weekday = shifted.getUTCDay(); // 0 = Chủ nhật .. 6 = Thứ bảy
  const isoWeekday = weekday === 0 ? 7 : weekday; // Thứ 2 = 1 .. Chủ nhật = 7
  const monday = new Date(Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() - (isoWeekday - 1)
  ));
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
}

/**
 * Khoá tháng "YYYY-MM" theo giờ Việt Nam cho một epoch ms (mặc định là hiện tại).
 * Một tháng được tính theo lịch (ngày 1 đến ngày cuối tháng, 28-31 tuỳ tháng).
 */
export function getVnMonthKey(ms: number = Date.now()): string {
  const shifted = new Date(ms + 7 * 60 * 60 * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}`;
}

/**
 * Khoảng ngày "YYYY-MM-DD" (đầu-cuối, bao gồm cả 2 đầu) của tuần chứa epoch ms đó, theo giờ VN:
 * từ Thứ Hai đến Chủ Nhật. Dùng để truy vấn range theo field ngày dạng chuỗi (so sánh chuỗi ISO
 * tương đương so sánh thời gian vì đã zero-pad).
 */
export function getVnWeekRange(ms: number = Date.now()): { startKey: string; endKey: string } {
  const startKey = getVnWeekKey(ms);
  const [y, m, d] = startKey.split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1, d + 6));
  const pad = (n: number) => n.toString().padStart(2, '0');
  return { startKey, endKey: `${end.getUTCFullYear()}-${pad(end.getUTCMonth() + 1)}-${pad(end.getUTCDate())}` };
}

/**
 * Khoảng ngày "YYYY-MM-DD" (đầu-cuối, bao gồm cả 2 đầu) của tháng chứa epoch ms đó, theo giờ VN:
 * từ ngày 1 đến ngày cuối tháng thực tế (28-31 tuỳ tháng).
 */
export function getVnMonthRange(ms: number = Date.now()): { startKey: string; endKey: string } {
  const monthKey = getVnMonthKey(ms);
  const [y, m] = monthKey.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return { startKey: `${monthKey}-01`, endKey: `${monthKey}-${pad(lastDay)}` };
}
