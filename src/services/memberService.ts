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
import type { MemberFormValues } from '@/types';
import { logActivity } from './activityLogService';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const MEMBERS_COLLECTION = 'members';

export const addMember = async (
  memberData: MemberFormValues,
  userId: string,
  userEmail: string
): Promise<void> => {
  const data = {
    ...memberData,
    recordedByUserId: userId,
    createdAt: serverTimestamp(),
  };

  addDoc(collection(db, MEMBERS_COLLECTION), data)
    .then((docRef) => {
      logActivity(userId, userEmail, "CREATE_MEMBER", {
        recordId: docRef.id,
        collectionName: MEMBERS_COLLECTION,
        details: `Added new member: "${memberData.fullName}"`
      });
    })
    .catch(async () => {
      const permissionError = new FirestorePermissionError({
        path: MEMBERS_COLLECTION,
        operation: 'create',
        requestResourceData: data,
      });
      errorEmitter.emit('permission-error', permissionError);
    });
};

export const updateMember = async (
  memberId: string,
  dataToUpdate: MemberFormValues,
  userId: string,
  userEmail: string
): Promise<void> => {
  const memberRef = doc(db, MEMBERS_COLLECTION, memberId);
  
  updateDoc(memberRef, dataToUpdate as DocumentData)
    .then(() => {
      logActivity(userId, userEmail, "UPDATE_MEMBER", {
        recordId: memberId,
        collectionName: MEMBERS_COLLECTION,
        details: `Updated member name to "${dataToUpdate.fullName}"`
      });
    })
    .catch(async () => {
      const permissionError = new FirestorePermissionError({
        path: memberRef.path,
        operation: 'update',
        requestResourceData: dataToUpdate,
      });
      errorEmitter.emit('permission-error', permissionError);
    });
};

export const deleteMember = async (
  memberId: string,
  userId: string,
  userEmail: string
): Promise<void> => {
  const memberRef = doc(db, MEMBERS_COLLECTION, memberId);

  deleteDoc(memberRef)
    .then(() => {
      logActivity(userId, userEmail, "DELETE_MEMBER", {
        recordId: memberId,
        collectionName: MEMBERS_COLLECTION,
        details: `Deleted member with ID: ${memberId}.`
      });
    })
    .catch(async () => {
      const permissionError = new FirestorePermissionError({
        path: memberRef.path,
        operation: 'delete',
      });
      errorEmitter.emit('permission-error', permissionError);
    });
};
