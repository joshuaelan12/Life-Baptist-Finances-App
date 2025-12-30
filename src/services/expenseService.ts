
'use server';

import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ExpenseSourceFormValues } from '@/types';
import { logActivity } from './activityLogService';

const EXPENSES_SOURCES_COLLECTION = 'expense_sources';

export const addExpenseSource = async (
  sourceData: ExpenseSourceFormValues,
  userId: string,
  userEmail: string
): Promise<string> => {
  if (!userId) {
    throw new Error('User ID is required to add an expense source.');
  }
  try {
    const docRef = await addDoc(collection(db, EXPENSES_SOURCES_COLLECTION), {
      ...sourceData,
      recordedByUserId: userId,
      createdAt: serverTimestamp(),
    });

    await logActivity(userId, userEmail, "CREATE_EXPENSE_SOURCE", {
      recordId: docRef.id,
      collectionName: EXPENSES_SOURCES_COLLECTION,
      extraInfo: `Name: ${sourceData.expenseName}, Budget: ${sourceData.budget}`
    });
    return docRef.id;
  } catch (error) {
    console.error('Error adding expense source: ', error);
    throw new Error("Failed to create expense source.");
  }
};

export const updateExpenseSource = async (
  sourceId: string,
  dataToUpdate: Partial<ExpenseSourceFormValues>,
  userId: string,
  userEmail: string
): Promise<void> => {
  if (!userId) {
    throw new Error('User ID is required to update an expense source.');
  }
  try {
    const recordRef = doc(db, EXPENSES_SOURCES_COLLECTION, sourceId);
    await updateDoc(recordRef, dataToUpdate as DocumentData);

    await logActivity(userId, userEmail, "UPDATE_EXPENSE_SOURCE", {
      recordId: sourceId,
      collectionName: EXPENSES_SOURCES_COLLECTION,
      extraInfo: `Updated fields for expense source.`
    });
  } catch (error) {
    console.error('Error updating expense source: ', error);
    throw new Error("Failed to update expense source.");
  }
};

export const deleteExpenseSource = async (
  sourceId: string,
  userId: string,
  userEmail: string
): Promise<void> => {
   if (!userId) {
    throw new Error('User ID is required to delete an expense source.');
  }
  try {
    // TODO: Add logic to check for and possibly delete related transactions
    await deleteDoc(doc(db, EXPENSES_SOURCES_COLLECTION, sourceId));
    await logActivity(userId, userEmail, "DELETE_EXPENSE_SOURCE", {
      recordId: sourceId,
      collectionName: EXPENSES_SOURCES_COLLECTION
    });
  } catch (error) {
    console.error('Error deleting expense source: ', error);
    throw new Error("Failed to delete expense source.");
  }
};

    