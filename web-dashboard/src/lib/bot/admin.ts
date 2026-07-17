/**
 * Danh sách LINE ID của Admin hệ thống — có quyền vượt qua giới hạn thông thường
 * (vd: hủy công việc do người khác giao, quản lý cấu hình lọc PMH).
 * Thêm/bớt ID trực tiếp vào mảng này.
 */
export const ADMIN_LINE_IDS: string[] = [
  'U5bff120f01066eefca60fd0c8ea3537c'
];

export function isAdmin(userId?: string | null): boolean {
  return !!userId && ADMIN_LINE_IDS.includes(userId);
}
