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
import type { IncomeFormValues } from '@/types';
import { logActivity } from './activityLogService';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const INCOME_RECORDS_COLLECTION = 'income_records';

export const addIncomeTransaction = async (
  recordData: IncomeFormValues,
  incomeSourceId: string,
  userId: string,
  userEmail: string
): Promise<void> => {
  const data = {
    ...recordData,
    date: Timestamp.fromDate(recordData.date),
    incomeSourceId: incomeSourceId,
    recordedByUserId: userId,
    createdAt: serverTimestamp(),
  };

  addDoc(collection(db, INCOME_RECORDS_COLLECTION), data)
    .then((docRef) => {
      const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'XAF', minimumFractionDigits: 0 });
      logActivity(userId, userEmail, "CREATE_INCOME_TRANSACTION", {
        recordId: docRef.id,
        collectionName: INCOME_RECORDS_COLLECTION,
        details: `Recorded income of ${currencyFormatter.format(recordData.amount)} for "${recordData.transactionName}" under source ${incomeSourceId}.`
      });
    })
    .catch(async () => {
      const permissionError = new FirestorePermissionError({
        path: INCOME_RECORDS_COLLECTION,
        operation: 'create',
        requestResourceData: data,
      });
      errorEmitter.emit('permission-error', permissionError);
    });
};

export const updateIncomeTransaction = async (
  recordId: string,
  dataToUpdate: Partial<IncomeFormValues>,
  userId: string,
  userEmail: string
): Promise<void> => {
  const recordRef = doc(db, INCOME_RECORDS_COLLECTION, recordId);
  const updatePayload: any = { ...dataToUpdate };
  if (dataToUpdate.date) {
    updatePayload.date = Timestamp.fromDate(dataToUpdate.date);
  }

  updateDoc(recordRef, updatePayload as DocumentData)
    .then(() => {
      const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'XAF', minimumFractionDigits: 0 });
      logActivity(userId, userEmail, "UPDATE_INCOME_TRANSACTION", {
        recordId: recordId,
        collectionName: INCOME_RECORDS_COLLECTION,
        details: `Updated income transaction: "${dataToUpdate.transactionName || recordId}". Amount: ${dataToUpdate.amount ? currencyFormatter.format(dataToUpdate.amount) : 'unchanged'}.`
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

export const deleteIncomeTransaction = async (
  recordId: string,
  userId: string,
  userEmail: string
): Promise<void> => {
  const recordRef = doc(db, INCOME_RECORDS_COLLECTION, recordId);

  deleteDoc(recordRef)
    .then(() => {
      logActivity(userId, userEmail, "DELETE_INCOME_TRANSACTION", {
        recordId: recordId,
        collectionName: INCOME_RECORDS_COLLECTION,
        details: `Deleted income transaction with ID: ${recordId}.`
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
