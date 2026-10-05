'use client';

import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ActivityLogAction } from '@/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const ACTIVITY_LOGS_COLLECTION = 'activity_logs';

interface LogActivityDetails {
  recordId?: string;
  collectionName?: string;
  details?: string;
}

export const logActivity = async (
  userId: string,
  userEmail: string,
  action: ActivityLogAction,
  logDetails?: LogActivityDetails
): Promise<void> => {
  if (!userId || !userEmail) return;

  const data = {
    userId,
    userEmail,
    action,
    timestamp: serverTimestamp(),
    details: logDetails?.details || undefined,
    recordId: logDetails?.recordId || undefined,
    collectionName: logDetails?.collectionName || undefined,
  };

  addDoc(collection(db, ACTIVITY_LOGS_COLLECTION), data)
    .catch(async () => {
       const permissionError = new FirestorePermissionError({
        path: ACTIVITY_LOGS_COLLECTION,
        operation: 'create',
        requestResourceData: data,
      });
      errorEmitter.emit('permission-error', permissionError);
    });
};
