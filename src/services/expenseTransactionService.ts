
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
import type { ExpenseRecordFormValues, ExpenseSource } from '@/types';
import { logActivity } from './activityLogService';

const EXPENSE_RECORDS_COLLECTION = 'expense_records';

export const addExpenseTransaction = async (
  recordData: ExpenseRecordFormValues,
  source: ExpenseSource,
  userId: string,
  userEmail: string
): Promise<string> => {
  if (!userId) {
    throw new Error('User ID is required to add an expense transaction.');
  }
  try {
    const docRef = await addDoc(collection(db, EXPENSE_RECORDS_COLLECTION), {
      ...recordData,
      date: Timestamp.fromDate(recordData.date),
      expenseSourceId: source.id,
      category: source.category, // Inherit category from source
      accountId: source.accountId, // Inherit accountId from source
      recordedByUserId: userId,
      createdAt: serverTimestamp(),
    });

    await logActivity(userId, userEmail, "CREATE_EXPENSE_TRANSACTION", {
      recordId: docRef.id,
      collectionName: EXPENSE_RECORDS_COLLECTION,
      extraInfo: `Amount: ${recordData.amount} for source ${source.id}`
    });

    return docRef.id;
  } catch (error) {
    console.error('Error adding expense transaction: ', error);
    throw new Error("Failed to save expense transaction.");
  }
};

export const updateExpenseTransaction = async (
  recordId: string,
  dataToUpdate: Partial<ExpenseRecordFormValues>,
  userId: string,
  userEmail: string
): Promise<void> => {
  if (!userId) {
    throw new Error('User ID is required to update an expense transaction.');
  }
  try {
    const recordRef = doc(db, EXPENSE_RECORDS_COLLECTION, recordId);
    const updatePayload: any = { ...dataToUpdate };
    if (dataToUpdate.date) {
      updatePayload.date = Timestamp.fromDate(dataToUpdate.date);
    }
    await updateDoc(recordRef, updatePayload as DocumentData);

    await logActivity(userId, userEmail, "UPDATE_EXPENSE_TRANSACTION", {
      recordId: recordId,
      collectionName: EXPENSE_RECORDS_COLLECTION,
      extraInfo: `Updated fields for expense transaction.`
    });
  } catch (error) {
    console.error('Error updating expense transaction: ', error);
    throw new Error("Failed to update expense transaction.");
  }
};

export const deleteExpenseTransaction = async (
  recordId: string,
  userId: string,
  userEmail: string
): Promise<void> => {
   if (!userId) {
    throw new Error('User ID is required to delete an expense transaction.');
  }
  try {
    await deleteDoc(doc(db, EXPENSE_RECORDS_COLLECTION, recordId));
    await logActivity(userId, userEmail, "DELETE_EXPENSE_TRANSACTION", {
      recordId: recordId,
      collectionName: EXPENSE_RECORDS_COLLECTION
    });
  } catch (error) {
    console.error('Error deleting expense transaction: ', error);
    throw new Error("Failed to delete expense transaction.");
  }
};

    