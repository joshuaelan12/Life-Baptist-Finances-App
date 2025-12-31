
"use client";

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { BookUser, PlusCircle, Edit, Trash2, Loader2, AlertTriangle, Coins } from "lucide-react";
import { auth, db } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { collection, query, orderBy, Timestamp } from 'firebase/firestore';
import { addAccount, updateAccount, deleteAccount, setBudgetForYear } from '@/services/accountService';
import type { Account, AccountFirestore, AccountType, IncomeRecord, ExpenseRecord } from '@/types';
import { accountSchema, accountTypes } from '@/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';

// Extend accountSchema for the client-side form to include optional budget fields
const addAccountFormSchema = accountSchema.extend({
  initialBudget: z.coerce.number().min(0, "Budget must be zero or more.").optional(),
  budgetYear: z.coerce.number().optional(),
});
type AddAccountFormValues = z.infer<typeof addAccountFormSchema>;

const accountConverter = {
    fromFirestore: (snapshot: any, options: any): Account => {
        const data = snapshot.data(options) as Omit<AccountFirestore, 'id'>;
        return {
            id: snapshot.id,
            ...data,
            createdAt: (data.createdAt as Timestamp)?.toDate(),
        } as Account;
    },
    toFirestore: (account: Account) => account,
};

const transactionConverter = (coll: 'income' | 'expense') => ({
    fromFirestore: (snapshot: any, options: any): IncomeRecord | ExpenseRecord => {
        const data = snapshot.data(options);
        return {
            id: snapshot.id,
            ...data,
            date: (data.date as Timestamp).toDate(),
        } as IncomeRecord | ExpenseRecord;
    },
    toFirestore: (record: any) => record,
})

export default function AccountsPage() {
    const { toast } = useToast();
    const [authUser, authLoading] = useAuthState(auth);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isBudgetDialogOpen, setIsBudgetDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

    const accountsQuery = useMemo(() => authUser ? query(collection(db, 'accounts'), orderBy('code')).withConverter(accountConverter) : null, [authUser]);
    const [accounts, loadingAccounts, errorAccounts] = useCollectionData(accountsQuery);
    
    const incomeQuery = useMemo(() => authUser ? collection(db, 'income_records').withConverter(transactionConverter('income')) : null, [authUser]);
    const [incomeRecords, loadingIncome] = useCollectionData(incomeQuery);

    const expenseQuery = useMemo(() => authUser ? collection(db, 'expense_records').withConverter(transactionConverter('expense')) : null, [authUser]);
    const [expenseRecords, loadingExpenses] = useCollectionData(expenseQuery);

    const addForm = useForm<AddAccountFormValues>({
        resolver: zodResolver(addAccountFormSchema),
        defaultValues: {
            code: "",
            name: "",
            type: undefined,
            initialBudget: 0,
            budgetYear: new Date().getFullYear(),
        },
    });

    const editForm = useForm<AddAccountFormValues>({ resolver: zodResolver(accountSchema) });
    const budgetForm = useForm<{ budget: number }>({
        resolver: zodResolver(z.object({ budget: z.coerce.number().min(0, "Budget must be zero or more.") })),
    });

    const realizedAmounts = useMemo(() => {
        const yearStart = new Date(selectedYear, 0, 1);
        const yearEnd = new Date(selectedYear, 11, 31, 23, 59, 59);
        const amounts: Record<string, number> = {};

        // Aggregate income for income-type accounts
        if (incomeRecords) {
            for (const record of incomeRecords) {
                if (record.accountId && record.date >= yearStart && record.date <= yearEnd) {
                    amounts[record.accountId] = (amounts[record.accountId] || 0) + record.amount;
                }
            }
        }
        // Aggregate expenses for expense-type accounts
        if (expenseRecords) {
            for (const record of expenseRecords) {
                if (record.accountId && record.date >= yearStart && record.date <= yearEnd) {
                    amounts[record.accountId] = (amounts[record.accountId] || 0) + record.amount;
                }
            }
        }
        return amounts;
    }, [incomeRecords, expenseRecords, selectedYear]);

    const handleAddAccount = async (data: AddAccountFormValues) => {
        if (!authUser) return;
        setIsSubmitting(true);
        try {
            const accountCoreData = { code: data.code, name: data.name, type: data.type };
            
            let budgets: Record<string, number> = {};
            if (data.budgetYear && (data.initialBudget || 0) > 0) {
                budgets[data.budgetYear] = data.initialBudget!;
            }

            await addAccount(accountCoreData, budgets, authUser.uid, authUser.email);
            toast({ title: "Success", description: "Account created successfully." });
            addForm.reset({
                code: "",
                name: "",
                type: undefined,
                initialBudget: 0,
                budgetYear: new Date().getFullYear(),
            });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to create account." });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdateAccount = async (data: AddAccountFormValues) => {
        if (!authUser || !selectedAccount) return;
        setIsSubmitting(true);
        try {
            const updateData = { code: data.code, name: data.name, type: data.type };
            await updateAccount(selectedAccount.id, updateData, authUser.uid, authUser.email);
            toast({ title: "Success", description: "Account updated successfully." });
            setIsEditDialogOpen(false);
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to update account." });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDeleteAccount = async (accountId: string) => {
        if (!authUser) return;
        try {
            await deleteAccount(accountId, authUser.uid, authUser.email);
            toast({ title: "Success", description: "Account deleted successfully." });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to delete account." });
        }
    }

    const handleSetBudget = async (data: { budget: number }) => {
        if (!authUser || !selectedAccount) return;
        setIsSubmitting(true);
        try {
            await setBudgetForYear(selectedAccount.id, selectedYear, data.budget, authUser.uid, authUser.email);
            toast({ title: "Success", description: `Budget for ${selectedYear} set successfully.` });
            setIsBudgetDialogOpen(false);
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to set budget." });
        } finally {
            setIsSubmitting(false);
        }
    };

    const openEditDialog = (account: Account) => {
        setSelectedAccount(account);
        editForm.reset(account);
        setIsEditDialogOpen(true);
    };

    const openBudgetDialog = (account: Account) => {
        setSelectedAccount(account);
        const currentBudget = account.budgets?.[selectedYear] || 0;
        budgetForm.reset({ budget: currentBudget });
        setIsBudgetDialogOpen(true);
    };

    const formatCurrency = (value: number) => {
        return `${value.toLocaleString('fr-CM', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} XAF`;
    };

    const yearOptions = Array.from({length: 11}, (_, i) => new Date().getFullYear() + 5 - i);
    const pastYearOptions = Array.from({length: 5}, (_, i) => new Date().getFullYear() - i);


    const isLoading = authLoading || loadingAccounts || loadingIncome || loadingExpenses;

    if (isLoading) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
    }
    
    if (!authUser) {
         return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Not Authenticated</AlertTitle><AlertDescription>Please log in to manage accounts.</AlertDescription></Alert>;
    }

    return (
        <div className="space-y-6 md:space-y-8">
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center">
                <BookUser className="mr-3 h-8 w-8 text-primary" />
                Chart of Accounts
            </h1>

            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle>Add New Account</CardTitle>
                    <CardDescription>Define a new account and set its initial budget for a specific year.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...addForm}>
                        <form onSubmit={addForm.handleSubmit(handleAddAccount)} className="space-y-4">
                            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <FormField control={addForm.control} name="code" render={({ field }) => (
                                    <FormItem><FormLabel>Account Code/Number</FormLabel><FormControl><Input placeholder="e.g., 1001" {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                                <FormField control={addForm.control} name="name" render={({ field }) => (
                                    <FormItem><FormLabel>Account Name</FormLabel><FormControl><Input placeholder="e.g., General Offerings" {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                                <FormField control={addForm.control} name="type" render={({ field }) => (
                                    <FormItem><FormLabel>Account Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a type" /></SelectTrigger></FormControl><SelectContent>{accountTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                                )} />
                            </div>
                            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <FormField control={addForm.control} name="budgetYear" render={({ field }) => (
                                    <FormItem><FormLabel>Budget Year</FormLabel><Select onValueChange={(v) => field.onChange(Number(v))} value={String(field.value)}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>{yearOptions.map(year => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                                )} />
                                <FormField control={addForm.control} name="initialBudget" render={({ field }) => (
                                    <FormItem><FormLabel>Initial Budget (XAF)</FormLabel><FormControl><Input type="number" placeholder="0" {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                            </div>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                                Add Account
                            </Button>
                        </form>
                    </Form>
                </CardContent>
            </Card>

            <Card className="shadow-lg">
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>Manage Accounts</CardTitle>
                        <div className="flex items-center gap-2">
                             <Label htmlFor="year-select">Year:</Label>
                             <Select value={String(selectedYear)} onValueChange={(val) => setSelectedYear(Number(val))}>
                                <SelectTrigger className="w-[120px]" id="year-select">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {pastYearOptions.map(year => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}
                                </SelectContent>
                             </Select>
                        </div>
                    </div>
                     <CardDescription>View, edit, and manage budgets for existing accounts.</CardDescription>
                </CardHeader>
                <CardContent>
                    {errorAccounts && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{errorAccounts.message}</AlertDescription></Alert>}
                    {!errorAccounts && accounts && accounts.length > 0 && (
                         <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Code</TableHead>
                                        <TableHead>Account Name</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Budget ({selectedYear})</TableHead>
                                        <TableHead>Realized ({selectedYear})</TableHead>
                                        <TableHead>% Realized</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {accounts.map(account => {
                                        const budget = account.budgets?.[selectedYear] || 0;
                                        const realized = realizedAmounts[account.id] || 0;
                                        const percentage = budget > 0 ? (realized / budget) * 100 : 0;
                                        return (
                                            <TableRow key={account.id}>
                                                <TableCell>{account.code}</TableCell>
                                                <TableCell>
                                                    <Link href={`/accounts/${account.id}`} className="hover:underline text-primary font-medium">
                                                        {account.name}
                                                    </Link>
                                                </TableCell>
                                                <TableCell>{account.type}</TableCell>
                                                <TableCell>{formatCurrency(budget)}</TableCell>
                                                <TableCell>{formatCurrency(realized)}</TableCell>
                                                <TableCell>{percentage.toFixed(1)}%</TableCell>
                                                <TableCell className="text-right space-x-1">
                                                     <Button variant="ghost" size="icon" onClick={() => openBudgetDialog(account)} aria-label="Set Budget"><Coins className="h-4 w-4" /></Button>
                                                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(account)} aria-label="Edit Account"><Edit className="h-4 w-4" /></Button>
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant="ghost" size="icon" aria-label="Delete Account"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                                <AlertDialogDescription>This action will permanently delete the account "{account.name}". This cannot be undone.</AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => handleDeleteAccount(account.id)}>Delete</AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                    {!errorAccounts && accounts?.length === 0 && <p className="text-center text-muted-foreground py-10">No accounts created yet.</p>}
                </CardContent>
            </Card>

            {/* Edit Account Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Account</DialogTitle>
                        <DialogDescription>Update the details for "{selectedAccount?.name}".</DialogDescription>
                    </DialogHeader>
                    <Form {...editForm}>
                        <form onSubmit={editForm.handleSubmit(handleUpdateAccount)} className="space-y-4 py-4">
                             <FormField control={editForm.control} name="code" render={({ field }) => (
                                <FormItem><FormLabel>Account Code/Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={editForm.control} name="name" render={({ field }) => (
                                <FormItem><FormLabel>Account Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={editForm.control} name="type" render={({ field }) => (
                                <FormItem><FormLabel>Account Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent>{accountTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                            )} />
                             <DialogFooter>
                                <DialogClose asChild><Button type="button" variant="outline" disabled={isSubmitting}>Cancel</Button></DialogClose>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Save Changes
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

             {/* Set Budget Dialog */}
            <Dialog open={isBudgetDialogOpen} onOpenChange={setIsBudgetDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Set Budget for {selectedYear}</DialogTitle>
                        <DialogDescription>Enter the total budget for "{selectedAccount?.name}" for the year {selectedYear}.</DialogDescription>
                    </DialogHeader>
                    <Form {...budgetForm}>
                        <form onSubmit={budgetForm.handleSubmit(handleSetBudget)} className="space-y-4 py-4">
                            <FormField control={budgetForm.control} name="budget" render={({ field }) => (
                                <FormItem><FormLabel>Budget Amount (XAF)</FormLabel><FormControl><Input type="number" placeholder="0" {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                             <DialogFooter>
                                <DialogClose asChild><Button type="button" variant="outline" disabled={isSubmitting}>Cancel</Button></DialogClose>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Set Budget
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
