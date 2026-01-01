
'use client';

import React, { useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useDocumentData } from 'react-firebase-hooks/firestore';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { doc, collection, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Account, AccountFirestore, IncomeRecord, ExpenseRecord } from '@/types';
import { Loader2, AlertTriangle, ArrowLeft, BookOpen, TrendingUp, TrendingDown, Scale } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { format, startOfYear, endOfYear } from 'date-fns';

const accountConverter = {
    fromFirestore: (snapshot: any): Account => {
        const data = snapshot.data() as Omit<AccountFirestore, 'id'>;
        return {
            id: snapshot.id,
            ...data,
            createdAt: (data.createdAt as Timestamp)?.toDate(),
        } as Account;
    },
    toFirestore: (account: Account) => account,
};

const transactionConverter = {
    fromFirestore: (snapshot: any): IncomeRecord | ExpenseRecord => {
        const data = snapshot.data();
        return {
            id: snapshot.id,
            ...data,
            date: (data.date as Timestamp).toDate(),
        } as IncomeRecord | ExpenseRecord;
    },
    toFirestore: (record: any) => record,
}

type MergedTransaction = {
    id: string;
    date: Date;
    description: string;
    type: 'Income' | 'Expense';
    amount: number;
}

export default function AccountDetailsPage() {
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const accountId = params.accountId as string;
    const year = searchParams.get('year') ? parseInt(searchParams.get('year') as string) : new Date().getFullYear();

    const [account, loadingAccount, errorAccount] = useDocumentData(
        accountId ? doc(db, 'accounts', accountId).withConverter(accountConverter) : null
    );
    
    const yearStart = startOfYear(new Date(year, 0, 1));
    const yearEnd = endOfYear(new Date(year, 11, 31));

    const incomeQuery = useMemo(() => 
        accountId ? query(
            collection(db, 'income_records'), 
            where('accountId', '==', accountId),
            where('date', '>=', yearStart),
            where('date', '<=', yearEnd)
        ).withConverter(transactionConverter) : null, 
    [accountId, yearStart, yearEnd]);
    const [incomeRecords, loadingIncome, errorIncome] = useCollectionData(incomeQuery);

    const expenseQuery = useMemo(() => 
        accountId ? query(
            collection(db, 'expense_records'), 
            where('accountId', '==', accountId),
            where('date', '>=', yearStart),
            where('date', '<=', yearEnd)
        ).withConverter(transactionConverter) : null, 
    [accountId, yearStart, yearEnd]);
    const [expenseRecords, loadingExpenses, errorExpenses] = useCollectionData(expenseQuery);

    const transactions = useMemo(() => {
        const allTransactions: MergedTransaction[] = [];

        incomeRecords?.forEach(record => {
            allTransactions.push({
                id: record.id,
                date: record.date,
                description: (record as IncomeRecord).transactionName || `Income: ${(record as IncomeRecord).category}`,
                type: 'Income',
                amount: record.amount,
            });
        });

        expenseRecords?.forEach(record => {
            allTransactions.push({
                id: record.id,
                date: record.date,
                description: (record as ExpenseRecord).expenseName || `Expense: ${(record as ExpenseRecord).category}`,
                type: 'Expense',
                amount: record.amount,
            });
        });

        return allTransactions.sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [incomeRecords, expenseRecords]);
    
    const summary = useMemo(() => {
        const totalIncome = incomeRecords?.reduce((sum, record) => sum + record.amount, 0) || 0;
        const totalExpenses = expenseRecords?.reduce((sum, record) => sum + record.amount, 0) || 0;
        const netBalance = totalIncome - totalExpenses;
        return { totalIncome, totalExpenses, netBalance };
    }, [incomeRecords, expenseRecords]);

    const formatCurrency = (value: number) => {
        return `${value.toLocaleString('fr-CM', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} XAF`;
    };

    const isLoading = loadingAccount || loadingIncome || loadingExpenses;
    const error = errorAccount || errorIncome || errorExpenses;

    if (isLoading) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
    }

    if (error) {
        return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{error.message}</AlertDescription></Alert>;
    }
    
    if (!account) {
        return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Not Found</AlertTitle><AlertDescription>The requested account could not be found.</AlertDescription></Alert>;
    }

    return (
        <div className="space-y-6">
            <Button variant="outline" onClick={() => router.back()} className="mb-4">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Accounts
            </Button>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                        <BookOpen className="h-8 w-8 text-primary" />
                        <span>{account.code} - {account.name}</span>
                    </CardTitle>
                    <CardDescription>Ledger for account type: {account.type} | Year: {year}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                     <div className="flex items-center space-x-4 rounded-md border p-4">
                        <TrendingUp className="h-8 w-8 text-emerald-500" />
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium leading-none">Total Income ({year})</p>
                          <p className="text-xl font-semibold">{formatCurrency(summary.totalIncome)}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4 rounded-md border p-4">
                        <TrendingDown className="h-8 w-8 text-red-500" />
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium leading-none">Total Expenses ({year})</p>
                          <p className="text-xl font-semibold">{formatCurrency(summary.totalExpenses)}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4 rounded-md border p-4">
                        <Scale className={`h-8 w-8 ${summary.netBalance >= 0 ? 'text-primary' : 'text-destructive'}`} />
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium leading-none">Net Balance ({year})</p>
                          <p className="text-xl font-semibold">{formatCurrency(summary.netBalance)}</p>
                        </div>
                      </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Transactions for {year}</CardTitle>
                    <CardDescription>All transactions recorded under this account for the selected year.</CardDescription>
                </CardHeader>
                <CardContent>
                    {transactions.length > 0 ? (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {transactions.map(tx => (
                                        <TableRow key={tx.id}>
                                            <TableCell>{format(tx.date, "PP")}</TableCell>
                                            <TableCell className="max-w-[300px] truncate" title={tx.description}>{tx.description}</TableCell>
                                            <TableCell>
                                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                                    tx.type === 'Income' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                                                }`}>
                                                    {tx.type}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right">{formatCurrency(tx.amount)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <p className="text-center text-muted-foreground py-10">No transactions recorded for this account in {year}.</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
    
