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
        let image_urls: string[] = [];
        if (data.image_urls && Array.isArray(data.image_urls) && data.image_urls.length > 0) {
          image_urls = data.image_urls;
        } else if (data.image_url) {
          image_urls = [data.image_url];
        }

        return {
          reply_text: data.reply_text || '',
          image_urls: image_urls
        };
      }
    } else {
      // Fallback to Client SDK
      const q = query(collection(db, 'keywords'), where('keyword', '==', term), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const data = snap.docs[0].data();
        let image_urls: string[] = [];
        if (data.image_urls && Array.isArray(data.image_urls) && data.image_urls.length > 0) {
          image_urls = data.image_urls;
        } else if (data.image_url) {
          image_urls = [data.image_url];
        }

        return {
          reply_text: data.reply_text || '',
          image_urls: image_urls
        };
      }
    }
  } catch (error) {
    console.error('Error fetching keyword from Firebase:', error);
  }
  return null;
}
