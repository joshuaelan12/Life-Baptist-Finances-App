
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
  type DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { IncomeRecord, IncomeRecordFirestore, IncomeFormValues } from '@/types';
import { logActivity } from './activityLogService';

const INCOME_COLLECTION = 'income_records';

export const addIncomeRecord = async (
  recordData: IncomeFormValues,
  userId: string,
  userEmail: string
): Promise<string> => {
  if (!userId) {
    throw new Error('User ID is required to add an income record.');
  }
  try {
    const docRef = await addDoc(collection(db, INCOME_COLLECTION), {
      ...recordData,
      date: Timestamp.fromDate(recordData.date),
      recordedByUserId: userId,
      createdAt: serverTimestamp(),
    });

    await logActivity(userId, userEmail, "CREATE_INCOME_RECORD", {
      recordId: docRef.id,
      collectionName: INCOME_COLLECTION,
      extraInfo: `Amount: ${recordData.amount}, Category: ${recordData.category}`
    });

    return docRef.id;
  } catch (error) {
    console.error('Error adding income record: ', error);
    throw new Error("Failed to save income record.");
  }
};

export const updateIncomeRecord = async (
  recordId: string,
  dataToUpdate: IncomeFormValues,
  userId: string,
  userEmail: string
): Promise<void> => {
  if (!userId) {
    throw new Error('User ID is required to update an income record.');
  }
  try {
    const recordRef = doc(db, INCOME_COLLECTION, recordId);
    const updatePayload: any = { ...dataToUpdate };
    if (dataToUpdate.date) {
      updatePayload.date = Timestamp.fromDate(dataToUpdate.date);
    }
    await updateDoc(recordRef, updatePayload as DocumentData);

    await logActivity(userId, userEmail, "UPDATE_INCOME_RECORD", {
      recordId: recordId,
      collectionName: INCOME_COLLECTION,
      extraInfo: `Updated fields for income record.`
    });
  } catch (error) {
    console.error('Error updating income record: ', error);
    throw new Error("Failed to update income record.");
  }
};

export const deleteIncomeRecord = async (
  recordId: string,
  userId: string,
  userEmail: string
): Promise<void> => {
   if (!userId) {
    throw new Error('User ID is required to delete an income record.');
  }
  try {
    await deleteDoc(doc(db, INCOME_COLLECTION, recordId));
    await logActivity(userId, userEmail, "DELETE_INCOME_RECORD", {
      recordId: recordId,
      collectionName: INCOME_COLLECTION
    });
  } catch (error) {
    console.error('Error deleting income record: ', error);
    throw new Error("Failed to delete income record.");
  }
};

    