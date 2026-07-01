import { adminDb } from '@/lib/firebase-admin';
// Fallback to client sdk if admin is not configured yet (during development)
import { db } from '@/lib/firebase';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';

export async function getReplyFromFirebase(keyword: string) {
  try {
    const term = keyword.trim().toLowerCase();

    // Prefer Admin SDK if available
    if (adminDb) {
      const snapshot = await adminDb.collection('keywords')
        .where('keyword', '==', term)
        .limit(1)
        .get();

      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        return {
          reply_text: data.reply_text || '',
          image_url: data.image_url || '',
        };
      }
    } else {
      // Fallback to Client SDK
      const q = query(collection(db, 'keywords'), where('keyword', '==', term), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const data = snap.docs[0].data();
        return {
          reply_text: data.reply_text || '',
          image_url: data.image_url || '',
        };
      }
    }
  } catch (error) {
    console.error('Error fetching keyword from Firebase:', error);
  }
  return null;
}
