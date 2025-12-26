
"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, AlertTriangle, Users } from "lucide-react";
import { format } from "date-fns";
import { auth, db } from '@/lib/firebase';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { collection, query, orderBy, Timestamp, type DocumentData, type QueryDocumentSnapshot, type SnapshotOptions } from 'firebase/firestore';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { UserProfile, UserProfileFirestore } from '@/types';

const userConverter = {
  toFirestore(user: UserProfile): DocumentData {
    return user as DocumentData;
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options: SnapshotOptions): UserProfile {
    const data = snapshot.data(options) as Omit<UserProfileFirestore, 'id'>;
    return {
      id: snapshot.id,
      email: data.email,
      displayName: data.displayName,
      role: data.role,
      createdAt: (data.createdAt as Timestamp)?.toDate(),
    };
  },
};

export default function ManageUsersPage() {
  const usersCollectionRef = collection(db, 'users');
  const usersQuery = query(usersCollectionRef, orderBy('createdAt', 'desc')).withConverter<UserProfile>(userConverter);

  const [users, isLoading, error] = useCollectionData(usersQuery);

  const formatTimestamp = (date: Date | undefined) => {
    return date ? format(date, "PPpp") : "Date not available"; // e.g., Aug 17, 2023, 2:30:45 PM
  };

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="flex items-center gap-3">
        <Users className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Manage Users</h1>
      </div>
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Registered Users</CardTitle>
          <CardDescription>This is a list of all regular users who have signed up for the application.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading users...</p>
            </div>
          )}
          {!isLoading && error && (
             <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error Loading Users</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}
          {!isLoading && !error && (!users || users.length === 0) && (
            <p className="text-center text-muted-foreground py-10">No users found.</p>
          )}
          {!isLoading && !error && users && users.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Display Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Date Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>{user.displayName}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <span className="font-medium capitalize">
                          {user.role}
                        </span>
                      </TableCell>
                      <TableCell>{formatTimestamp(user.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
