'use client';

import React, { useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useDocumentData, useCollectionData } from 'react-firebase-hooks/firestore';
import { doc, collection, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { Account, AccountFirestore, IncomeRecord, ExpenseRecord, IncomeRecordFirestore, ExpenseRecordFirestore, IncomeFormValues, ExpenseRecordFormValues } from '@/types';
import { incomeSchema, expenseRecordSchema } from '@/types';
import { Loader2, AlertTriangle, ArrowLeft, BookOpen, TrendingUp, TrendingDown, Scale, Edit, Trash2, CalendarIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, startOfYear, endOfYear } from 'date-fns';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { useAuthState } from 'react-firebase-hooks/auth';
import { updateIncomeTransaction, deleteIncomeTransaction } from '@/services/incomeTransactionService';
import { updateExpenseTransaction, deleteExpenseTransaction } from '@/services/expenseTransactionService';

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

const incomeConverter = {
    fromFirestore: (snapshot: any): IncomeRecord => {
        const data = snapshot.data() as Omit<IncomeRecordFirestore, 'id'>;
        return {
            id: snapshot.id,
            ...data,
            date: (data.date as Timestamp).toDate(),
        } as IncomeRecord;
    },
    toFirestore: (record: any) => record,
}

const expenseConverter = {
    fromFirestore: (snapshot: any): ExpenseRecord => {
        const data = snapshot.data() as Omit<ExpenseRecordFirestore, 'id'>;
        return {
            id: snapshot.id,
            ...data,
            date: (data.date as Timestamp).toDate(),
        } as ExpenseRecord;
    },
    toFirestore: (record: any) => record,
}

type MergedTransaction = {
    id: string;
    date: Date;
    description: string;
    type: 'Income' | 'Expense';
    amount: number;
    originalRecord: IncomeRecord | ExpenseRecord;
}

export default function AccountDetailsPage() {
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const [authUser, authLoading] = useAuthState(auth);
    
    const accountId = params.accountId as string;
    const year = searchParams.get('year') ? parseInt(searchParams.get('year') as string) : new Date().getFullYear();

    const [editingTransaction, setEditingTransaction] = useState<MergedTransaction | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

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
        ).withConverter(incomeConverter) : null, 
    [accountId, yearStart, yearEnd]);
    const [incomeRecords, loadingIncome, errorIncome] = useCollectionData(incomeQuery);

    const expenseQuery = useMemo(() => 
        accountId ? query(
            collection(db, 'expense_records'), 
            where('accountId', '==', accountId),
            where('date', '>=', yearStart),
            where('date', '<=', yearEnd)
        ).withConverter(expenseConverter) : null, 
    [accountId, yearStart, yearEnd]);
    const [expenseRecords, loadingExpenses, errorExpenses] = useCollectionData(expenseQuery);

    const transactions = useMemo(() => {
        const allTransactions: MergedTransaction[] = [];

        incomeRecords?.forEach(record => {
            allTransactions.push({
                id: record.id,
                date: record.date,
                description: record.transactionName || `Income: ${record.category}`,
                type: 'Income',
                amount: record.amount,
                originalRecord: record,
            });
        });

        expenseRecords?.forEach(record => {
            allTransactions.push({
                id: record.id,
                date: record.date,
                description: record.expenseName || `Expense: ${record.category}`,
                type: 'Expense',
                amount: record.amount,
                originalRecord: record,
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

    const incomeForm = useForm<IncomeFormValues>({
        resolver: zodResolver(incomeSchema),
    });

    const expenseForm = useForm<ExpenseRecordFormValues>({
        resolver: zodResolver(expenseRecordSchema),
    });

    const handleEdit = (tx: MergedTransaction) => {
        setEditingTransaction(tx);
        if (tx.type === 'Income') {
            const record = tx.originalRecord as IncomeRecord;
            incomeForm.reset({
                code: record.code,
                transactionName: record.transactionName,
                date: record.date,
                amount: record.amount,
                category: record.category,
                accountId: record.accountId || '',
                description: record.description || '',
                memberName: record.memberName || '',
            });
        } else {
            const record = tx.originalRecord as ExpenseRecord;
            expenseForm.reset({
                code: record.code,
                expenseName: record.expenseName,
                date: record.date,
                amount: record.amount,
                description: record.description || '',
                payee: record.payee || '',
                paymentMethod: record.paymentMethod || '',
            });
        }
        setIsEditDialogOpen(true);
    };

    const onIncomeSubmit = async (data: IncomeFormValues) => {
        if (!authUser || !editingTransaction) return;
        try {
            await updateIncomeTransaction(editingTransaction.id, data, authUser.uid, authUser.email);
            toast({ title: "Success", description: "Income transaction updated." });
            setIsEditDialogOpen(false);
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to update transaction." });
        }
    };

    const onExpenseSubmit = async (data: ExpenseRecordFormValues) => {
        if (!authUser || !editingTransaction) return;
        try {
            await updateExpenseTransaction(editingTransaction.id, data, authUser.uid, authUser.email);
            toast({ title: "Success", description: "Expense transaction updated." });
            setIsEditDialogOpen(false);
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to update transaction." });
        }
    };

    const handleDelete = async (tx: MergedTransaction) => {
        if (!authUser) return;
        try {
            if (tx.type === 'Income') {
                await deleteIncomeTransaction(tx.id, authUser.uid, authUser.email);
            } else {
                await deleteExpenseTransaction(tx.id, authUser.uid, authUser.email);
            }
            toast({ title: "Success", description: "Transaction deleted." });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to delete transaction." });
        }
    };

    const formatCurrency = (value: number) => {
        return `${value.toLocaleString('fr-CM', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} XAF`;
    };

    const isLoading = loadingAccount || loadingIncome || loadingExpenses || authLoading;
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
                                        <TableHead className="text-right">Actions</TableHead>
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
                                            <TableCell className="text-right space-x-1">
                                                <Button variant="ghost" size="icon" onClick={() => handleEdit(tx)} aria-label="Edit Transaction"><Edit className="h-4 w-4" /></Button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="icon" aria-label="Delete Transaction"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                            <AlertDialogDescription>This will permanently delete the transaction "{tx.description}". This action cannot be undone.</AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => handleDelete(tx)}>Delete</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </TableCell>
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

            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Edit {editingTransaction?.type} Transaction</DialogTitle>
                        <DialogDescription>Update the details for this record.</DialogDescription>
                    </DialogHeader>
                    
                    {editingTransaction?.type === 'Income' ? (
                        <Form {...incomeForm}>
                            <form onSubmit={incomeForm.handleSubmit(onIncomeSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                                <FormField control={incomeForm.control} name="date" render={({ field }) => (
                                    <FormItem className="flex flex-col"><FormLabel>Date</FormLabel>
                                        <Popover>
                                            <PopoverTrigger asChild><Button variant={"outline"} className={`w-full pl-3 text-left font-normal ${!field.value && "text-muted-foreground"}`} >{field.value ? format(field.value, "PPP") : <span>Pick a date</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent>
                                        </Popover>
                                    <FormMessage /></FormItem>
                                )}/>
                                <FormField control={incomeForm.control} name="code" render={({ field }) => (
                                    <FormItem><FormLabel>Transaction Code</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                )}/>
                                <FormField control={incomeForm.control} name="transactionName" render={({ field }) => (
                                    <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                )}/>
                                <FormField control={incomeForm.control} name="amount" render={({ field }) => (
                                    <FormItem><FormLabel>Amount (XAF)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                                )}/>
                                <FormField control={incomeForm.control} name="description" render={({ field }) => (
                                    <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                                )}/>
                                <DialogFooter>
                                    <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                                    <Button type="submit" disabled={incomeForm.formState.isSubmitting}>
                                        {incomeForm.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null} Save Changes
                                    </Button>
                                </DialogFooter>
                            </form>
                        </Form>
                    ) : (
                        <Form {...expenseForm}>
                            <form onSubmit={expenseForm.handleSubmit(onExpenseSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                                <FormField control={expenseForm.control} name="date" render={({ field }) => (
                                    <FormItem className="flex flex-col"><FormLabel>Date</FormLabel>
                                        <Popover>
                                            <PopoverTrigger asChild><Button variant={"outline"} className={`w-full pl-3 text-left font-normal ${!field.value && "text-muted-foreground"}`} >{field.value ? format(field.value, "PPP") : <span>Pick a date</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent>
                                        </Popover>
                                    <FormMessage /></FormItem>
                                )}/>
                                <FormField control={expenseForm.control} name="code" render={({ field }) => (
                                    <FormItem><FormLabel>Transaction Code</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                )}/>
                                <FormField control={expenseForm.control} name="expenseName" render={({ field }) => (
                                    <FormItem><FormLabel>Name/Purpose</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                )}/>
                                <FormField control={expenseForm.control} name="amount" render={({ field }) => (
                                    <FormItem><FormLabel>Amount (XAF)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                                )}/>
                                <FormField control={expenseForm.control} name="payee" render={({ field }) => (
                                    <FormItem><FormLabel>Payee</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                )}/>
                                <FormField control={expenseForm.control} name="paymentMethod" render={({ field }) => (
                                    <FormItem><FormLabel>Payment Method</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value || ""}>
                                            <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                                            <SelectContent>
                                                <SelectItem value="Cash">Cash</SelectItem>
                                                <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                                                <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                                                <SelectItem value="Cheque">Cheque</SelectItem>
                                                <SelectItem value="Other">Other</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    <FormMessage /></FormItem>
                                )}/>
                                <FormField control={expenseForm.control} name="description" render={({ field }) => (
                                    <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                                )}/>
                                <DialogFooter>
                                    <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                                    <Button type="submit" disabled={expenseForm.formState.isSubmitting}>
                                        {expenseForm.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null} Save Changes
                                    </Button>
                                </DialogFooter>
                            </form>
                        </Form>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}