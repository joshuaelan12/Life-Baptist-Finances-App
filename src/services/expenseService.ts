'use client';

import {
  collection,
  addDoc,
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
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const EXPENSES_SOURCES_COLLECTION = 'expense_sources';
const EXPENSE_RECORDS_COLLECTION = 'expense_records';

export const addExpenseSource = async (
  sourceData: Omit<ExpenseSourceFormValues, 'budget'>,
  budgets: Record<string, number>,
  userId: string,
  userEmail: string
): Promise<void> => {
  const data = {
    ...sourceData,
    budgets,
    recordedByUserId: userId,
    createdAt: serverTimestamp(),
  };

  addDoc(collection(db, EXPENSES_SOURCES_COLLECTION), data)
    .then((docRef) => {
      logActivity(userId, userEmail, "CREATE_EXPENSE_SOURCE", {
        recordId: docRef.id,
        collectionName: EXPENSES_SOURCES_COLLECTION,
        details: `Created expense source: "${sourceData.expenseName}"`
      });
    })
    .catch(async () => {
      const permissionError = new FirestorePermissionError({
        path: EXPENSES_SOURCES_COLLECTION,
        operation: 'create',
        requestResourceData: data,
      });
      errorEmitter.emit('permission-error', permissionError);
    });
};

export const updateExpenseSource = async (
  sourceId: string,
  dataToUpdate: Partial<ExpenseSourceFormValues & { budgets: Record<string, number> | null, budget: number | null }>,
  userId: string,
  userEmail: string
): Promise<void> => {
  const recordRef = doc(db, EXPENSES_SOURCES_COLLECTION, sourceId);
  const { budget, ...updatePayload } = dataToUpdate;

  updateDoc(recordRef, updatePayload as DocumentData)
    .then(() => {
      const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'XAF', minimumFractionDigits: 0 });
      let details = `Updated expense source: "${dataToUpdate.expenseName || sourceId}".`;
      if (dataToUpdate.budgets) {
          const year = Object.keys(dataToUpdate.budgets)[0];
          const newBudget = dataToUpdate.budgets[year];
          details = `Set budget for ${year} to ${currencyFormatter.format(newBudget)} for expense source "${dataToUpdate.expenseName || sourceId}".`;
      }
      logActivity(userId, userEmail, "UPDATE_EXPENSE_SOURCE", {
        recordId: sourceId,
        collectionName: EXPENSES_SOURCES_COLLECTION,
        details: details
      });
    })
    .catch(async () => {
      const permissionError = new FirestorePermissionError({
        path: recordRef.path,
        operation: 'update',
        requestResourceData: updatePayload,
      });
      errorEmitter.emit('permission-error', permissionError);
    });
};

export const deleteExpenseSource = async (
  sourceId: string,
  userId: string,
  userEmail: string
): Promise<void> => {
  const transactionsQuery = query(collection(db, EXPENSE_RECORDS_COLLECTION), where('expenseSourceId', '==', sourceId));
  
  getDocs(transactionsQuery).then(snapshot => {
    const batch = writeBatch(db);
    snapshot.forEach(d => batch.delete(d.ref));
    batch.delete(doc(db, EXPENSES_SOURCES_COLLECTION, sourceId));

    batch.commit().then(() => {
      logActivity(userId, userEmail, "DELETE_EXPENSE_SOURCE", {
        recordId: sourceId,
        collectionName: EXPENSES_SOURCES_COLLECTION,
        details: `Deleted expense source (ID: ${sourceId}) and ${snapshot.size} associated transactions.`
      });
    }).catch(async () => {
      const permissionError = new FirestorePermissionError({
        path: `batch: ${EXPENSES_SOURCES_COLLECTION}/${sourceId}`,
        operation: 'write',
      });
      errorEmitter.emit('permission-error', permissionError);
    });
  });
};
