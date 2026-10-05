'use client';

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
import type { AccountFormValues } from '@/types';
import { logActivity } from './activityLogService';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const ACCOUNTS_COLLECTION = 'accounts';

export const addAccount = async (
  accountData: AccountFormValues,
  budgets: Record<string, number>,
  userId: string,
  userEmail: string
): Promise<void> => {
  if (!userId) throw new Error('User ID is required');
  
  const data = {
    ...accountData,
    recordedByUserId: userId,
    createdAt: serverTimestamp(),
    budgets,
  };

  addDoc(collection(db, ACCOUNTS_COLLECTION), data)
    .then((docRef) => {
      logActivity(userId, userEmail, "CREATE_ACCOUNT", {
        recordId: docRef.id,
        collectionName: ACCOUNTS_COLLECTION,
        details: `Created new account: "${accountData.name}" (Code: ${accountData.code})`
      });
    })
    .catch(async (error) => {
      const permissionError = new FirestorePermissionError({
        path: ACCOUNTS_COLLECTION,
        operation: 'create',
        requestResourceData: data,
      });
      errorEmitter.emit('permission-error', permissionError);
    });
};

export const updateAccount = async (
  accountId: string,
  dataToUpdate: AccountFormValues,
  userId: string,
  userEmail: string
): Promise<void> => {
  const accountRef = doc(db, ACCOUNTS_COLLECTION, accountId);
  
  updateDoc(accountRef, dataToUpdate as DocumentData)
    .then(() => {
      logActivity(userId, userEmail, "UPDATE_ACCOUNT", {
        recordId: accountId,
        collectionName: ACCOUNTS_COLLECTION,
        details: `Updated account "${dataToUpdate.name}" (Code: ${dataToUpdate.code})`
      });
    })
    .catch(async () => {
      const permissionError = new FirestorePermissionError({
        path: accountRef.path,
        operation: 'update',
        requestResourceData: dataToUpdate,
      });
      errorEmitter.emit('permission-error', permissionError);
    });
};

export const deleteAccount = async (
  accountId: string,
  userId: string,
  userEmail: string
): Promise<void> => {
  const accountRef = doc(db, ACCOUNTS_COLLECTION, accountId);
  
  deleteDoc(accountRef)
    .then(() => {
      logActivity(userId, userEmail, "DELETE_ACCOUNT", {
        recordId: accountId,
        collectionName: ACCOUNTS_COLLECTION,
        details: `Deleted account with ID: ${accountId}.`
      });
    })
    .catch(async () => {
      const permissionError = new FirestorePermissionError({
        path: accountRef.path,
        operation: 'delete',
      });
      errorEmitter.emit('permission-error', permissionError);
    });
};

export const setBudgetForYear = async (
  accountId: string,
  year: number,
  budget: number,
  userId: string,
  userEmail: string
): Promise<void> => {
  const accountRef = doc(db, 'accounts', accountId);
  const budgetField = `budgets.${year}`;
  const updateData = { [budgetField]: budget };

  updateDoc(accountRef, updateData)
    .then(() => {
      const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'XAF', minimumFractionDigits: 0 });
      logActivity(userId, userEmail, "SET_BUDGET", {
          recordId: accountId,
          collectionName: ACCOUNTS_COLLECTION,
          details: `Set budget for year ${year} to ${currencyFormatter.format(budget)} on account ${accountId}`
      });
    })
    .catch(async () => {
      const permissionError = new FirestorePermissionError({
        path: accountRef.path,
        operation: 'update',
        requestResourceData: updateData,
      });
      errorEmitter.emit('permission-error', permissionError);
    });
};
