
'use server';

import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { IncomeFormValues } from '@/types';
import { logActivity } from './activityLogService';

const INCOME_RECORDS_COLLECTION = 'income_records';

export const addIncomeTransaction = async (
  recordData: IncomeFormValues,
  incomeSourceId: string,
  userId: string,
  userEmail: string
): Promise<string> => {
  if (!userId) {
    throw new Error('User ID is required to add an income transaction.');
  }
  try {
    const docRef = await addDoc(collection(db, INCOME_RECORDS_COLLECTION), {
      ...recordData,
      date: Timestamp.fromDate(recordData.date),
      incomeSourceId: incomeSourceId,
      recordedByUserId: userId,
      createdAt: serverTimestamp(),
    });

    const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'XAF', minimumFractionDigits: 0 });

    await logActivity(userId, userEmail, "CREATE_INCOME_TRANSACTION", {
      recordId: docRef.id,
      collectionName: INCOME_RECORDS_COLLECTION,
      details: `Recorded income of ${currencyFormatter.format(recordData.amount)} for "${recordData.transactionName}" under source ${incomeSourceId}.`
    });

    return docRef.id;
  } catch (error) {
    console.error('Error adding income transaction: ', error);
    throw new Error("Failed to save income transaction.");
  }
};

export const updateIncomeTransaction = async (
  recordId: string,
  dataToUpdate: Partial<IncomeFormValues>,
  userId: string,
  userEmail: string
): Promise<void> => {
  if (!userId) {
    throw new Error('User ID is required to update an income transaction.');
  }
  try {
    const recordRef = doc(db, INCOME_RECORDS_COLLECTION, recordId);
    const updatePayload: any = { ...dataToUpdate };
    if (dataToUpdate.date) {
      updatePayload.date = Timestamp.fromDate(dataToUpdate.date);
    }
    await updateDoc(recordRef, updatePayload as DocumentData);
    
    const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'XAF', minimumFractionDigits: 0 });

    await logActivity(userId, userEmail, "UPDATE_INCOME_TRANSACTION", {
      recordId: recordId,
      collectionName: INCOME_RECORDS_COLLECTION,
      details: `Updated income transaction: "${dataToUpdate.transactionName || recordId}". Amount: ${dataToUpdate.amount ? currencyFormatter.format(dataToUpdate.amount) : 'unchanged'}.`
    });
  } catch (error) {
    console.error('Error updating income transaction: ', error);
    throw new Error("Failed to update income transaction.");
  }
};

export const deleteIncomeTransaction = async (
  recordId: string,
  userId: string,
  userEmail: string
): Promise<void> => {
   if (!userId) {
    throw new Error('User ID is required to delete an income transaction.');
  }
  try {
    await deleteDoc(doc(db, INCOME_RECORDS_COLLECTION, recordId));
    await logActivity(userId, userEmail, "DELETE_INCOME_TRANSACTION", {
      recordId: recordId,
      collectionName: INCOME_RECORDS_COLLECTION,
      details: `Deleted income transaction with ID: ${recordId}.`
    });
  } catch (error) {
    console.error('Error deleting income transaction: ', error);
    throw new Error("Failed to delete income transaction.");
  }
};
