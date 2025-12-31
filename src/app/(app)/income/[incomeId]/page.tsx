
'use client';

import React, { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useDocumentData, useCollectionData } from 'react-firebase-hooks/firestore';
import { doc, collection, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { IncomeSource, IncomeRecord, IncomeSourceFirestore, IncomeRecordFirestore, IncomeFormValues } from '@/types';
import { Loader2, AlertTriangle, ArrowLeft, DollarSign, PlusCircle, Edit, Trash2 } from 'lucide-react';
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
import { format } from 'date-fns';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from 'zod';
import { useToast } from "@/hooks/use-toast";
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { addIncomeTransaction, updateIncomeTransaction, deleteIncomeTransaction } from '@/services/incomeTransactionService';

const incomeSourceConverter = {
    fromFirestore: (snapshot: any): IncomeSource => {
        const data = snapshot.data() as Omit<IncomeSourceFirestore, 'id'>;
        return {
            id: snapshot.id,
            ...data,
            createdAt: (data.createdAt as Timestamp)?.toDate(),
        } as IncomeSource;
    },
    toFirestore: (source: IncomeSource) => source,
};

const incomeTransactionConverter = {
    fromFirestore: (snapshot: any): IncomeRecord => {
        const data = snapshot.data() as Omit<IncomeRecordFirestore, 'id'>;
        return {
            id: snapshot.id,
            ...data,
            date: (data.date as Timestamp).toDate(),
        } as IncomeRecord;
    },
    toFirestore: (record: IncomeRecord) => record,
}

const transactionSchema = z.object({
  code: z.string().min(1, "Transaction code is required."),
  transactionName: z.string().min(1, "Transaction name is required."),
  amount: z.coerce.number().positive("Amount must be positive."),
  date: z.date({ required_error: "Date is required." }),
  description: z.string().optional(),
});
type TransactionFormValues = z.infer<typeof transactionSchema>;

export default function IncomeSourceDetailsPage() {
    const router = useRouter();
    const params = useParams();
    const incomeId = params.incomeId as string;
    const { toast } = useToast();
    const [authUser, authLoading] = useAuthState(auth);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState<IncomeRecord | null>(null);

    const form = useForm<TransactionFormValues>({
        resolver: zodResolver(transactionSchema),
        defaultValues: {
            code: "",
            transactionName: "",
            date: new Date(),
            amount: 0,
            description: "",
        },
    });

    const [source, loadingSource, errorSource] = useDocumentData(
        incomeId ? doc(db, 'income_sources', incomeId).withConverter(incomeSourceConverter) : null
    );

    const transactionsQuery = useMemo(() => 
        incomeId ? query(collection(db, 'income_records'), where('incomeSourceId', '==', incomeId), orderBy('date', 'desc')).withConverter(incomeTransactionConverter) : null, 
    [incomeId]);
    const [transactions, loadingTransactions, errorTransactions] = useCollectionData(transactionsQuery);

    const totalRealized = useMemo(() => {
        return transactions?.reduce((sum, tx) => sum + tx.amount, 0) || 0;
    }, [transactions]);

    const onSubmit = async (data: TransactionFormValues) => {
        if (!authUser || !source) return;
        
        const transactionData: IncomeFormValues = {
            ...data,
            category: source.category,
            accountId: source.accountId || '',
        };

        try {
            if (editingTransaction) {
                await updateIncomeTransaction(editingTransaction.id, transactionData, authUser.uid, authUser.email);
                toast({ title: "Success", description: "Transaction updated." });
                setIsEditDialogOpen(false);
            } else {
                await addIncomeTransaction(transactionData, incomeId, authUser.uid, authUser.email);
                toast({ title: "Success", description: "Transaction recorded." });
            }
            form.reset({ code: "", transactionName: "", date: new Date(), amount: 0, description: "" });
            setEditingTransaction(null);
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to save transaction." });
        }
    };
    
    const handleDelete = async (transactionId: string) => {
        if (!authUser) return;
        try {
            await deleteIncomeTransaction(transactionId, authUser.uid, authUser.email);
            toast({ title: "Success", description: "Transaction deleted." });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to delete transaction." });
        }
    };

    const openEditDialog = (transaction: IncomeRecord) => {
        setEditingTransaction(transaction);
        form.reset({
            code: transaction.code,
            transactionName: transaction.transactionName,
            date: transaction.date,
            amount: transaction.amount,
            description: transaction.description || "",
        });
        setIsEditDialogOpen(true);
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
        return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Not Found</AlertTitle><AlertDescription>The requested income source could not be found.</AlertDescription></Alert>;
    }
    
    const percentageRealized = source.budget && source.budget > 0 ? (totalRealized / source.budget) * 100 : 0;

    return (
        <div className="space-y-6">
            <Button variant="outline" onClick={() => router.back()} className="mb-4">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Income Sources
            </Button>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                        <DollarSign className="h-8 w-8 text-primary" />
                        <span>{source.code} - {source.transactionName}</span>
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
                          <p className="text-sm font-medium leading-none">Total Realized</p>
                          <p className="text-xl font-semibold">{formatCurrency(totalRealized)}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4 rounded-md border p-4">
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium leading-none">% Realized</p>
                          <p className="text-xl font-semibold">{percentageRealized.toFixed(1)}%</p>
                        </div>
                      </div>
                </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader><CardTitle>Add New Transaction</CardTitle></CardHeader>
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
                                    <FormItem><FormLabel>Transaction Code</FormLabel><FormControl><Input placeholder="e.g. 101-01" {...field} /></FormControl><FormMessage /></FormItem>
                                )}/>
                                <FormField control={form.control} name="transactionName" render={({ field }) => (
                                    <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="e.g. First service collection" {...field} /></FormControl><FormMessage /></FormItem>
                                )}/>
                                <FormField control={form.control} name="amount" render={({ field }) => (
                                    <FormItem><FormLabel>Amount (XAF)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                                )}/>
                                <FormField control={form.control} name="description" render={({ field }) => (
                                    <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
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
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {transactions.map(tx => (
                                            <TableRow key={tx.id}>
                                                <TableCell>{format(tx.date, "PP")}</TableCell>
                                                <TableCell>{tx.code}</TableCell>
                                                <TableCell>{tx.transactionName}</TableCell>
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
                                                                <AlertDialogDescription>This will permanently delete the transaction "{tx.transactionName}".</AlertDialogDescription>
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
                            <p className="text-center text-muted-foreground py-10">No transactions recorded yet.</p>
                        )}
                    </CardContent>
                </Card>
            </div>
            
            <Dialog open={isEditDialogOpen} onOpenChange={(open) => { setIsEditDialogOpen(open); if (!open) setEditingTransaction(null); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Transaction</DialogTitle>
                        <DialogDescription>Update the details for this income transaction.</DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
                            {/* The form fields are the same as the add form */}
                            <FormField control={form.control} name="date" render={({ field }) => (
                                <FormItem className="flex flex-col"><FormLabel>Date</FormLabel>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <FormControl><Button variant={"outline"} className={`w-full pl-3 text-left font-normal ${!field.value && "text-muted-foreground"}`} >{field.value ? format(field.value, "PPP") : <span>Pick a date</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date > new Date()} initialFocus /></PopoverContent>
                                    </Popover>
                                <FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name="code" render={({ field }) => (
                                <FormItem><FormLabel>Transaction Code</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name="transactionName" render={({ field }) => (
                                <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name="amount" render={({ field }) => (
                                <FormItem><FormLabel>Amount (XAF)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name="description" render={({ field }) => (
                                <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
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

    