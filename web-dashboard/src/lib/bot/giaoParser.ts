/**
 * Nhận diện nhanh hạn chót / độ ưu tiên ngay trong nội dung lệnh "/giao", để không bắt buộc
 * phải mở Form LIFF cho các việc đơn giản. Chỉ nhận diện các cú pháp rõ ràng, không đoán các
 * cách diễn đạt mơ hồ (vd "gấp" cũng có nghĩa "gấp quần áo" trong tiếng Việt, "5/10" có thể là
 * phân số chứ không phải ngày) để tránh hiểu sai ý người dùng và gán nhầm hạn/độ ưu tiên.
 */

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Thời điểm hiện tại theo "đồng hồ tường" giờ Việt Nam (UTC+7, không có giờ mùa hè), lấy bằng cách
 * dịch instant hiện tại +7 giờ rồi đọc qua các getter UTC — không cần thư viện timezone.
 */
function nowVnParts() {
  const shifted = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(), // 0-indexed
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** Định dạng "YYYY-MM-DDTHH:mm" — khớp định dạng deadline dùng chung toàn dự án (input datetime-local). */
function formatDeadline(year: number, month: number, day: number, hour: number, minute: number): string {
  // Dùng Date.UTC để tự chuẩn hoá tràn ngày/tháng/giờ, rồi đọc lại UTC getters lấy đúng con số mong muốn
  const d = new Date(Date.UTC(year, month, day, hour, minute));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export interface ParsedDeadline {
  deadline: string;
  matchedText: string;
}

/**
 * Hỗ trợ: "trong N phút/giờ", "mai"/"ngày mai" (+giờ tuỳ chọn, mặc định 08:00), "hôm nay <giờ>",
 * "<giờ>" đứng riêng (hôm nay, tự lùi sang mai nếu giờ đã qua), "ngày DD/MM" hoặc "hạn DD/MM" (+giờ tuỳ chọn).
 */
export function parseGiaoDeadline(text: string): ParsedDeadline | null {
  const now = nowVnParts();
  const nowMs = Date.UTC(now.year, now.month, now.day, now.hour, now.minute);

  // 1. "trong N phút/giờ"
  let m = /trong\s+(\d+)\s*(phút|giờ)/i.exec(text);
  if (m) {
    const n = parseInt(m[1], 10);
    const minutesToAdd = m[2].toLowerCase() === 'giờ' ? n * 60 : n;
    const target = new Date(nowMs + minutesToAdd * 60000);
    return {
      deadline: formatDeadline(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate(), target.getUTCHours(), target.getUTCMinutes()),
      matchedText: m[0]
    };
  }

  // 2. "(hôm nay|ngày mai|mai) [lúc] Hh[:mm]"
  m = /(hôm nay|ngày mai|mai)\s*(?:lúc\s*)?(\d{1,2})[h:](\d{2})?/i.exec(text);
  if (m) {
    const dayOffset = /mai/i.test(m[1]) ? 1 : 0;
    const hour = parseInt(m[2], 10);
    const minute = m[3] ? parseInt(m[3], 10) : 0;
    if (hour <= 23 && minute <= 59) {
      return { deadline: formatDeadline(now.year, now.month, now.day + dayOffset, hour, minute), matchedText: m[0] };
    }
  }

  // 3. "ngày mai" / "mai" đứng riêng, không kèm giờ -> mặc định 08:00 sáng mai
  m = /(ngày mai|mai)\b/i.exec(text);
  if (m) {
    return { deadline: formatDeadline(now.year, now.month, now.day + 1, 8, 0), matchedText: m[0] };
  }

  // 4. "ngày|hạn|trước ngày|đến ngày DD/MM" (+giờ tuỳ chọn) — bắt buộc có từ khoá dẫn để tránh
  // nhầm với số liệu thông thường trong tên việc (vd "khảo sát 5/10 chi nhánh").
  m = /(?:ngày|hạn|trước ngày|đến ngày)\s+(\d{1,2})[/-](\d{1,2})(?:\s*(?:lúc\s*)?(\d{1,2})[h:](\d{2})?)?/i.exec(text);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const hour = m[3] ? parseInt(m[3], 10) : 8;
    const minute = m[4] ? parseInt(m[4], 10) : 0;
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11 && hour <= 23 && minute <= 59) {
      let year = now.year;
      if (Date.UTC(year, month, day, hour, minute) < nowMs) year += 1; // đã qua trong năm nay -> hiểu là năm sau
      return { deadline: formatDeadline(year, month, day, hour, minute), matchedText: m[0] };
    }
  }

  // 5. Giờ đứng riêng "Hh[:mm]" -> hôm nay, tự lùi sang mai nếu giờ đó đã qua
  m = /\b(\d{1,2})[h:](\d{2})?\b/.exec(text);
  if (m) {
    const hour = parseInt(m[1], 10);
    const minute = m[2] ? parseInt(m[2], 10) : 0;
    if (hour <= 23 && minute <= 59) {
      const dayOffset = Date.UTC(now.year, now.month, now.day, hour, minute) <= nowMs ? 1 : 0;
      return { deadline: formatDeadline(now.year, now.month, now.day + dayOffset, hour, minute), matchedText: m[0] };
    }
  }

  return null;
}

export interface ParsedPriority {
  priority: 'GẤP' | 'Quan trọng';
  matchedText: string;
}

/**
 * Chỉ nhận diện qua tag rõ ràng dạng #tag để tránh đoán nhầm từ ngữ tự nhiên
 * (vd từ "gấp" trong tiếng Việt còn mang nghĩa "gấp quần áo", không thể suy luận tự do).
 */
export function parseGiaoPriority(text: string): ParsedPriority | null {
  let m = /#(gap|gấp|khan|khẩn|urgent)\b/i.exec(text);
  if (m) return { priority: 'GẤP', matchedText: m[0] };

  m = /#(qt|quantrong|quan\s*trọng)\b/i.exec(text);
  if (m) return { priority: 'Quan trọng', matchedText: m[0] };

  return null;
}

/** Loại bỏ đoạn văn bản đã khớp (không phân biệt hoa/thường) khỏi chuỗi gốc và dọn khoảng trắng thừa. */
export function stripMatchedText(text: string, matched: string): string {
  const idx = text.toLowerCase().indexOf(matched.toLowerCase());
  if (idx === -1) return text;
  return (text.slice(0, idx) + text.slice(idx + matched.length)).replace(/\s{2,}/g, ' ').trim();
}
