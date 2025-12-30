
'use client';

import React, { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useDocumentData, useCollectionData } from 'react-firebase-hooks/firestore';
import { doc, collection, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Member, IncomeRecord, MemberFirestore, IncomeRecordFirestore } from '@/types';
import { Loader2, AlertTriangle, ArrowLeft, DollarSign, HandCoins } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';

const memberConverter = {
    fromFirestore: (snapshot: any): Member => {
        const data = snapshot.data() as Omit<MemberFirestore, 'id'>;
        return {
            id: snapshot.id,
            ...data,
            createdAt: (data.createdAt as Timestamp)?.toDate(),
        };
    },
    toFirestore: (member: Member) => member,
};

const incomeConverter = {
    fromFirestore: (snapshot: any): IncomeRecord => {
      const data = snapshot.data() as Omit<IncomeRecordFirestore, 'id'>;
      return {
        id: snapshot.id,
        ...data,
        date: (data.date as Timestamp).toDate(),
      };
    }
  };

export default function MemberTitheDetailsPage() {
    const router = useRouter();
    const params = useParams();
    const memberId = params.memberId as string;
    
    const [authUser, authLoading, authError] = useAuthState(auth);

    const memberRef = useMemo(() => memberId ? doc(db, 'members', memberId).withConverter(memberConverter) : null, [memberId]);
    const [member, loadingMember, errorMember] = useDocumentData(memberRef);

    const titheQuery = useMemo(() => 
        member ? query(
            collection(db, 'income_records'), 
            where('category', '==', 'Tithe'),
            where('memberName', '==', member.fullName),
            orderBy('date', 'desc')
        ).withConverter(incomeConverter) : null, 
    [member]);
    
    const [titheRecords, loadingTithes, errorTithes] = useCollectionData(titheQuery);

    const totalTithes = useMemo(() => {
        return titheRecords?.reduce((sum, record) => sum + record.amount, 0) || 0;
    }, [titheRecords]);

    const formatCurrency = (value: number) => {
        return `${value.toLocaleString('fr-CM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} XAF`;
    };

    const isLoading = loadingMember || loadingTithes || authLoading;
    const error = errorMember || errorTithes || authError;

    if (isLoading) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
    }

    if (error) {
        return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{error.message}</AlertDescription></Alert>;
    }
    
    if (!member) {
        return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Not Found</AlertTitle><AlertDescription>The requested member could not be found.</AlertDescription></Alert>;
    }

    return (
        <div className="space-y-6">
            <Button variant="outline" onClick={() => router.back()} className="mb-4">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Members
            </Button>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                        <HandCoins className="h-8 w-8 text-primary" />
                        <span>Tithe History for {member.fullName}</span>
                    </CardTitle>
                    <CardDescription>A complete record of all tithes paid by this member.</CardDescription>
                </CardHeader>
                <CardContent>
                     <div className="flex items-center space-x-4 rounded-md border p-4 bg-muted/50">
                        <DollarSign className="h-8 w-8 text-emerald-500" />
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium leading-none">Total Tithes Paid</p>
                          <p className="text-2xl font-bold">{formatCurrency(totalTithes)}</p>
                        </div>
                      </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Tithe Records</CardTitle>
                    <CardDescription>All individual tithe payments are listed below.</CardDescription>
                </CardHeader>
                <CardContent>
                    {loadingTithes ? (
                         <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                    ) : titheRecords && titheRecords.length > 0 ? (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Transaction Code</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                        <TableHead>Description</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {titheRecords.map(record => (
                                        <TableRow key={record.id}>
                                            <TableCell>{record.code}</TableCell>
                                            <TableCell>{format(record.date, "PP")}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(record.amount)}</TableCell>
                                            <TableCell className="max-w-[300px] truncate" title={record.description}>{record.description || 'N/A'}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <p className="text-center text-muted-foreground py-10">No tithe records found for this member.</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
