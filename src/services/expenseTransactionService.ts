'use client';

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
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const EXPENSE_RECORDS_COLLECTION = 'expense_records';

export const addExpenseTransaction = async (
  recordData: ExpenseRecordFormValues,
  source: ExpenseSource,
  userId: string,
  userEmail: string
): Promise<void> => {
  const data = {
    ...recordData,
    date: Timestamp.fromDate(recordData.date),
    expenseSourceId: source.id,
    category: source.category,
    accountId: source.accountId,
    recordedByUserId: userId,
    createdAt: serverTimestamp(),
  };

  addDoc(collection(db, EXPENSE_RECORDS_COLLECTION), data)
    .then((docRef) => {
      const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'XAF', minimumFractionDigits: 0 });
      logActivity(userId, userEmail, "CREATE_EXPENSE_TRANSACTION", {
        recordId: docRef.id,
        collectionName: EXPENSE_RECORDS_COLLECTION,
        details: `Recorded expense of ${currencyFormatter.format(recordData.amount)} for "${recordData.expenseName}" under "${source.expenseName}".`
      });
    })
    .catch(async () => {
      const permissionError = new FirestorePermissionError({
        path: EXPENSE_RECORDS_COLLECTION,
        operation: 'create',
        requestResourceData: data,
      });
      errorEmitter.emit('permission-error', permissionError);
    });
};

export const updateExpenseTransaction = async (
  recordId: string,
  dataToUpdate: Partial<ExpenseRecordFormValues>,
  userId: string,
  userEmail: string
): Promise<void> => {
  const recordRef = doc(db, EXPENSE_RECORDS_COLLECTION, recordId);
  const updatePayload: any = { ...dataToUpdate };
  if (dataToUpdate.date) {
    updatePayload.date = Timestamp.fromDate(dataToUpdate.date);
  }

  updateDoc(recordRef, updatePayload as DocumentData)
    .then(() => {
      const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'XAF', minimumFractionDigits: 0 });
      logActivity(userId, userEmail, "UPDATE_EXPENSE_TRANSACTION", {
        recordId: recordId,
        collectionName: EXPENSE_RECORDS_COLLECTION,
        details: `Updated expense transaction: "${dataToUpdate.expenseName || recordId}". Amount: ${dataToUpdate.amount ? currencyFormatter.format(dataToUpdate.amount) : 'unchanged'}.`
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

export const deleteExpenseTransaction = async (
  recordId: string,
  userId: string,
  userEmail: string
): Promise<void> => {
  const recordRef = doc(db, EXPENSE_RECORDS_COLLECTION, recordId);
  
  deleteDoc(recordRef)
    .then(() => {
      logActivity(userId, userEmail, "DELETE_EXPENSE_TRANSACTION", {
        recordId: recordId,
        collectionName: EXPENSE_RECORDS_COLLECTION,
        details: `Deleted expense transaction with ID: ${recordId}.`
      });
    })
    .catch(async () => {
      const permissionError = new FirestorePermissionError({
        path: recordRef.path,
        operation: 'delete',
      });
      errorEmitter.emit('permission-error', permissionError);
    });
};
