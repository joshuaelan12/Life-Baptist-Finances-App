
'use client';

import React, { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useDocumentData, useCollectionData } from 'react-firebase-hooks/firestore';
import { doc, collection, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ExpenseSource, ExpenseRecord, ExpenseSourceFirestore, ExpenseRecordFirestore, ExpenseRecordFormValues } from '@/types';
import { Loader2, AlertTriangle, ArrowLeft, ReceiptText, PlusCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Textarea } from '@/components/ui/textarea';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { expenseRecordSchema } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { addExpenseTransaction } from '@/services/expenseTransactionService';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';


const expenseSourceConverter = {
    fromFirestore: (snapshot: any): ExpenseSource => {
        const data = snapshot.data() as Omit<ExpenseSourceFirestore, 'id'>;
        return {
            id: snapshot.id,
            ...data,
            createdAt: (data.createdAt as Timestamp)?.toDate(),
        } as ExpenseSource;
    },
    toFirestore: (source: ExpenseSource) => source,
};

const expenseTransactionConverter = {
    fromFirestore: (snapshot: any): ExpenseRecord => {
        const data = snapshot.data() as Omit<ExpenseRecordFirestore, 'id'>;
        return {
            id: snapshot.id,
            ...data,
            date: (data.date as Timestamp).toDate(),
        } as ExpenseRecord;
    },
    toFirestore: (record: ExpenseRecord) => record,
}

export default function ExpenseSourceDetailsPage() {
    const router = useRouter();
    const params = useParams();
    const expenseId = params.expenseId as string;
    const { toast } = useToast();
    const [authUser, authLoading] = useAuthState(auth);

    const form = useForm<ExpenseRecordFormValues>({
        resolver: zodResolver(expenseRecordSchema),
        defaultValues: {
            code: "",
            expenseName: "",
            date: new Date(),
            amount: 0,
            description: "",
            payee: "",
            paymentMethod: "",
        },
    });

    const [source, loadingSource, errorSource] = useDocumentData(
        expenseId ? doc(db, 'expense_sources', expenseId).withConverter(expenseSourceConverter) : null
    );

    const transactionsQuery = useMemo(() => 
        expenseId ? query(collection(db, 'expense_records'), where('expenseSourceId', '==', expenseId), orderBy('date', 'desc')).withConverter(expenseTransactionConverter) : null, 
    [expenseId]);
    const [transactions, loadingTransactions, errorTransactions] = useCollectionData(transactionsQuery);

    const totalRealized = useMemo(() => {
        return transactions?.reduce((sum, tx) => sum + tx.amount, 0) || 0;
    }, [transactions]);

    const onSubmit = async (data: ExpenseRecordFormValues) => {
        if (!authUser || !source) return;
        try {
            await addExpenseTransaction(data, source, authUser.uid, authUser.email);
            toast({ title: "Success", description: "Expense transaction recorded." });
            form.reset({ code: "", expenseName: "", date: new Date(), amount: 0, description: "", payee: "", paymentMethod: "" });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to record transaction." });
        }
    };
    
    const formatCurrency = (value: number) => {
        return `${value.toLocaleString('fr-CM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} XAF`;
    };

    const isLoading = loadingSource || loadingTransactions || authLoading;
    const error = errorSource || errorTransactions;

    if (isLoading) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
    }

    if (error) {
        return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{error.message}</AlertDescription></Alert>;
    }
    
    if (!source) {
        return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Not Found</AlertTitle><AlertDescription>The requested expense source could not be found.</AlertDescription></Alert>;
    }
    
    const percentageRealized = source.budget && source.budget > 0 ? (totalRealized / source.budget) * 100 : 0;

    return (
        <div className="space-y-6">
            <Button variant="outline" onClick={() => router.back()} className="mb-4">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Expense Sources
            </Button>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                        <ReceiptText className="h-8 w-8 text-primary" />
                        <span>{source.code} - {source.expenseName}</span>
                    </CardTitle>
                    <CardDescription>Category: {source.category}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                     <div className="flex items-center space-x-4 rounded-md border p-4">
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium leading-none">Annual Budget</p>
                          <p className="text-xl font-semibold">{formatCurrency(source.budget || 0)}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4 rounded-md border p-4">
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium leading-none">Total Realized (Spent)</p>
                          <p className="text-xl font-semibold">{formatCurrency(totalRealized)}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4 rounded-md border p-4">
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium leading-none">% Realized</p>
                          <p className={`text-xl font-semibold ${percentageRealized > 100 ? 'text-destructive' : 'text-foreground'}`}>{percentageRealized.toFixed(1)}%</p>
                        </div>
                      </div>
                </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader><CardTitle>Add New Expense Transaction</CardTitle></CardHeader>
                    <CardContent>
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                <FormField control={form.control} name="date" render={({ field }) => (
                                    <FormItem className="flex flex-col"><FormLabel>Date</FormLabel>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <FormControl>
                                                    <Button variant={"outline"} className={`w-full pl-3 text-left font-normal ${!field.value && "text-muted-foreground"}`} >
                                                        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                    </Button>
                                                </FormControl>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date > new Date()} initialFocus />
                                            </PopoverContent>
                                        </Popover>
                                    <FormMessage /></FormItem>
                                )}/>
                                <FormField control={form.control} name="code" render={({ field }) => (
                                    <FormItem><FormLabel>Transaction Code</FormLabel><FormControl><Input placeholder="e.g. 501-01" {...field} /></FormControl><FormMessage /></FormItem>
                                )}/>
                                 <FormField control={form.control} name="expenseName" render={({ field }) => (
                                    <FormItem><FormLabel>Name/Purpose</FormLabel><FormControl><Input placeholder="e.g., January Electricity Bill" {...field} /></FormControl><FormMessage /></FormItem>
                                )}/>
                                <FormField control={form.control} name="amount" render={({ field }) => (
                                    <FormItem><FormLabel>Amount (XAF)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                                )}/>
                                <FormField control={form.control} name="payee" render={({ field }) => (
                                    <FormItem><FormLabel>Payee (Optional)</FormLabel><FormControl><Input placeholder="e.g., ENEO" {...field} /></FormControl><FormMessage /></FormItem>
                                )}/>
                                <FormField control={form.control} name="paymentMethod" render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Payment Method (Optional)</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value || ""}>
                                        <FormControl>
                                            <SelectTrigger><SelectValue placeholder="Select payment method" /></SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="Cash">Cash</SelectItem>
                                            <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                                            <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                                            <SelectItem value="Cheque">Cheque</SelectItem>
                                            <SelectItem value="Other">Other</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                    </FormItem>
                                )}/>
                                <FormField control={form.control} name="description" render={({ field }) => (
                                    <FormItem><FormLabel>Description (Optional)</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                                )}/>
                                <Button type="submit" disabled={form.formState.isSubmitting}><PlusCircle className="mr-2 h-4 w-4" /> Add Transaction</Button>
                            </form>
                        </Form>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle>Recorded Transactions</CardTitle></CardHeader>
                    <CardContent>
                        {loadingTransactions ? <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                        : transactions && transactions.length > 0 ? (
                            <div className="overflow-x-auto max-h-[400px]">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Code</TableHead>
                                            <TableHead>Name</TableHead>
                                            <TableHead className="text-right">Amount</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {transactions.map(tx => (
                                            <TableRow key={tx.id}>
                                                <TableCell>{format(tx.date, "PP")}</TableCell>
                                                <TableCell>{tx.code}</TableCell>
                                                <TableCell>{tx.expenseName}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(tx.amount)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        ) : (
                            <p className="text-center text-muted-foreground py-10">No transactions recorded yet.</p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

    