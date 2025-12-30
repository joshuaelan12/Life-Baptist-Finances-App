
"use client";

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlusCircle, Trash2, Loader2, AlertTriangle, ReceiptText, Edit } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import type { ExpenseSource, ExpenseSourceFormValues, ExpenseCategory, ExpenseSourceFirestore, Account, AccountFirestore } from '@/types';
import { expenseSourceSchema, expenseCategories } from '@/types';
import { addExpenseSource, updateExpenseSource, deleteExpenseSource } from '@/services/expenseService';
import { useToast } from "@/hooks/use-toast";
import { auth, db } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { collection, query, orderBy, Timestamp, where, type QueryDocumentSnapshot, type SnapshotOptions } from 'firebase/firestore';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { User } from 'firebase/auth';

const expenseSourceConverter = {
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions): ExpenseSource => {
    const data = snapshot.data(options) as Omit<ExpenseSourceFirestore, 'id'>;
    return {
      id: snapshot.id,
      code: data.code,
      expenseName: data.expenseName,
      category: data.category,
      accountId: data.accountId,
      description: data.description,
      budget: data.budget,
      createdAt: (data.createdAt as Timestamp)?.toDate(),
      recordedByUserId: data.recordedByUserId,
    };
  }
};

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


interface EditExpenseSourceDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  source: ExpenseSource | null;
  onSave: (updatedData: Partial<ExpenseSourceFormValues>, sourceId: string) => Promise<void>;
  currentUser: User | null;
  expenseAccounts: Account[] | undefined;
}

const EditExpenseSourceDialog: React.FC<EditExpenseSourceDialogProps> = ({ isOpen, onOpenChange, source, onSave, currentUser, expenseAccounts }) => {
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  
  const editForm = useForm<ExpenseSourceFormValues>({
    resolver: zodResolver(expenseSourceSchema),
  });

  React.useEffect(() => {
    if (source && isOpen) {
      editForm.reset({
        code: source.code,
        expenseName: source.expenseName,
        category: source.category,
        budget: source.budget || 0,
        accountId: source.accountId || "",
        description: source.description || "",
      });
    }
  }, [source, isOpen, editForm]);

  const handleEditSubmit = async (data: ExpenseSourceFormValues) => {
    if (!source || !currentUser?.uid) {
      toast({ variant: "destructive", title: "Error", description: "Cannot save. Record or user information is missing." });
      return;
    }
    setIsSaving(true);
    try {
      await onSave(data, source.id);
      onOpenChange(false);
    } catch (error) {
      // Error toast is handled by onSave caller
    } finally {
      setIsSaving(false);
    }
  };

  if (!source) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Expense Source</DialogTitle>
          <DialogDescription>
            Update the details for this expense source.
          </DialogDescription>
        </DialogHeader>
        <Form {...editForm}>
          <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
             <FormField control={editForm.control} name="code" render={({ field }) => (
                <FormItem><FormLabel>Code</FormLabel><FormControl><Input {...field} disabled={isSaving}/></FormControl><FormMessage /></FormItem>
            )}/>
             <FormField control={editForm.control} name="expenseName" render={({ field }) => (
                <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} disabled={isSaving}/></FormControl><FormMessage /></FormItem>
            )}/>
             <FormField control={editForm.control} name="category" render={({ field }) => (
                <FormItem><FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isSaving}>
                        <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                        <SelectContent>{expenseCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}</SelectContent>
                    </Select>
                <FormMessage /></FormItem>
            )}/>
             <FormField control={editForm.control} name="accountId" render={({ field }) => (
                <FormItem><FormLabel>Account</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isSaving}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select an expense account" /></SelectTrigger></FormControl>
                        <SelectContent>{expenseAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.code} - {acc.name}</SelectItem>)}</SelectContent>
                    </Select>
                <FormMessage /></FormItem>
            )}/>
             <FormField control={editForm.control} name="budget" render={({ field }) => (
                <FormItem><FormLabel>Annual Budget (XAF)</FormLabel><FormControl><Input type="number" {...field} disabled={isSaving} /></FormControl><FormMessage /></FormItem>
            )}/>
             <FormField control={editForm.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Description (Optional)</FormLabel><FormControl><Textarea {...field} disabled={isSaving} /></FormControl><FormMessage /></FormItem>
            )}/>
            <DialogFooter className="pt-4">
              <DialogClose asChild><Button type="button" variant="outline" disabled={isSaving}>Cancel</Button></DialogClose>
              <Button type="submit" disabled={isSaving || !currentUser}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
};


export default function ExpensesPage() {
  const { toast } = useToast();
  const [authUser, authLoading, authError] = useAuthState(auth);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<ExpenseSource | null>(null);

  const form = useForm<ExpenseSourceFormValues>({
    resolver: zodResolver(expenseSourceSchema),
    defaultValues: {
      code: "",
      expenseName: "",
      category: undefined,
      budget: 0,
      description: "",
      accountId: "",
    },
  });

  const expenseSourcesQuery = useMemo(() => authUser ? query(collection(db, 'expense_sources'), orderBy('expenseName')).withConverter(expenseSourceConverter) : null, [authUser]);
  const [expenseSources, loadingSources, errorSources] = useCollectionData(expenseSourcesQuery);
  
  const accountsQuery = useMemo(() => authUser ? query(collection(db, 'accounts'), where('type', '==', 'Expense'), orderBy('name')).withConverter(accountConverter) : null, [authUser]);
  const [expenseAccounts, loadingAccounts, errorAccounts] = useCollectionData(accountsQuery);


  const onSubmit = async (data: ExpenseSourceFormValues) => {
    if (!authUser?.uid || !authUser.email) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in to add expenses." });
      return;
    }
    try {
      await addExpenseSource(data, authUser.uid, authUser.email);
      form.reset({ code: "", expenseName: "", category: undefined, budget: 0, description: "", accountId: "" });
      toast({ title: "Success", description: "Expense source created successfully." });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Error", description: "Failed to create expense source." });
    }
  };

  const handleOpenEditDialog = (source: ExpenseSource) => {
    setEditingSource(source);
    setIsEditDialogOpen(true);
  };

  const handleSaveEditedSource = async (updatedData: Partial<ExpenseSourceFormValues>, sourceId: string) => {
    if (!authUser?.uid || !authUser.email) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in to update." });
      throw new Error("User not authenticated");
    }
    try {
      await updateExpenseSource(sourceId, updatedData, authUser.uid, authUser.email);
      toast({ title: "Expense Source Updated", description: `${updatedData.expenseName} has been updated.`});
      setEditingSource(null);
    } catch (err) {
        console.error(err);
        toast({ variant: "destructive", title: "Error", description: "Failed to update expense source." });
        throw err;
    }
  };
  
  const handleDeleteRecord = async (source: ExpenseSource) => {
    if (!authUser?.uid || !authUser.email) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in to delete." });
      return;
    }
    try {
      await deleteExpenseSource(source.id, authUser.uid, authUser.email);
      toast({ title: "Deleted", description: `Expense source deleted successfully.` });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Error", description: "Failed to delete expense source." });
    }
  };

  const formatCurrency = (value: number) => {
    return `${value.toLocaleString('fr-CM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} XAF`;
  };
  
  const isLoading = authLoading || loadingSources || loadingAccounts;
  const dataError = authError || errorSources || errorAccounts;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">Loading...</p>
      </div>
    );
  }

  if (dataError) {
     return (
      <div className="space-y-6 md:space-y-8 p-4">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{dataError.message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center">
        <ReceiptText className="mr-3 h-8 w-8 text-primary" />
        Record Expenses
      </h1>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Create Budgeted Expense Item</CardTitle>
          <CardDescription>Define a recurring expense item and set an annual budget for it.</CardDescription>
        </CardHeader>
        <CardContent>
          {!authUser && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Authentication Required</AlertTitle>
              <AlertDescription>Please log in to add or view expense items.</AlertDescription>
            </Alert>
          )}
          {authUser && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Code</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 5001" {...field} disabled={form.formState.isSubmitting}/>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="expenseName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expense Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Office Stationery" {...field} disabled={form.formState.isSubmitting}/>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                    <FormField
                        control={form.control}
                        name="accountId"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Account</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={form.formState.isSubmitting}>
                            <FormControl>
                                <SelectTrigger>
                                <SelectValue placeholder="Select an expense account" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {expenseAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.code} - {acc.name}</SelectItem>)}
                            </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={form.formState.isSubmitting}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select expense category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {expenseCategories.map(cat => (
                               <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                   <FormField
                    control={form.control}
                    name="budget"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Annual Budget (XAF)</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="0.00" {...field} step="0.01" disabled={form.formState.isSubmitting}/>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                 <div className="grid grid-cols-1">
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description (Optional)</FormLabel>
                        <FormControl>
                          <Textarea placeholder="E.g., Yearly budget for all office supplies." {...field} disabled={form.formState.isSubmitting}/>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Button type="submit" className="w-full md:w-auto" disabled={form.formState.isSubmitting || !authUser}>
                  {form.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                   Create Expense Source
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Budgeted Expense Items</CardTitle>
          <CardDescription>Click on an item to view its transaction history and record new expenses.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading records...</p></div>}
          {!isLoading && expenseSources && expenseSources.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Annual Budget</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenseSources.map((source) => {
                      const account = expenseAccounts?.find(a => a.id === source.accountId);
                      return (
                        <TableRow key={source.id}>
                          <TableCell>{source.code}</TableCell>
                          <TableCell>
                            <Link href={`/expenses/${source.id}`} className="hover:underline text-primary font-medium">
                                {source.expenseName}
                            </Link>
                          </TableCell>
                          <TableCell>{account ? `${account.code} - ${account.name}` : 'N/A'}</TableCell>
                          <TableCell>{source.category}</TableCell>
                          <TableCell>{formatCurrency(source.budget || 0)}</TableCell>
                          <TableCell className="text-right space-x-1">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenEditDialog(source)} disabled={!authUser || form.formState.isSubmitting} aria-label="Edit expense source">
                                <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteRecord(source)} disabled={!authUser || form.formState.isSubmitting} aria-label="Delete expense source">
                                <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
           {!isLoading && (!expenseSources || expenseSources.length === 0) && (
            <p className="text-center text-muted-foreground py-10">No budgeted expense items created yet. Add one above!</p>
          )}
        </CardContent>
      </Card>
      <EditExpenseSourceDialog
        isOpen={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        source={editingSource}
        onSave={handleSaveEditedSource}
        currentUser={authUser}
        expenseAccounts={expenseAccounts}
      />
    </div>
  );
}

    