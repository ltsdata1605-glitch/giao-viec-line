import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin (Singleton)
if (getApps().length === 0) {
  try {
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    if (clientEmail && privateKey && projectId) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      console.log('Firebase Admin initialized.');
    } else {
      console.warn('Firebase Admin credentials missing. Ensure FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY are set.');
      // Optional: Initialize without credentials if running in Google Cloud environment
      // initializeApp(); 
    }
  } catch (error) {
    console.error('Firebase admin initialization error', error);
  }
}

export const adminDb = getApps().length > 0 ? getFirestore() : null;
