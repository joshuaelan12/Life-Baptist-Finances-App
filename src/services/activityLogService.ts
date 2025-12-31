
'use server';

import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ActivityLogAction } from '@/types';

const ACTIVITY_LOGS_COLLECTION = 'activity_logs';

interface LogActivityDetails {
  recordId?: string;
  collectionName?: string;
  details?: string; // For descriptive plain-English text
}

export const logActivity = async (
  userId: string,
  userEmail: string,
  action: ActivityLogAction,
  logDetails?: LogActivityDetails
): Promise<void> => {
  if (!userId || !userEmail) {
    console.warn('User ID or Email missing, skipping activity log for action:', action);
    // For now, we'll just log a warning and not save the log.
    return;
  }

  try {
    await addDoc(collection(db, ACTIVITY_LOGS_COLLECTION), {
      userId,
      userEmail,
      action,
      timestamp: serverTimestamp(),
      details: logDetails?.details || undefined,
      recordId: logDetails?.recordId || undefined,
      collectionName: logDetails?.collectionName || undefined,
    });
  } catch (error) {
    console.error('Error logging activity: ', error, { userId, userEmail, action, logDetails });
    // Decide if this error should be re-thrown or handled silently
  }
};
