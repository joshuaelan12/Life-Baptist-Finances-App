
'use client';

import React, { useState, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useDocumentData, useCollectionData } from 'react-firebase-hooks/firestore';
import { doc, collection, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ExpenseSource, ExpenseRecord, ExpenseSourceFirestore, ExpenseRecordFirestore, ExpenseRecordFormValues } from '@/types';
import { Loader2, AlertTriangle, ArrowLeft, ReceiptText, PlusCircle, Edit, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { CalendarIcon } from 'lucide-react';
import { format, startOfYear, endOfYear } from 'date-fns';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { expenseRecordSchema } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { addExpenseTransaction, updateExpenseTransaction, deleteExpenseTransaction } from '@/services/expenseTransactionService';
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
    const searchParams = useSearchParams();
    const expenseId = params.expenseId as string;
    const year = searchParams.get('year') ? parseInt(searchParams.get('year') as string) : new Date().getFullYear();

    const { toast } = useToast();
    const [authUser, authLoading] = useAuthState(auth);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState<ExpenseRecord | null>(null);

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

    const yearStart = startOfYear(new Date(year, 0, 1));
    const yearEnd = endOfYear(new Date(year, 11, 31));

    const transactionsQuery = useMemo(() => 
        expenseId ? query(
            collection(db, 'expense_records'), 
            where('expenseSourceId', '==', expenseId),
            where('date', '>=', yearStart),
            where('date', '<=', yearEnd),
            orderBy('date', 'desc')
        ).withConverter(expenseTransactionConverter) : null, 
    [expenseId, yearStart, yearEnd]);
    const [transactions, loadingTransactions, errorTransactions] = useCollectionData(transactionsQuery);

    const totalRealized = useMemo(() => {
        return transactions?.reduce((sum, tx) => sum + tx.amount, 0) || 0;
    }, [transactions]);

    const onSubmit = async (data: ExpenseRecordFormValues) => {
        if (!authUser || !source) return;
        
        try {
             if (editingTransaction) {
                await updateExpenseTransaction(editingTransaction.id, data, authUser.uid, authUser.email);
                toast({ title: "Success", description: "Expense transaction updated." });
                setIsEditDialogOpen(false);
            } else {
                await addExpenseTransaction(data, source, authUser.uid, authUser.email);
                toast({ title: "Success", description: "Expense transaction recorded." });
            }
            form.reset({ code: "", expenseName: "", date: new Date(), amount: 0, description: "", payee: "", paymentMethod: "" });
            setEditingTransaction(null);
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to save transaction." });
        }
    };
    
    const handleDelete = async (transactionId: string) => {
        if (!authUser) return;
        try {
            await deleteExpenseTransaction(transactionId, authUser.uid, authUser.email);
            toast({ title: "Success", description: "Transaction deleted." });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to delete transaction." });
        }
    };

    const openEditDialog = (transaction: ExpenseRecord) => {
        setEditingTransaction(transaction);
        form.reset({
            code: transaction.code,
            expenseName: transaction.expenseName,
            date: transaction.date,
            amount: transaction.amount,
            description: transaction.description || "",
            payee: transaction.payee || "",
            paymentMethod: transaction.paymentMethod || "",
        });
        setIsEditDialogOpen(true);
    };
    
    const formatCurrency = (value: number) => {
        return `${value.toLocaleString('fr-CM', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} XAF`;
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
    
    const budgetForYear = source.budgets?.[year] || (year === 2025 ? source.budget : 0) || 0;
    const percentageRealized = budgetForYear > 0 ? (totalRealized / budgetForYear) * 100 : 0;


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
                    <CardDescription>Category: {source.category} | Year: {year}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                     <div className="flex items-center space-x-4 rounded-md border p-4">
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium leading-none">Annual Budget ({year})</p>
                          <p className="text-xl font-semibold">{formatCurrency(budgetForYear)}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4 rounded-md border p-4">
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium leading-none">Total Realized ({year})</p>
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
                    <CardHeader><CardTitle>Add New Expense Transaction for {year}</CardTitle></CardHeader>
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
                                                <Calendar mode="single" selected={field.value} onSelect={field.onChange} defaultMonth={new Date(year, 0, 1)} fromDate={yearStart} toDate={yearEnd} initialFocus />
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
                    <CardHeader><CardTitle>Recorded Transactions for {year}</CardTitle></CardHeader>
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
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {transactions.map(tx => (
                                            <TableRow key={tx.id}>
                                                <TableCell>{format(tx.date, "PP")}</TableCell>
                                                <TableCell>{tx.code}</TableCell>
                                                <TableCell>{tx.expenseName}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(tx.amount)}</TableCell>
                                                <TableCell className="text-right space-x-1">
                                                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(tx)}><Edit className="h-4 w-4" /></Button>
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                                <AlertDialogDescription>This will permanently delete the transaction "{tx.expenseName}".</AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => handleDelete(tx.id)}>Delete</AlertDialogAction>
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
                            <p className="text-center text-muted-foreground py-10">No transactions recorded yet for {year}.</p>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Dialog open={isEditDialogOpen} onOpenChange={(open) => { setIsEditDialogOpen(open); if (!open) setEditingTransaction(null); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Expense Transaction</DialogTitle>
                        <DialogDescription>Update the details for this transaction.</DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
                            {/* Form fields are the same as the add form */}
                             <FormField control={form.control} name="date" render={({ field }) => (
                                <FormItem className="flex flex-col"><FormLabel>Date</FormLabel>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <FormControl><Button variant={"outline"} className={`w-full pl-3 text-left font-normal ${!field.value && "text-muted-foreground"}`} >{field.value ? format(field.value, "PPP") : <span>Pick a date</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} defaultMonth={new Date(year, 0, 1)} fromDate={yearStart} toDate={yearEnd} initialFocus /></PopoverContent>
                                    </Popover>
                                <FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name="code" render={({ field }) => (
                                <FormItem><FormLabel>Transaction Code</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                            )}/>
                             <FormField control={form.control} name="expenseName" render={({ field }) => (
                                <FormItem><FormLabel>Name/Purpose</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name="amount" render={({ field }) => (
                                <FormItem><FormLabel>Amount (XAF)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name="payee" render={({ field }) => (
                                <FormItem><FormLabel>Payee (Optional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name="paymentMethod" render={({ field }) => (
                                <FormItem><FormLabel>Payment Method (Optional)</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value || ""}><FormControl><SelectTrigger><SelectValue placeholder="Select payment method" /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="Cash">Cash</SelectItem><SelectItem value="Bank Transfer">Bank Transfer</SelectItem><SelectItem value="Mobile Money">Mobile Money</SelectItem><SelectItem value="Cheque">Cheque</SelectItem><SelectItem value="Other">Other</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name="description" render={({ field }) => (
                                <FormItem><FormLabel>Description (Optional)</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                            )}/>
                            <DialogFooter>
                                <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                                <Button type="submit" disabled={form.formState.isSubmitting}>
                                    {form.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                                    Save Changes
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
        </div>
    );
}

    

    