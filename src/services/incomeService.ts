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
  writeBatch,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { IncomeSourceFormValues, IncomeCategory } from '@/types';
import { logActivity } from './activityLogService';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const INCOME_SOURCES_COLLECTION = 'income_sources';
const INCOME_RECORDS_COLLECTION = 'income_records';

export const addIncomeSource = async (
  sourceData: Omit<IncomeSourceFormValues, 'amount'>,
  budgets: Record<string, number>,
  userId: string,
  userEmail: string
): Promise<void> => {
  const { memberName, ...rest } = sourceData;
  const data = {
    ...rest,
    budgets,
    recordedByUserId: userId,
    createdAt: serverTimestamp(),
  };

  addDoc(collection(db, INCOME_SOURCES_COLLECTION), data)
    .then((docRef) => {
      logActivity(userId, userEmail, "CREATE_INCOME_SOURCE", {
        recordId: docRef.id,
        collectionName: INCOME_SOURCES_COLLECTION,
        details: `Created income source: "${sourceData.transactionName}"`
      });
    })
    .catch(async () => {
      const permissionError = new FirestorePermissionError({
        path: INCOME_SOURCES_COLLECTION,
        operation: 'create',
        requestResourceData: data,
      });
      errorEmitter.emit('permission-error', permissionError);
    });
};

export const addTitheTransaction = async (
  recordData: IncomeSourceFormValues & { date: Date },
  userId: string,
  userEmail: string
): Promise<void> => {
  const data = {
    ...recordData,
    date: Timestamp.fromDate(recordData.date),
    recordedByUserId: userId,
    createdAt: serverTimestamp(),
  };

  addDoc(collection(db, INCOME_RECORDS_COLLECTION), data)
    .then((docRef) => {
      const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'XAF', minimumFractionDigits: 0 });
      logActivity(userId, userEmail, "CREATE_INCOME_RECORD", {
        recordId: docRef.id,
        collectionName: INCOME_RECORDS_COLLECTION,
        details: `Recorded Tithe of ${currencyFormatter.format(recordData.amount)} from member "${recordData.memberName}".`
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

export const updateIncomeSource = async (
  sourceId: string,
  dataToUpdate: Partial<IncomeSourceFormValues & { budgets: Record<string, number> | null, budget: number | null }>,
  userId: string,
  userEmail: string
): Promise<void> => {
  const recordRef = doc(db, INCOME_SOURCES_COLLECTION, sourceId);
  const { amount, ...updatePayload } = dataToUpdate;

  updateDoc(recordRef, updatePayload as DocumentData)
    .then(() => {
      const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'XAF', minimumFractionDigits: 0 });
      let details = `Updated income source: "${dataToUpdate.transactionName || sourceId}".`;
      if (dataToUpdate.budgets) {
          const year = Object.keys(dataToUpdate.budgets)[0];
          const newBudget = dataToUpdate.budgets[year];
          details = `Set budget for ${year} to ${currencyFormatter.format(newBudget)} for income source "${dataToUpdate.transactionName || sourceId}".`;
      }
      logActivity(userId, userEmail, "UPDATE_INCOME_SOURCE", {
        recordId: sourceId,
        collectionName: INCOME_SOURCES_COLLECTION,
        details: details,
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

export const deleteIncomeSource = async (
  sourceId: string,
  userId: string,
  userEmail: string
): Promise<void> => {
  const transactionsQuery = query(collection(db, INCOME_RECORDS_COLLECTION), where('incomeSourceId', '==', sourceId));
  
  getDocs(transactionsQuery).then(snapshot => {
    const batch = writeBatch(db);
    snapshot.forEach(d => batch.delete(d.ref));
    batch.delete(doc(db, INCOME_SOURCES_COLLECTION, sourceId));
    
    batch.commit().then(() => {
      logActivity(userId, userEmail, "DELETE_INCOME_SOURCE", {
        recordId: sourceId,
        collectionName: INCOME_SOURCES_COLLECTION,
        details: `Deleted income source (ID: ${sourceId}) and ${snapshot.size} associated transactions.`
      });
    }).catch(async () => {
      const permissionError = new FirestorePermissionError({
        path: `batch: ${INCOME_SOURCES_COLLECTION}/${sourceId}`,
        operation: 'write',
      });
      errorEmitter.emit('permission-error', permissionError);
    });
  });
};
