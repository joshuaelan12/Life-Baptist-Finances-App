
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
import type { MemberFormValues } from '@/types';
import { logActivity } from './activityLogService';

const MEMBERS_COLLECTION = 'members';

export const addMember = async (
  memberData: MemberFormValues,
  userId: string,
  userEmail: string
): Promise<string> => {
  if (!userId) {
    throw new Error('User ID is required to add a member.');
  }
  try {
    const docRef = await addDoc(collection(db, MEMBERS_COLLECTION), {
      ...memberData,
      recordedByUserId: userId,
      createdAt: serverTimestamp(),
    });

    await logActivity(userId, userEmail, "CREATE_MEMBER", {
      recordId: docRef.id,
      collectionName: MEMBERS_COLLECTION,
      details: `Added new member: "${memberData.fullName}"`
    });
    return docRef.id;
  } catch (error) {
    console.error('Error adding member: ', error);
    throw new Error("Failed to add member. There might have been a network issue.");
  }
};

export const updateMember = async (
  memberId: string,
  dataToUpdate: MemberFormValues,
  userId: string,
  userEmail: string
): Promise<void> => {
  if (!userId) {
    throw new Error('User ID is required to update a member.');
  }
  try {
    const memberRef = doc(db, MEMBERS_COLLECTION, memberId);
    await updateDoc(memberRef, dataToUpdate as DocumentData);

    await logActivity(userId, userEmail, "UPDATE_MEMBER", {
      recordId: memberId,
      collectionName: MEMBERS_COLLECTION,
      details: `Updated member name to "${dataToUpdate.fullName}"`
    });
  } catch (error) {
    console.error('Error updating member: ', error);
    throw new Error("Failed to update the member.");
  }
};

export const deleteMember = async (
  memberId: string,
  userId: string,
  userEmail: string
): Promise<void> => {
   if (!userId) {
    throw new Error('User ID is required to delete a member.');
  }
  try {
    await deleteDoc(doc(db, MEMBERS_COLLECTION, memberId));
    await logActivity(userId, userEmail, "DELETE_MEMBER", {
      recordId: memberId,
      collectionName: MEMBERS_COLLECTION,
      details: `Deleted member with ID: ${memberId}.`
    });
  } catch (error) {
    console.error('Error deleting member: ', error);
    throw new Error("Failed to delete the member.");
  }
};
