
"use client";

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlusCircle, Trash2, Loader2, AlertTriangle, DollarSign, Edit, Coins, User, CalendarIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import type { IncomeSource, IncomeSourceFormValues, IncomeCategory, IncomeSourceFirestore, Account, AccountFirestore, Member, MemberFirestore, IncomeRecord, IncomeFormValues } from '@/types';
import { incomeSourceSchema, incomeSchema } from '@/types';
import { addIncomeSource, deleteIncomeSource, updateIncomeSource } from '@/services/incomeService';
import { addIncomeTransaction } from '@/services/incomeTransactionService';
import { useToast } from "@/hooks/use-toast";
import { auth, db } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { collection, query, orderBy, Timestamp, where, type QueryDocumentSnapshot, type SnapshotOptions } from 'firebase/firestore';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';

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
  const [isQuickRecordOpen, setIsQuickRecordOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<IncomeSource | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const sourceForm = useForm<IncomeSourceFormValues>({
    resolver: zodResolver(incomeSourceSchema),
    defaultValues: {
      code: "",
      transactionName: "",
      category: undefined,
      amount: 0,
      description: "",
      accountId: "",
    },
  });

  const transactionForm = useForm<IncomeFormValues>({
    resolver: zodResolver(incomeSchema),
    defaultValues: {
        code: "",
        transactionName: "",
        date: new Date(),
        amount: 0,
        category: "Offering",
        accountId: "",
        description: "",
        memberName: "",
    }
  });

  const budgetForm = useForm<{ budget: number }>({
      resolver: zodResolver(z.object({ budget: z.coerce.number().min(0, "Budget must be zero or more.") })),
  });

  const incomeSourcesQuery = useMemo(() => authUser ? query(collection(db, 'income_sources'), orderBy('transactionName')).withConverter(incomeSourceConverter) : null, [authUser]);
  const [incomeSources, loadingSources, errorSources] = useCollectionData(incomeSourcesQuery);
  
  const incomeRecordsQuery = useMemo(() => authUser ? collection(db, 'income_records').withConverter(incomeRecordConverter) : null, [authUser]);
  const [incomeRecords, loadingRecords, errorRecords] = useCollectionData(incomeRecordsQuery);
  
  const accountsQuery = useMemo(() => authUser ? query(collection(db, 'accounts'), where('type', '==', 'Income'), orderBy('name')).withConverter(accountConverter) : null, [authUser]);
  const [incomeAccounts, loadingAccounts] = useCollectionData(accountsQuery);

  const membersQuery = useMemo(() => authUser ? query(collection(db, 'members'), orderBy('fullName')).withConverter(memberConverter) : null, [authUser]);
  const [members, loadingMembers] = useCollectionData(membersQuery);
  
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

  const onSourceSubmit = async (data: IncomeSourceFormValues) => {
    if (!authUser?.uid || !authUser.email) return;
    setIsSubmitting(true);
    try {
        const budgetForYear = { [selectedYear]: data.amount || 0 };
        await addIncomeSource({ ...data, category: data.category as IncomeCategory }, budgetForYear, authUser.uid, authUser.email);
        toast({ title: "Success", description: "Income source created successfully." });
        sourceForm.reset();
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: "Failed to save record." });
    } finally {
        setIsSubmitting(false);
    }
  };

  const onTransactionSubmit = async (data: IncomeFormValues) => {
    if (!authUser?.uid || !authUser.email) return;
    
    // Find the source ID based on accountId and category to match existing source
    // In Quick Record, we might want to select the Source directly
    const source = incomeSources?.find(s => s.accountId === data.accountId && s.category === data.category);
    if (!source) {
        toast({ variant: "destructive", title: "Config Error", description: "No budgeted income category found for this selection. Create a Source first." });
        return;
    }

    setIsSubmitting(true);
    try {
        const finalData = { ...data, memberName: data.memberName === "none" ? "" : data.memberName };
        await addIncomeTransaction(finalData, source.id, authUser.uid, authUser.email);
        toast({ title: "Success", description: "Transaction recorded successfully." });
        setIsQuickRecordOpen(false);
        transactionForm.reset();
    } catch (err) {
        toast({ variant: "destructive", title: "Error", description: "Failed to record transaction." });
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
    const budgetForSelectedYear = source.budgets?.[selectedYear] || (selectedYear === 2025 ? source.budget : 0) || 0;
    budgetForm.reset({ budget: budgetForSelectedYear });
    setIsBudgetDialogOpen(true);
  };

  const handleSaveEditedSource = async (updatedData: Partial<IncomeSourceFormValues>, sourceId: string) => {
    if (!authUser?.uid || !authUser.email) return;
    try {
      const { amount, ...coreData } = updatedData;
      await updateIncomeSource(sourceId, coreData, authUser.uid, authUser.email);
      toast({ title: "Income Source Updated", description: "Record has been updated."});
    } catch (err) {
        toast({ variant: "destructive", title: "Error", description: "Failed to update income source." });
    }
  };

  const handleSetBudget = async (data: { budget: number }) => {
    if (!authUser || !editingSource) return;
    setIsSubmitting(true);
    try {
        const currentBudgets = editingSource.budgets || {};
        if (!editingSource.budgets && editingSource.budget) {
            currentBudgets[2025] = editingSource.budget;
        }
        const updatedBudgets = { ...currentBudgets, [selectedYear]: data.budget };
        await updateIncomeSource(editingSource.id, { budgets: updatedBudgets, budget: null }, authUser.uid, authUser.email);
        toast({ title: "Success", description: `Budget set for ${selectedYear}.` });
        setIsBudgetDialogOpen(false);
        setEditingSource(null);
    } catch (error: any) {
        toast({ variant: "destructive", title: "Error", description: error.message || "Failed to set budget." });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleDeleteRecord = async (sourceId: string) => {
    if (!authUser?.uid || !authUser.email) return;
    try {
      await deleteIncomeSource(sourceId, authUser.uid, authUser.email);
      toast({ title: "Deleted", description: `Income source and history removed.` });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: "Failed to delete income source." });
    }
  };
  
  const formatCurrency = (value: number) => {
    return `${value.toLocaleString('fr-CM', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} XAF`;
  };

  const yearOptions = Array.from({length: 11}, (_, i) => new Date().getFullYear() + 5 - i);
  const isLoading = authLoading || loadingSources || loadingAccounts || loadingRecords || loadingMembers;

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center">
            <DollarSign className="mr-3 h-8 w-8 text-primary" />
            Income Management
        </h1>
        <Button onClick={() => setIsQuickRecordOpen(true)} className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700">
            <PlusCircle className="mr-2 h-4 w-4" /> Record Transaction
        </Button>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Add Budgeted Income Source</CardTitle>
          <CardDescription>Define an income category (e.g., Sunday Offerings, Tithes) and set its budget for {selectedYear}.</CardDescription>
        </CardHeader>
        <CardContent>
          {authUser && (
            <Form {...sourceForm}>
              <form onSubmit={sourceForm.handleSubmit(onSourceSubmit)} className="space-y-6">
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <FormField control={sourceForm.control} name="category" render={({ field }) => (
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
                    <FormField control={sourceForm.control} name="code" render={({ field }) => (
                        <FormItem><FormLabel>Source Code</FormLabel><FormControl><Input placeholder="e.g., 1001" {...field} disabled={isSubmitting}/></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={sourceForm.control} name="transactionName" render={({ field }) => (
                        <FormItem><FormLabel>Source Name</FormLabel><FormControl><Input placeholder="e.g., Sunday Offering" {...field} disabled={isSubmitting}/></FormControl><FormMessage /></FormItem>
                    )}/>
                </div>
                
                 <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <FormField control={sourceForm.control} name="accountId" render={({ field }) => (
                        <FormItem><FormLabel>Finance Account</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select an income account" /></SelectTrigger></FormControl>
                            <SelectContent>{incomeAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.code} - {acc.name}</SelectItem>)}</SelectContent>
                            </Select>
                        <FormMessage /></FormItem>
                    )}/>
                    <FormField control={sourceForm.control} name="amount" render={({ field }) => (
                        <FormItem><FormLabel>Initial Budget for {selectedYear} (XAF)</FormLabel>
                            <FormControl><Input type="number" placeholder="0" {...field} step="0.01" disabled={isSubmitting}/></FormControl>
                        <FormMessage /></FormItem>
                    )}/>
                </div>
                <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting || !authUser}>
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                   Create Income Source
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
      
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle>Budgeted Income Sources</CardTitle>
              <CardDescription>Click a source to record transactions. All categories including Tithes are managed here.</CardDescription>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-center">
                 <Label htmlFor="year-select">Year:</Label>
                 <Select value={String(selectedYear)} onValueChange={(val) => setSelectedYear(Number(val))}>
                    <SelectTrigger className="w-[120px]" id="year-select"><SelectValue /></SelectTrigger>
                    <SelectContent>{yearOptions.map(year => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}</SelectContent>
                 </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
           {isLoading && <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading records...</p></div>}
          {!isLoading && incomeSources && incomeSources.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Source Name</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Budget ({selectedYear})</TableHead>
                    <TableHead>Realized ({selectedYear})</TableHead>
                    <TableHead>% Realized</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incomeSources?.map((source) => {
                      const account = incomeAccounts?.find(a => a.id === source.accountId);
                      const budget = source.budgets?.[selectedYear] ?? (selectedYear === 2025 ? source.budget : 0) ?? 0;
                      const realized = realizedAmounts[source.id] || 0;
                      const percentage = budget > 0 ? (realized / budget) * 100 : 0;
                      return (
                          <TableRow key={source.id}>
                              <TableCell>{source.code}</TableCell>
                              <TableCell><Link href={`/income/${source.id}?year=${selectedYear}`} className="hover:underline text-primary font-medium">{source.transactionName}</Link></TableCell>
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
                                        <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This action will permanently delete "{source.transactionName}" and all its recorded transactions.</AlertDialogDescription></AlertDialogHeader>
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
      
      {/* Quick Record Transaction Dialog */}
      <Dialog open={isQuickRecordOpen} onOpenChange={setIsQuickRecordOpen}>
        <DialogContent className="max-w-2xl">
            <DialogHeader>
                <DialogTitle>Quick Record Income</DialogTitle>
                <DialogDescription>Record a new income transaction and optionally attribute it to a member.</DialogDescription>
            </DialogHeader>
            <Form {...transactionForm}>
                <form onSubmit={transactionForm.handleSubmit(onTransactionSubmit)} className="space-y-4 py-4 max-h-[80vh] overflow-y-auto pr-2">
                    <div className="grid md:grid-cols-2 gap-4">
                        <FormField control={transactionForm.control} name="category" render={({ field }) => (
                            <FormItem><FormLabel>Category</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="Offering">Offering</SelectItem>
                                        <SelectItem value="Tithe">Tithe</SelectItem>
                                        <SelectItem value="Donation">Donation</SelectItem>
                                        <SelectItem value="Other">Other</SelectItem>
                                    </SelectContent>
                                </Select>
                            <FormMessage /></FormItem>
                        )}/>
                        <FormField control={transactionForm.control} name="accountId" render={({ field }) => (
                            <FormItem><FormLabel>Budget Fund</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Select fund"/></SelectTrigger></FormControl>
                                    <SelectContent>
                                        {incomeSources?.filter(s => s.category === transactionForm.getValues('category')).map(s => (
                                            <SelectItem key={s.id} value={s.accountId || ""}>{s.transactionName}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormDescription>Links this payment to a budget source.</FormDescription>
                            <FormMessage /></FormItem>
                        )}/>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                        <FormField control={transactionForm.control} name="date" render={({ field }) => (
                            <FormItem className="flex flex-col"><FormLabel>Date</FormLabel>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <FormControl><Button variant={"outline"} className={`w-full pl-3 text-left font-normal ${!field.value && "text-muted-foreground"}`} >{field.value ? format(field.value, "PPP") : <span>Pick a date</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent>
                                </Popover>
                            <FormMessage /></FormItem>
                        )}/>
                        <FormField control={transactionForm.control} name="memberName" render={({ field }) => (
                            <FormItem><FormLabel>Member (Attribution)</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value || "none"}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="none">None / General</SelectItem>
                                        {members?.map(m => <SelectItem key={m.id} value={m.fullName}>{m.fullName}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            <FormMessage /></FormItem>
                        )}/>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                        <FormField control={transactionForm.control} name="code" render={({ field }) => (
                            <FormItem><FormLabel>Receipt Code</FormLabel><FormControl><Input placeholder="e.g. REC-001" {...field} /></FormControl><FormMessage /></FormItem>
                        )}/>
                        <FormField control={transactionForm.control} name="transactionName" render={({ field }) => (
                            <FormItem><FormLabel>Name/Purpose</FormLabel><FormControl><Input placeholder="e.g. Sunday Tithe" {...field} /></FormControl><FormMessage /></FormItem>
                        )}/>
                    </div>

                    <FormField control={transactionForm.control} name="amount" render={({ field }) => (
                        <FormItem><FormLabel>Amount (XAF)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    
                    <FormField control={transactionForm.control} name="description" render={({ field }) => (
                        <FormItem><FormLabel>Description (Optional)</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>

                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null} Record Income
                        </Button>
                    </DialogFooter>
                </form>
            </Form>
        </DialogContent>
      </Dialog>
      
      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
            <DialogHeader><DialogTitle>Edit Income Source</DialogTitle><DialogDescription>Update the details for "{editingSource?.transactionName}".</DialogDescription></DialogHeader>
            <EditIncomeSourceForm source={editingSource} onSave={handleSaveEditedSource} onFinished={() => setIsEditDialogOpen(false)} />
        </DialogContent>
      </Dialog>
      
      {/* Set Budget Dialog */}
      <Dialog open={isBudgetDialogOpen} onOpenChange={setIsBudgetDialogOpen}>
          <DialogContent>
              <DialogHeader><DialogTitle>Set Budget for {selectedYear}</DialogTitle><DialogDescription>Enter the total budget for "{editingSource?.transactionName}" for the year {selectedYear}.</DialogDescription></DialogHeader>
              <Form budgetForm>
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
    const [authUser] = useAuthState(auth);
    const accountsQuery = useMemo(() => authUser ? query(collection(db, 'accounts'), where('type', '==', 'Income'), orderBy('name')).withConverter(accountConverter) : null, [authUser]);
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
                amount: 0,
                accountId: source.accountId || "",
                description: source.description || "",
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
