
'use server';

import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
  type DocumentData,
  writeBatch,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ExpenseSourceFormValues } from '@/types';
import { logActivity } from './activityLogService';

const EXPENSES_SOURCES_COLLECTION = 'expense_sources';
const EXPENSE_RECORDS_COLLECTION = 'expense_records';

export const addExpenseSource = async (
  sourceData: Omit<ExpenseSourceFormValues, 'budget'>,
  budgets: Record<string, number>,
  userId: string,
  userEmail: string
): Promise<string> => {
  if (!userId) {
    throw new Error('User ID is required to add an expense source.');
  }
  try {
    const docRef = await addDoc(collection(db, EXPENSES_SOURCES_COLLECTION), {
      ...sourceData,
      budgets,
      recordedByUserId: userId,
      createdAt: serverTimestamp(),
    });

    await logActivity(userId, userEmail, "CREATE_EXPENSE_SOURCE", {
      recordId: docRef.id,
      collectionName: EXPENSES_SOURCES_COLLECTION,
      extraInfo: `Name: ${sourceData.expenseName}, Initial Budget: ${JSON.stringify(budgets)}`
    });
    return docRef.id;
  } catch (error) {
    console.error('Error adding expense source: ', error);
    throw new Error("Failed to create expense source.");
  }
};

export const updateExpenseSource = async (
  sourceId: string,
  dataToUpdate: Partial<ExpenseSourceFormValues & { budgets: Record<string, number> | null, budget: number | null }>,
  userId: string,
  userEmail: string
): Promise<void> => {
  if (!userId) {
    throw new Error('User ID is required to update an expense source.');
  }
  try {
    const recordRef = doc(db, EXPENSES_SOURCES_COLLECTION, sourceId);
    
    // The `budget` field from the form is for validation and initial creation only.
    // We remove it here to avoid saving it to Firestore during updates.
    // The actual budget values are in the `budgets` map.
    const { budget, ...updatePayload } = dataToUpdate;

    await updateDoc(recordRef, updatePayload as DocumentData);

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
  const batch = writeBatch(db);
  
  try {
    // 1. Find all transactions related to this source
    const transactionsQuery = query(collection(db, EXPENSE_RECORDS_COLLECTION), where('expenseSourceId', '==', sourceId));
    const transactionsSnapshot = await getDocs(transactionsQuery);
    
    // 2. Add delete operations for each transaction to the batch
    transactionsSnapshot.forEach(transactionDoc => {
        batch.delete(transactionDoc.ref);
    });

    // 3. Add the delete operation for the source itself to the batch
    const sourceRef = doc(db, EXPENSES_SOURCES_COLLECTION, sourceId);
    batch.delete(sourceRef);

    // 4. Commit the batch
    await batch.commit();

    await logActivity(userId, userEmail, "DELETE_EXPENSE_SOURCE", {
      recordId: sourceId,
      collectionName: EXPENSES_SOURCES_COLLECTION,
      extraInfo: `Deleted source and ${transactionsSnapshot.size} associated transactions.`
    });
  } catch (error) {
    console.error('Error deleting expense source and its transactions: ', error);
    throw new Error("Failed to delete expense source. It may be in use in other records.");
  }
};
