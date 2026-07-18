import { adminDb } from '@/lib/firebase-admin';
import { ADMIN_LINE_IDS } from '@/lib/adminIds';

export { ADMIN_LINE_IDS };

/**
 * Admin = có trong danh sách hardcode ADMIN_LINE_IDS, HOẶC có field role="admin" trên collection "users"
 * (quản lý được qua trang Thành viên, không cần sửa code). Dùng ở phía server (bot/API) vì cần Firebase Admin SDK.
 */
export async function isAdmin(userId?: string | null): Promise<boolean> {
  if (!userId) return false;
  if (ADMIN_LINE_IDS.includes(userId)) return true;
  if (!adminDb) return false;
  const snap = await adminDb.collection('users').where('lineUserId', '==', userId).limit(1).get();
  if (snap.empty) return false;
  return snap.docs[0].data().role === 'admin';
}

/**
 * Toàn bộ LINE ID admin: danh sách hardcode ADMIN_LINE_IDS gộp với các user có role="admin" trên
 * Firestore. Dùng để chủ động đẩy thông báo (vd báo cáo tự động), không phải phản hồi 1 tin nhắn cụ thể.
 */
export async function getAllAdminLineIds(): Promise<string[]> {
  const ids = new Set(ADMIN_LINE_IDS);
  if (adminDb) {
    const snap = await adminDb.collection('users').where('role', '==', 'admin').get();
    snap.docs.forEach((doc) => {
      const id = doc.data().lineUserId;
      if (id) ids.add(id);
    });
  }
  return Array.from(ids);
}
