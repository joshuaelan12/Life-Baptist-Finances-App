
'use server';

import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
  where,
  getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { TitheRecord, TitheRecordFirestore, TitheFormValues } from '@/types';
import { logActivity } from './activityLogService';

const TITHES_COLLECTION = 'tithe_records';

const fromFirestore = (docData: any, id: string): TitheRecord => {
  const data = docData as Omit<TitheRecordFirestore, 'id'>;
  return {
    ...data,
    id,
    date: data.date.toDate(),
    createdAt: data.createdAt?.toDate(),
    recordedByUserId: data.recordedByUserId,
  };
};

export const addTitheRecord = async (
  recordData: TitheFormValues,
  userId: string,
  userEmail: string,
  memberName: string,
): Promise<string> => {
  if (!userId) {
    throw new Error('User ID was not provided to addTitheRecord service.');
  }
  try {
    const docRef = await addDoc(collection(db, TITHES_COLLECTION), {
      ...recordData,
      date: Timestamp.fromDate(recordData.date),
      recordedByUserId: userId,
      createdAt: serverTimestamp(),
    });

    await logActivity(userId, userEmail, "CREATE_TITHE_RECORD", {
      recordId: docRef.id,
      collectionName: TITHES_COLLECTION,
      extraInfo: `Member: ${memberName}, Amount: ${recordData.amount}`
    });
    return docRef.id;
  } catch (error) {
    console.error('Error adding tithe record: ', error);
    throw new Error('Failed to save tithe record.');
  }
};

export const getTitheRecordsForMember = async (memberId: string): Promise<TitheRecord[]> => {
  const q = query(
    collection(db, TITHES_COLLECTION), 
    where('memberId', '==', memberId), 
    orderBy('date', 'desc')
  );
  try {
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => fromFirestore(doc.data(), doc.id));
  } catch (error) {
    console.error(`Error fetching tithe records for member ${memberId}:`, error);
    throw new Error('Failed to fetch tithe records.');
  }
};


export const getTitheTotalForMember = async (memberId: string): Promise<number> => {
    const q = query(collection(db, TITHES_COLLECTION), where('memberId', '==', memberId));
    try {
        const querySnapshot = await getDocs(q);
        const total = querySnapshot.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
        return total;
    } catch (error) {
        console.error(`Error calculating tithe total for member ${memberId}:`, error);
        return 0; // Return 0 on error
    }
}

export const updateTitheRecord = async (
  recordId: string,
  dataToUpdate: Partial<Omit<TitheFormValues, 'memberId'>>,
  userId: string,
  userEmail: string,
): Promise<void> => {
  if (!userId) {
    throw new Error('User ID was not provided to updateTitheRecord service.');
  }
  try {
    const recordRef = doc(db, TITHES_COLLECTION, recordId);
    const updatePayload: any = { ...dataToUpdate };
    if (dataToUpdate.date) {
      updatePayload.date = Timestamp.fromDate(dataToUpdate.date);
    }
    await updateDoc(recordRef, updatePayload);

    await logActivity(userId, userEmail, "UPDATE_TITHE_RECORD", {
      recordId: recordId,
      collectionName: TITHES_COLLECTION,
      extraInfo: `Updated tithe record.`
    });
  } catch (error) {
    console.error('Error updating tithe record: ', error);
    throw new Error('Failed to update tithe record.');
  }
};

export const deleteTitheRecord = async (
  recordId: string,
  userId: string,
  userEmail: string
): Promise<void> => {
  if (!userId) {
    throw new Error('User ID was not provided to deleteTitheRecord service.');
  }
  try {
    await deleteDoc(doc(db, TITHES_COLLECTION, recordId));
    await logActivity(userId, userEmail, "DELETE_TITHE_RECORD", {
      recordId: recordId,
      collectionName: TITHES_COLLECTION
    });
  } catch (error) {
    console.error('Error deleting tithe record: ', error);
    throw new Error('Failed to delete tithe record.');
  }
};
