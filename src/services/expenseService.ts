
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
      details: `Created expense source: "${sourceData.expenseName}"`
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
    
    const { budget, ...updatePayload } = dataToUpdate;

    await updateDoc(recordRef, updatePayload as DocumentData);

    const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'XAF', minimumFractionDigits: 0 });

    let details = `Updated expense source: "${dataToUpdate.expenseName || sourceId}".`;
    if (dataToUpdate.budgets) {
        const year = Object.keys(dataToUpdate.budgets)[0];
        const newBudget = dataToUpdate.budgets[year];
        details = `Set budget for ${year} to ${currencyFormatter.format(newBudget)} for expense source "${dataToUpdate.expenseName || sourceId}".`;
    }

    await logActivity(userId, userEmail, "UPDATE_EXPENSE_SOURCE", {
      recordId: sourceId,
      collectionName: EXPENSES_SOURCES_COLLECTION,
      details: details
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
    const transactionsQuery = query(collection(db, EXPENSE_RECORDS_COLLECTION), where('expenseSourceId', '==', sourceId));
    const transactionsSnapshot = await getDocs(transactionsQuery);
    
    transactionsSnapshot.forEach(transactionDoc => {
        batch.delete(transactionDoc.ref);
    });

    const sourceRef = doc(db, EXPENSES_SOURCES_COLLECTION, sourceId);
    batch.delete(sourceRef);

    await batch.commit();

    await logActivity(userId, userEmail, "DELETE_EXPENSE_SOURCE", {
      recordId: sourceId,
      collectionName: EXPENSES_SOURCES_COLLECTION,
      details: `Deleted expense source (ID: ${sourceId}) and ${transactionsSnapshot.size} associated transactions.`
    });
  } catch (error) {
    console.error('Error deleting expense source and its transactions: ', error);
    throw new Error("Failed to delete expense source. It may be in use in other records.");
  }
};
