
'use server';

import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const USERS_COLLECTION = 'users';

interface UserProfile {
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  createdAt?: any;
}

export const createUserDocument = async (
  userId: string,
  data: Omit<UserProfile, 'createdAt'>
): Promise<void> => {
  if (!userId) {
    throw new Error('User ID is required to create a user document.');
  }
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    await setDoc(userRef, {
      ...data,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error creating user document: ', error);
    throw error;
  }
};

export const getUserDocument = async (
  userId: string
): Promise<UserProfile | null> => {
  if (!userId) {
    return null;
  }
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      return userSnap.data() as UserProfile;
    }
    return null;
  } catch (error) {
    console.error('Error getting user document: ', error);
    throw error;
  }
};
