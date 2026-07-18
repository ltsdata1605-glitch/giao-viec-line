'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';

export interface LinkedMember {
  lineUserId: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  // Thành viên LINE được gắn với email đăng nhập hiện tại (field authEmail trên collection "users"),
  // dùng để tự động điền "Người giao việc" khi tạo task từ dashboard thay vì phải chọn tay.
  linkedMember: LinkedMember | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  linkedMember: null,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkedMember, setLinkedMember] = useState<LinkedMember | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user?.email) {
      setLinkedMember(null);
      return;
    }
    const q = query(collection(db, 'users'), where('authEmail', '==', user.email), limit(1));
    getDocs(q)
      .then((snap) => {
        if (snap.empty) {
          setLinkedMember(null);
          return;
        }
        const data = snap.docs[0].data();
        setLinkedMember({ lineUserId: data.lineUserId, name: data.name });
      })
      .catch((err) => {
        console.error('Error loading linked member', err);
        setLinkedMember(null);
      });
  }, [user?.email]);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signOutFn = async () => {
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, linkedMember, signIn, signOut: signOutFn }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
