
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
import type { IncomeSourceFormValues, IncomeCategory, IncomeFormValues } from '@/types';
import { logActivity } from './activityLogService';

const INCOME_SOURCES_COLLECTION = 'income_sources';
const INCOME_RECORDS_COLLECTION = 'income_records';

// For creating budgeted income sources (Offerings, Donations, etc.)
export const addIncomeSource = async (
  sourceData: IncomeSourceFormValues,
  userId: string,
  userEmail: string
): Promise<string> => {
  if (!userId) {
    throw new Error('User ID is required to add an income source.');
  }
  try {
    const { amount, memberName, ...rest } = sourceData;
    const docRef = await addDoc(collection(db, INCOME_SOURCES_COLLECTION), {
      ...rest,
      budget: amount, // 'amount' from form becomes 'budget' in DB for sources
      recordedByUserId: userId,
      createdAt: serverTimestamp(),
    });

    await logActivity(userId, userEmail, "CREATE_INCOME_SOURCE", {
      recordId: docRef.id,
      collectionName: INCOME_SOURCES_COLLECTION,
      extraInfo: `Name: ${sourceData.transactionName}, Budget: ${amount}`
    });

    return docRef.id;
  } catch (error) {
    console.error('Error adding income source: ', error);
    throw new Error("Failed to create income source.");
  }
};

// For recording a direct Tithe transaction
export const addTitheTransaction = async (
  recordData: IncomeSourceFormValues & { date: Date },
  userId: string,
  userEmail: string
): Promise<string> => {
  if (!userId) {
    throw new Error('User ID is required to add a tithe record.');
  }
  try {
    const docRef = await addDoc(collection(db, INCOME_RECORDS_COLLECTION), {
      ...recordData,
      date: Timestamp.fromDate(recordData.date),
      recordedByUserId: userId,
      createdAt: serverTimestamp(),
    });

    await logActivity(userId, userEmail, "CREATE_INCOME_RECORD", {
      recordId: docRef.id,
      collectionName: INCOME_RECORDS_COLLECTION,
      extraInfo: `Tithe from ${recordData.memberName}, Amount: ${recordData.amount}`
    });

    return docRef.id;
  } catch (error) {
    console.error('Error adding tithe record: ', error);
    throw new Error("Failed to save tithe record.");
  }
};


export const updateIncomeSource = async (
  sourceId: string,
  dataToUpdate: Partial<IncomeSourceFormValues>,
  userId: string,
  userEmail: string
): Promise<void> => {
  if (!userId) {
    throw new Error('User ID is required to update an income source.');
  }
  try {
    const recordRef = doc(db, INCOME_SOURCES_COLLECTION, sourceId);
    
    const { amount, ...rest } = dataToUpdate;
    const updatePayload: any = { ...rest };
    if (amount !== undefined) {
        updatePayload.budget = amount; // form 'amount' maps to 'budget'
    }

    await updateDoc(recordRef, updatePayload as DocumentData);

    await logActivity(userId, userEmail, "UPDATE_INCOME_SOURCE", {
      recordId: sourceId,
      collectionName: INCOME_SOURCES_COLLECTION,
      extraInfo: `Updated fields for income source.`
    });
  } catch (error) {
    console.error('Error updating income source: ', error);
    throw new Error("Failed to update income source.");
  }
};

export const deleteIncomeSource = async (
  sourceId: string,
  userId: string,
  userEmail: string
): Promise<void> => {
   if (!userId) {
    throw new Error('User ID is required to delete an income source.');
  }
  try {
    // TODO: Add logic to delete all related transactions under this source
    await deleteDoc(doc(db, INCOME_SOURCES_COLLECTION, sourceId));
    await logActivity(userId, userEmail, "DELETE_INCOME_SOURCE", {
      recordId: sourceId,
      collectionName: INCOME_SOURCES_COLLECTION
    });
  } catch (error) {
    console.error('Error deleting income source: ', error);
    throw new Error("Failed to delete income source.");
  }
};


// The functions below are now for individual transactions, not sources
// They can be moved to a new `incomeTransactionService.ts`

export const addIncomeRecord = async (
  recordData: IncomeFormValues,
  userId: string,
  userEmail: string
): Promise<string> => {
  if (!userId) {
    throw new Error('User ID is required to add an income record.');
  }
  try {
    const docRef = await addDoc(collection(db, INCOME_RECORDS_COLLECTION), {
      ...recordData,
      date: Timestamp.fromDate(recordData.date),
      recordedByUserId: userId,
      createdAt: serverTimestamp(),
    });

    await logActivity(userId, userEmail, "CREATE_INCOME_RECORD", {
      recordId: docRef.id,
      collectionName: INCOME_RECORDS_COLLECTION,
      extraInfo: `Code: ${recordData.code}, Name: ${recordData.transactionName}, Amount: ${recordData.amount}, Category: ${recordData.category}`
    });

    return docRef.id;
  } catch (error) {
    console.error('Error adding income record: ', error);
    throw new Error("Failed to save income record.");
  }
};

export const updateIncomeRecord = async (
  recordId: string,
  dataToUpdate: IncomeFormValues,
  userId: string,
  userEmail: string
): Promise<void> => {
  if (!userId) {
    throw new Error('User ID is required to update an income record.');
  }
  try {
    const recordRef = doc(db, INCOME_RECORDS_COLLECTION, recordId);
    const updatePayload: any = { ...dataToUpdate };
    if (dataToUpdate.date) {
      updatePayload.date = Timestamp.fromDate(dataToUpdate.date);
    }
    await updateDoc(recordRef, updatePayload as DocumentData);

    await logActivity(userId, userEmail, "UPDATE_INCOME_RECORD", {
      recordId: recordId,
      collectionName: INCOME_RECORDS_COLLECTION,
      extraInfo: `Updated fields for income record.`
    });
  } catch (error) {
    console.error('Error updating income record: ', error);
    throw new Error("Failed to update income record.");
  }
};

export const deleteIncomeRecord = async (
  recordId: string,
  userId: string,
  userEmail: string
): Promise<void> => {
   if (!userId) {
    throw new Error('User ID is required to delete an income record.');
  }
  try {
    await deleteDoc(doc(db, INCOME_RECORDS_COLLECTION, recordId));
    await logActivity(userId, userEmail, "DELETE_INCOME_RECORD", {
      recordId: recordId,
      collectionName: INCOME_RECORDS_COLLECTION
    });
  } catch (error) {
    console.error('Error deleting income record: ', error);
    throw new Error("Failed to delete income record.");
  }
};
