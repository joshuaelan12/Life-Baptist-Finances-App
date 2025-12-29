
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
import type { AccountFormValues } from '@/types';
import { logActivity } from './activityLogService';

const ACCOUNTS_COLLECTION = 'accounts';

export const addAccount = async (
  accountData: AccountFormValues,
  userId: string,
  userEmail: string
): Promise<string> => {
  if (!userId) {
    throw new Error('User ID is required to add an account.');
  }
  try {
    const docRef = await addDoc(collection(db, ACCOUNTS_COLLECTION), {
      ...accountData,
      recordedByUserId: userId,
      createdAt: serverTimestamp(),
      budgets: {}, // Initialize with empty budget map
    });

    await logActivity(userId, userEmail, "CREATE_ACCOUNT", {
      recordId: docRef.id,
      collectionName: ACCOUNTS_COLLECTION,
      extraInfo: `Code: ${accountData.code}, Name: ${accountData.name}`
    });
    return docRef.id;
  } catch (error) {
    console.error('Error adding account: ', error);
    throw new Error("Failed to create the account. The account code may already exist or there was a network issue.");
  }
};

export const updateAccount = async (
  accountId: string,
  dataToUpdate: AccountFormValues,
  userId: string,
  userEmail: string
): Promise<void> => {
  if (!userId) {
    throw new Error('User ID is required to update an account.');
  }
  try {
    const accountRef = doc(db, ACCOUNTS_COLLECTION, accountId);
    await updateDoc(accountRef, dataToUpdate as DocumentData);

    await logActivity(userId, userEmail, "UPDATE_ACCOUNT", {
      recordId: accountId,
      collectionName: ACCOUNTS_COLLECTION,
      extraInfo: `Updated account details for ${dataToUpdate.name}`
    });
  } catch (error) {
    console.error('Error updating account: ', error);
    throw new Error("Failed to update the account.");
  }
};

export const deleteAccount = async (
  accountId: string,
  userId: string,
  userEmail: string
): Promise<void> => {
   if (!userId) {
    throw new Error('User ID is required to delete an account.');
  }
  try {
    await deleteDoc(doc(db, ACCOUNTS_COLLECTION, accountId));
    await logActivity(userId, userEmail, "DELETE_ACCOUNT", {
      recordId: accountId,
      collectionName: ACCOUNTS_COLLECTION
    });
  } catch (error) {
    console.error('Error deleting account: ', error);
    throw new Error("Failed to delete the account. It may be in use in other records.");
  }
};


export const setBudgetForYear = async (
  accountId: string,
  year: number,
  budget: number,
  userId: string,
  userEmail: string
): Promise<void> => {
  if (!userId) {
    throw new Error('User ID is required to set a budget.');
  }
  try {
    const accountRef = doc(db, ACCOUNTS_COLLECTION, accountId);
    // Use dot notation to update a specific field in a map
    const budgetField = `budgets.${year}`;
    await updateDoc(accountRef, {
      [budgetField]: budget
    });

    await logActivity(userId, userEmail, "SET_BUDGET", {
        recordId: accountId,
        collectionName: ACCOUNTS_COLLECTION,
        extraInfo: `Set budget for year ${year} to ${budget}`
    });
  } catch (error) {
    console.error(`Error setting budget for year ${year}: `, error);
    throw new Error(`Failed to set budget for ${year}.`);
  }
};
