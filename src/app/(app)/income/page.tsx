
"use client";

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlusCircle, Trash2, Loader2, AlertTriangle, DollarSign, Edit, Coins } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import type { IncomeSource, IncomeSourceFormValues, IncomeCategory, IncomeSourceFirestore, Account, AccountFirestore, Member, MemberFirestore, IncomeRecord } from '@/types';
import { incomeSourceSchema } from '@/types';
import { addIncomeSource, deleteIncomeSource, updateIncomeSource, addTitheTransaction } from '@/services/incomeService';
import { useToast } from "@/hooks/use-toast";
import { auth, db } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { collection, query, orderBy, Timestamp, where, type QueryDocumentSnapshot, type SnapshotOptions } from 'firebase/firestore';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';

const incomeSourceConverter = {
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions): IncomeSource => {
    const data = snapshot.data(options) as Omit<IncomeSourceFirestore, 'id'>;
    return {
      id: snapshot.id,
      ...data,
      createdAt: (data.createdAt as Timestamp)?.toDate(),
    };
  }
};

const incomeRecordConverter = {
    fromFirestore: (snapshot: any): IncomeRecord => {
        const data = snapshot.data();
        return {
            id: snapshot.id,
            ...data,
            date: (data.date as Timestamp).toDate(),
        } as IncomeRecord;
    },
    toFirestore: (record: IncomeRecord) => record,
}


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

export default function IncomePage() {
  const { toast } = useToast();
  const [authUser, authLoading] = useAuthState(auth);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBudgetDialogOpen, setIsBudgetDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<IncomeSource | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const form = useForm<IncomeSourceFormValues>({
    resolver: zodResolver(incomeSourceSchema),
    defaultValues: {
      code: "",
      transactionName: "",
      category: undefined,
      amount: 0,
      description: "",
      memberName: "",
      accountId: "",
    },
  });

  const budgetForm = useForm<{ budget: number }>({
      resolver: zodResolver(z.object({ budget: z.coerce.number().min(0, "Budget must be zero or more.") })),
  });
  const selectedCategory = form.watch("category");

  const incomeSourcesQuery = useMemo(() => authUser ? query(collection(db, 'income_sources'), orderBy('transactionName')).withConverter(incomeSourceConverter) : null, [authUser]);
  const [incomeSources, loadingSources, errorSources] = useCollectionData(incomeSourcesQuery);
  
  const incomeRecordsQuery = useMemo(() => authUser ? collection(db, 'income_records').withConverter(incomeRecordConverter) : null, [authUser]);
  const [incomeRecords, loadingRecords, errorRecords] = useCollectionData(incomeRecordsQuery);
  
  const accountsQuery = useMemo(() => authUser ? query(collection(db, 'accounts'), where('type', '==', 'Income'), orderBy('name')).withConverter(accountConverter) : null, [authUser]);
  const [incomeAccounts, loadingAccounts, errorAccounts] = useCollectionData(accountsQuery);
  
  const membersQuery = useMemo(() => authUser ? query(collection(db, 'members'), orderBy('fullName')).withConverter(memberConverter) : null, [authUser]);
  const [members, loadingMembers, errorMembers] = useCollectionData(membersQuery);

  const realizedAmounts = useMemo(() => {
    if (!incomeRecords) return {};
    const yearStart = new Date(selectedYear, 0, 1);
    const yearEnd = new Date(selectedYear, 11, 31, 23, 59, 59);
    const amounts: Record<string, number> = {};
    for (const record of incomeRecords) {
        if (record.incomeSourceId && record.date >= yearStart && record.date <= yearEnd) {
            amounts[record.incomeSourceId] = (amounts[record.incomeSourceId] || 0) + record.amount;
        }
    }
    return amounts;
  }, [incomeRecords, selectedYear]);

  const onSubmit = async (data: IncomeSourceFormValues) => {
    if (!authUser?.uid || !authUser.email) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in." });
      return;
    }
    setIsSubmitting(true);
    try {
        if (data.category === 'Tithe') {
            await addTitheTransaction({ ...data, date: new Date() }, authUser.uid, authUser.email);
            toast({ title: "Success", description: "Tithe record saved successfully." });
        } else {
            const budgetForYear = { [selectedYear]: data.amount || 0 };
            await addIncomeSource({ ...data, category: data.category as IncomeCategory }, budgetForYear, authUser.uid, authUser.email);
            toast({ title: "Success", description: "Income source created successfully." });
        }
        form.reset({ code: "", transactionName: "", category: undefined, amount: 0, description: "", memberName: "", accountId: "" });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Error", description: "Failed to save record." });
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const handleOpenEditDialog = (source: IncomeSource) => {
    setEditingSource(source);
    setIsEditDialogOpen(true);
  };
  
  const handleOpenBudgetDialog = (source: IncomeSource) => {
    setEditingSource(source);
    // "Smart Upgrade" read logic: check new budgets map first, then fall back to old budget field if year is 2025
    const budgetForSelectedYear = source.budgets?.[selectedYear] || (selectedYear === 2025 ? source.budget : 0) || 0;
    budgetForm.reset({ budget: budgetForSelectedYear });
    setIsBudgetDialogOpen(true);
  };

  const handleSaveEditedSource = async (updatedData: Partial<IncomeSourceFormValues>, sourceId: string) => {
    if (!authUser?.uid || !authUser.email || !editingSource) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in to update." });
      throw new Error("User not authenticated");
    }
    try {
      const { amount, memberName, ...coreData } = updatedData;
      await updateIncomeSource(sourceId, coreData, authUser.uid, authUser.email);
      toast({ title: "Income Source Updated", description: `${updatedData.transactionName} has been updated.`});
    } catch (err) {
        console.error(err);
        toast({ variant: "destructive", title: "Error", description: "Failed to update income source." });
        throw err;
    }
  };

  const handleSetBudget = async (data: { budget: number }) => {
    if (!authUser || !editingSource) return;
    setIsSubmitting(true);
    try {
        // "Smart Upgrade" write logic
        const currentBudgets = editingSource.budgets || {};
        // If the new budget map doesn't exist but the old field does, migrate it
        if (!editingSource.budgets && editingSource.budget) {
            currentBudgets[2025] = editingSource.budget; // Assume old budget was for 2025
        }
        const updatedBudgets = { ...currentBudgets, [selectedYear]: data.budget };
        
        // Save the new budgets map and nullify the old field to complete migration
        await updateIncomeSource(editingSource.id, { budgets: updatedBudgets, budget: null }, authUser.uid, authUser.email);

        toast({ title: "Success", description: `Budget for ${selectedYear} set successfully.` });
        setIsBudgetDialogOpen(false);
        setEditingSource(null);
    } catch (error: any) {
        toast({ variant: "destructive", title: "Error", description: error.message || "Failed to set budget." });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleDeleteRecord = async (sourceId: string) => {
    if (!authUser?.uid || !authUser.email) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in to delete." });
      return;
    }
    try {
      await deleteIncomeSource(sourceId, authUser.uid, authUser.email);
      toast({ title: "Deleted", description: `Income source deleted successfully.` });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Error", description: "Failed to delete income source." });
    }
  };
  
  const formatCurrency = (value: number) => {
    return `${value.toLocaleString('fr-CM', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} XAF`;
  };

  const isLoading = authLoading || loadingSources || loadingAccounts || loadingMembers || loadingRecords;
  const dataError = errorSources || errorAccounts || errorMembers || errorRecords;
  const pastYearOptions = Array.from({length: 5}, (_, i) => new Date().getFullYear() - i);


  return (
    <div className="space-y-6 md:space-y-8">
      <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center">
        <DollarSign className="mr-3 h-8 w-8 text-primary" />
        Record Income
      </h1>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Add New Income Record</CardTitle>
          <CardDescription>Create a budgeted income source (e.g., Offerings) or record a direct transaction (e.g., Tithe) for the year {selectedYear}.</CardDescription>
        </CardHeader>
        <CardContent>
          {!authUser && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Authentication Required</AlertTitle>
              <AlertDescription>Please log in to add or view income records.</AlertDescription>
            </Alert>
          )}
          {authUser && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <FormField control={form.control} name="category" render={({ field }) => (
                        <FormItem><FormLabel>Category</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Select income category" /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="Offering">Offering</SelectItem>
                                    <SelectItem value="Tithe">Tithe</SelectItem>
                                    <SelectItem value="Donation">Donation</SelectItem>
                                    <SelectItem value="Other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        <FormMessage /></FormItem>
                    )}/>
                    <FormField control={form.control} name="code" render={({ field }) => (
                        <FormItem><FormLabel>Code</FormLabel><FormControl><Input placeholder="e.g., 1001" {...field} disabled={isSubmitting}/></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={form.control} name="transactionName" render={({ field }) => (
                        <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="e.g., Sunday Offering" {...field} disabled={isSubmitting}/></FormControl><FormMessage /></FormItem>
                    )}/>
                </div>
                
                 <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <FormField control={form.control} name="accountId" render={({ field }) => (
                        <FormItem><FormLabel>Account</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting || loadingAccounts}>
                            <FormControl><SelectTrigger><SelectValue placeholder={loadingAccounts ? "Loading accounts..." : "Select an income account"} /></SelectTrigger></FormControl>
                            <SelectContent>{incomeAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.code} - {acc.name}</SelectItem>)}</SelectContent>
                            </Select>
                        <FormMessage /></FormItem>
                    )}/>
                    <FormField control={form.control} name="amount" render={({ field }) => (
                        <FormItem><FormLabel>{selectedCategory === 'Tithe' ? 'Amount (XAF)' : `Initial Budget for ${selectedYear} (XAF)`}</FormLabel>
                            <FormControl><Input type="number" placeholder="0" {...field} step="0.01" disabled={isSubmitting}/></FormControl>
                        <FormMessage /></FormItem>
                    )}/>
                    {selectedCategory === "Tithe" && (
                        <FormField control={form.control} name="memberName" render={({ field }) => (
                            <FormItem><FormLabel>Member Name</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting || loadingMembers}>
                                    <FormControl><SelectTrigger><SelectValue placeholder={loadingMembers ? "Loading members..." : "Select a member"} /></SelectTrigger></FormControl>
                                    <SelectContent>{members?.map(m => <SelectItem key={m.id} value={m.fullName}>{m.fullName}</SelectItem>)}</SelectContent>
                                </Select>
                            <FormMessage /></FormItem>
                        )}/>
                    )}
                </div>
                
                <div className="grid grid-cols-1">
                    <FormField control={form.control} name="description" render={({ field }) => (
                        <FormItem><FormLabel>Description (Optional)</FormLabel>
                            <FormControl><Textarea placeholder="E.g., Special offering for youth ministry" {...field} disabled={isSubmitting}/></FormControl>
                        <FormMessage /></FormItem>
                    )}/>
                </div>

                <Button type="submit" className="w-full md:w-auto" disabled={isSubmitting || !authUser || !selectedCategory}>
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                   {selectedCategory === 'Tithe' ? 'Save Tithe' : 'Create Income Source'}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
      
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Budgeted Income Sources</CardTitle>
              <CardDescription>Manage recurring income sources and their yearly budgets.</CardDescription>
            </div>
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
        </CardHeader>
        <CardContent>
           {isLoading && <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading records...</p></div>}
          {dataError && (
             <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Error Loading Records</AlertTitle><AlertDescription>{dataError.message}</AlertDescription></Alert>
          )}
          {!isLoading && !dataError && authUser && (!incomeSources || incomeSources.length === 0) && (
            <p className="text-center text-muted-foreground py-10">No income records yet. Add one above!</p>
          )}
          {!isLoading && !dataError && authUser && (incomeSources?.length > 0) && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Budget ({selectedYear})</TableHead>
                    <TableHead>Realized ({selectedYear})</TableHead>
                    <TableHead>% Realized</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incomeSources?.filter(s => s.category !== 'Tithe').map((source) => {
                      const account = incomeAccounts?.find(a => a.id === source.accountId);
                      // "Smart Upgrade" read logic
                      const budget = source.budgets?.[selectedYear] ?? (selectedYear === 2025 ? source.budget : 0) ?? 0;
                      const realized = realizedAmounts[source.id] || 0;
                      const percentage = budget > 0 ? (realized / budget) * 100 : 0;
                      return (
                          <TableRow key={source.id}>
                              <TableCell>{source.code}</TableCell>
                              <TableCell><Link href={`/income/${source.id}`} className="hover:underline text-primary font-medium">{source.transactionName}</Link></TableCell>
                              <TableCell>{account ? `${account.code} - ${account.name}` : 'N/A'}</TableCell>
                              <TableCell>{source.category}</TableCell>
                              <TableCell>{formatCurrency(budget)}</TableCell>
                              <TableCell>{formatCurrency(realized)}</TableCell>
                              <TableCell>{percentage.toFixed(1)}%</TableCell>
                              <TableCell className="text-right space-x-1">
                                <Button variant="ghost" size="icon" onClick={() => handleOpenBudgetDialog(source)} aria-label="Set Budget"><Coins className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => handleOpenEditDialog(source)} disabled={!authUser || isSubmitting} aria-label="Edit income source"><Edit className="h-4 w-4" /></Button>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild><Button variant="ghost" size="icon" aria-label="Delete income source"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This action will permanently delete "{source.transactionName}" and all its recorded transactions. This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteRecord(source.id)}>Delete</AlertDialogAction></AlertDialogFooter>
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
        </CardContent>
      </Card>
      
      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
            <DialogHeader><DialogTitle>Edit Income Source</DialogTitle><DialogDescription>Update the details for "{editingSource?.transactionName}". Budget is set separately.</DialogDescription></DialogHeader>
            <EditIncomeSourceForm source={editingSource} onSave={handleSaveEditedSource} onFinished={() => setIsEditDialogOpen(false)} />
        </DialogContent>
      </Dialog>
      
      {/* Set Budget Dialog */}
      <Dialog open={isBudgetDialogOpen} onOpenChange={setIsBudgetDialogOpen}>
          <DialogContent>
              <DialogHeader><DialogTitle>Set Budget for {selectedYear}</DialogTitle><DialogDescription>Enter the total budget for "{editingSource?.transactionName}" for the year {selectedYear}.</DialogDescription></DialogHeader>
              <Form {...budgetForm}>
                  <form onSubmit={budgetForm.handleSubmit(handleSetBudget)} className="space-y-4 py-4">
                      <FormField control={budgetForm.control} name="budget" render={({ field }) => (
                          <FormItem><FormLabel>Budget Amount (XAF)</FormLabel><FormControl><Input type="number" placeholder="0" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                       <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={isSubmitting}>Cancel</Button></DialogClose><Button type="submit" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Set Budget</Button></DialogFooter>
                  </form>
              </Form>
          </DialogContent>
      </Dialog>
    </div>
  );
}


// Sub-component for the edit form
interface EditIncomeSourceFormProps {
  source: IncomeSource | null;
  onSave: (updatedData: Partial<IncomeSourceFormValues>, sourceId: string) => Promise<void>;
  onFinished: () => void;
}

const EditIncomeSourceForm: React.FC<EditIncomeSourceFormProps> = ({ source, onSave, onFinished }) => {
    const [isSaving, setIsSaving] = useState(false);
    const accountsQuery = useMemo(() => query(collection(db, 'accounts'), where('type', '==', 'Income'), orderBy('name')).withConverter(accountConverter), []);
    const [incomeAccounts] = useCollectionData(accountsQuery);

    const editForm = useForm<IncomeSourceFormValues>({
        resolver: zodResolver(incomeSourceSchema),
    });

    React.useEffect(() => {
        if (source) {
            editForm.reset({
                code: source.code,
                transactionName: source.transactionName,
                category: source.category,
                amount: 0, // This is for validation, not display.
                accountId: source.accountId || "",
                description: source.description || "",
                memberName: "", // Not applicable for sources
            });
        }
    }, [source, editForm]);

    const handleEditSubmit = async (data: IncomeSourceFormValues) => {
        if (!source) return;
        setIsSaving(true);
        try {
            await onSave(data, source.id);
            onFinished();
        } catch (error) {
            // Error toast is handled by caller
        } finally {
            setIsSaving(false);
        }
    };

    if (!source) return null;

    return (
        <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                <FormField control={editForm.control} name="code" render={({ field }) => (
                    <FormItem><FormLabel>Code</FormLabel><FormControl><Input {...field} disabled={isSaving}/></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={editForm.control} name="transactionName" render={({ field }) => (
                    <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} disabled={isSaving}/></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={editForm.control} name="category" render={({ field }) => (
                    <FormItem><FormLabel>Category</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled>
                            <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                            <SelectContent><SelectItem value={source.category}>{source.category}</SelectItem></SelectContent>
                        </Select>
                    <FormMessage /></FormItem>
                )}/>
                <FormField control={editForm.control} name="accountId" render={({ field }) => (
                    <FormItem><FormLabel>Account</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={isSaving}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select an income account" /></SelectTrigger></FormControl>
                            <SelectContent>{incomeAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.code} - {acc.name}</SelectItem>)}</SelectContent>
                        </Select>
                    <FormMessage /></FormItem>
                )}/>
                <FormField control={editForm.control} name="description" render={({ field }) => (
                    <FormItem><FormLabel>Description (Optional)</FormLabel><FormControl><Textarea {...field} disabled={isSaving} /></FormControl><FormMessage /></FormItem>
                )}/>
                <DialogFooter className="pt-4">
                    <DialogClose asChild><Button type="button" variant="outline" disabled={isSaving}>Cancel</Button></DialogClose>
                    <Button type="submit" disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Changes
                    </Button>
                </DialogFooter>
            </form>
        </Form>
    );
};
