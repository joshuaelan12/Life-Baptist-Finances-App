
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
  writeBatch,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { IncomeSourceFormValues, IncomeCategory, IncomeFormValues } from '@/types';
import { logActivity } from './activityLogService';

const INCOME_SOURCES_COLLECTION = 'income_sources';
const INCOME_RECORDS_COLLECTION = 'income_records';

// For creating budgeted income sources (Offerings, Donations, etc.)
export const addIncomeSource = async (
  sourceData: Omit<IncomeSourceFormValues, 'amount'>,
  budgets: Record<string, number>,
  userId: string,
  userEmail: string
): Promise<string> => {
  if (!userId) {
    throw new Error('User ID is required to add an income source.');
  }
  try {
    const { memberName, ...rest } = sourceData;
    const docRef = await addDoc(collection(db, INCOME_SOURCES_COLLECTION), {
      ...rest,
      budgets: budgets,
      recordedByUserId: userId,
      createdAt: serverTimestamp(),
    });

    await logActivity(userId, userEmail, "CREATE_INCOME_SOURCE", {
      recordId: docRef.id,
      collectionName: INCOME_SOURCES_COLLECTION,
      details: `Created income source: "${sourceData.transactionName}"`
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
    
    const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'XAF', minimumFractionDigits: 0 });

    await logActivity(userId, userEmail, "CREATE_INCOME_RECORD", {
      recordId: docRef.id,
      collectionName: INCOME_RECORDS_COLLECTION,
      details: `Recorded Tithe of ${currencyFormatter.format(recordData.amount)} from member "${recordData.memberName}".`
    });

    return docRef.id;
  } catch (error) {
    console.error('Error adding tithe record: ', error);
    throw new Error("Failed to save tithe record.");
  }
};


export const updateIncomeSource = async (
  sourceId: string,
  dataToUpdate: Partial<IncomeSourceFormValues & { budgets: Record<string, number> | null, budget: number | null }>,
  userId: string,
  userEmail: string
): Promise<void> => {
  if (!userId) {
    throw new Error('User ID is required to update an income source.');
  }
  try {
    const recordRef = doc(db, INCOME_SOURCES_COLLECTION, sourceId);
    
    const { amount, ...updatePayload } = dataToUpdate;

    await updateDoc(recordRef, updatePayload as DocumentData);
    
    const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'XAF', minimumFractionDigits: 0 });

    let details = `Updated income source: "${dataToUpdate.transactionName || sourceId}".`;
    if (dataToUpdate.budgets) {
        const year = Object.keys(dataToUpdate.budgets)[0];
        const newBudget = dataToUpdate.budgets[year];
        details = `Set budget for ${year} to ${currencyFormatter.format(newBudget)} for income source "${dataToUpdate.transactionName || sourceId}".`;
    }

    await logActivity(userId, userEmail, "UPDATE_INCOME_SOURCE", {
      recordId: sourceId,
      collectionName: INCOME_SOURCES_COLLECTION,
      details: details,
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
  const batch = writeBatch(db);

  try {
    const transactionsQuery = query(collection(db, INCOME_RECORDS_COLLECTION), where('incomeSourceId', '==', sourceId));
    const transactionSnapshot = await getDocs(transactionsQuery);

    transactionSnapshot.forEach(transactionDoc => {
      batch.delete(transactionDoc.ref);
    });

    const sourceRef = doc(db, INCOME_SOURCES_COLLECTION, sourceId);
    batch.delete(sourceRef);

    await batch.commit();

    await logActivity(userId, userEmail, "DELETE_INCOME_SOURCE", {
      recordId: sourceId,
      collectionName: INCOME_SOURCES_COLLECTION,
      details: `Deleted income source (ID: ${sourceId}) and ${transactionSnapshot.size} associated transactions.`
    });
  } catch (error) {
    console.error('Error deleting income source and transactions: ', error);
    throw new Error("Failed to delete income source and its related records.");
  }
};
