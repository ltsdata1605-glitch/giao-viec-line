/**
 * Danh sách LINE ID admin hardcode (luôn có quyền admin bất kể field role trên Firestore).
 * File này KHÔNG phụ thuộc Firebase Admin SDK nên dùng an toàn được ở cả client (LIFF) lẫn server (bot/API).
 * Muốn thêm admin quản lý qua UI, dùng field "role: admin" ở trang Thành viên thay vì sửa file này.
 */
export const ADMIN_LINE_IDS: string[] = [
  'U5bff120f01066eefca60fd0c8ea3537c'
];
