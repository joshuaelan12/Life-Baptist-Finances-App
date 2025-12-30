
"use client";

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlusCircle, Trash2, Loader2, AlertTriangle, DollarSign, Edit } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import type { IncomeSource, IncomeSourceFormValues, IncomeCategory, IncomeSourceFirestore, Account, AccountFirestore, Member, MemberFirestore, IncomeRecord } from '@/types';
import { incomeSourceSchema } from '@/types';
import { addIncomeSource, deleteIncomeSource, updateIncomeSource, addTitheTransaction } from '@/services/incomeService';
import { useToast } from "@/hooks/use-toast";
import { auth, db } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { collection, query, orderBy, Timestamp, where, type QueryDocumentSnapshot, type SnapshotOptions } from 'firebase/firestore';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { User } from 'firebase/auth';

const incomeSourceConverter = {
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions): IncomeSource => {
    const data = snapshot.data(options) as Omit<IncomeSourceFirestore, 'id'>;
    return {
      id: snapshot.id,
      code: data.code,
      transactionName: data.transactionName,
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

// Simplified schema for the tithe form part
const titheOnlySchema = incomeSourceSchema.pick({
    code: true,
    transactionName: true,
    amount: true,
    accountId: true,
    memberName: true,
    description: true,
});

interface EditIncomeSourceDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  source: IncomeSource | null;
  onSave: (updatedData: Partial<IncomeSourceFormValues>, sourceId: string) => Promise<void>;
  currentUser: User | null;
  incomeAccounts: Account[] | undefined;
}

const EditIncomeSourceDialog: React.FC<EditIncomeSourceDialogProps> = ({ isOpen, onOpenChange, source, onSave, currentUser, incomeAccounts }) => {
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  
  const editForm = useForm<IncomeSourceFormValues>({
    resolver: zodResolver(incomeSourceSchema),
  });

  React.useEffect(() => {
    if (source && isOpen) {
      editForm.reset({
        code: source.code,
        transactionName: source.transactionName,
        category: source.category,
        amount: source.budget || 0, // In this context, amount represents the budget
        accountId: source.accountId || "",
        description: source.description || "",
      });
    }
  }, [source, isOpen, editForm]);

  const handleEditSubmit = async (data: IncomeSourceFormValues) => {
    if (!source || !currentUser?.uid) {
      toast({ variant: "destructive", title: "Error", description: "Cannot save. Record or user information is missing." });
      return;
    }
    setIsSaving(true);
    try {
      const { memberName, ...updateData } = data; // Exclude memberName as it's not on IncomeSource
      await onSave(updateData, source.id);
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
          <DialogTitle>Edit Income Source</DialogTitle>
          <DialogDescription>
            Update the details for this income source.
          </DialogDescription>
        </DialogHeader>
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
            <FormField control={editForm.control} name="amount" render={({ field }) => (
                <FormItem><FormLabel>Budget (XAF)</FormLabel><FormControl><Input type="number" {...field} disabled={isSaving} /></FormControl><FormMessage /></FormItem>
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


export default function IncomePage() {
  const { toast } = useToast();
  const [authUser, authLoading] = useAuthState(auth);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<IncomeSource | null>(null);

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

  const selectedCategory = form.watch("category");

  const incomeSourcesQuery = useMemo(() => authUser ? query(collection(db, 'income_sources'), orderBy('transactionName')).withConverter(incomeSourceConverter) : null, [authUser]);
  const [incomeSources, loadingSources, errorSources] = useCollectionData(incomeSourcesQuery);
  
  const titheRecordsQuery = useMemo(() => authUser ? query(collection(db, 'income_records'), where('category', '==', 'Tithe'), orderBy('date', 'desc')) : null, [authUser]);
  const [titheRecords, loadingTithes, errorTithes] = useCollectionData(titheRecordsQuery);

  const accountsQuery = useMemo(() => authUser ? query(collection(db, 'accounts'), where('type', '==', 'Income'), orderBy('name')).withConverter(accountConverter) : null, [authUser]);
  const [incomeAccounts, loadingAccounts, errorAccounts] = useCollectionData(accountsQuery);
  
  const membersQuery = useMemo(() => authUser ? query(collection(db, 'members'), orderBy('fullName')).withConverter(memberConverter) : null, [authUser]);
  const [members, loadingMembers, errorMembers] = useCollectionData(membersQuery);

  const onSubmit = async (data: IncomeSourceFormValues) => {
    if (!authUser?.uid || !authUser.email) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in." });
      return;
    }
    try {
        if (data.category === 'Tithe') {
            await addTitheTransaction({ ...data, date: new Date() }, authUser.uid, authUser.email);
            toast({ title: "Success", description: "Tithe record saved successfully." });
        } else {
            await addIncomeSource({ ...data, category: data.category as IncomeCategory }, authUser.uid, authUser.email);
            toast({ title: "Success", description: "Income source created successfully." });
        }
        form.reset({ code: "", transactionName: "", category: undefined, amount: 0, description: "", memberName: "", accountId: "" });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Error", description: "Failed to save record." });
    }
  };
  
  const handleOpenEditDialog = (source: IncomeSource) => {
    setEditingSource(source);
    setIsEditDialogOpen(true);
  };
  
  const handleSaveEditedSource = async (updatedData: Partial<IncomeSourceFormValues>, sourceId: string) => {
    if (!authUser?.uid || !authUser.email) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in to update." });
      throw new Error("User not authenticated");
    }
    try {
      await updateIncomeSource(sourceId, updatedData, authUser.uid, authUser.email);
      toast({ title: "Income Source Updated", description: `${updatedData.transactionName} has been updated.`});
      setEditingSource(null);
    } catch (err) {
        console.error(err);
        toast({ variant: "destructive", title: "Error", description: "Failed to update income source." });
        throw err;
    }
  };

  const handleDeleteRecord = async (source: IncomeSource) => {
    if (!authUser?.uid || !authUser.email) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in to delete." });
      return;
    }
    try {
      await deleteIncomeSource(source.id, authUser.uid, authUser.email);
      toast({ title: "Deleted", description: `Income source deleted successfully.` });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Error", description: "Failed to delete income source." });
    }
  };
  
  const formatCurrency = (value: number) => {
    return `${value.toLocaleString('fr-CM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} XAF`;
  };

  const isLoading = authLoading || loadingSources || loadingAccounts || loadingMembers || loadingTithes;
  const dataError = errorSources || errorAccounts || errorMembers || errorTithes;

  return (
    <div className="space-y-6 md:space-y-8">
      <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center">
        <DollarSign className="mr-3 h-8 w-8 text-primary" />
        Record Income
      </h1>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Add New Income Record</CardTitle>
          <CardDescription>Create a budgeted income source (e.g., Offerings) or record a direct transaction (e.g., Tithe).</CardDescription>
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
                            <Select onValueChange={field.onChange} value={field.value} disabled={form.formState.isSubmitting}>
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
                        <FormItem><FormLabel>Code</FormLabel><FormControl><Input placeholder="e.g., 10011" {...field} disabled={form.formState.isSubmitting}/></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={form.control} name="transactionName" render={({ field }) => (
                        <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="e.g., Sunday Offering" {...field} disabled={form.formState.isSubmitting}/></FormControl><FormMessage /></FormItem>
                    )}/>
                </div>
                
                 <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <FormField control={form.control} name="accountId" render={({ field }) => (
                        <FormItem><FormLabel>Account</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={form.formState.isSubmitting || loadingAccounts}>
                            <FormControl><SelectTrigger><SelectValue placeholder={loadingAccounts ? "Loading accounts..." : "Select an income account"} /></SelectTrigger></FormControl>
                            <SelectContent>{incomeAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.code} - {acc.name}</SelectItem>)}</SelectContent>
                            </Select>
                        <FormMessage /></FormItem>
                    )}/>
                    <FormField control={form.control} name="amount" render={({ field }) => (
                        <FormItem><FormLabel>{selectedCategory === 'Tithe' ? 'Amount (XAF)' : 'Annual Budget (XAF)'}</FormLabel>
                            <FormControl><Input type="number" placeholder="0.00" {...field} step="0.01" disabled={form.formState.isSubmitting}/></FormControl>
                        <FormMessage /></FormItem>
                    )}/>
                    {selectedCategory === "Tithe" && (
                        <FormField control={form.control} name="memberName" render={({ field }) => (
                            <FormItem><FormLabel>Member Name</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value} disabled={form.formState.isSubmitting || loadingMembers}>
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
                            <FormControl><Textarea placeholder="E.g., Special offering for youth ministry" {...field} disabled={form.formState.isSubmitting}/></FormControl>
                        <FormMessage /></FormItem>
                    )}/>
                </div>

                <Button type="submit" className="w-full md:w-auto" disabled={form.formState.isSubmitting || !authUser || !selectedCategory}>
                  {form.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                   {selectedCategory === 'Tithe' ? 'Save Tithe' : 'Create Income Source'}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Manage Income</CardTitle>
          <CardDescription>View and manage budgeted income sources and direct tithe records.</CardDescription>
        </CardHeader>
        <CardContent>
           {isLoading && <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading records...</p></div>}
          {dataError && (
             <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error Loading Records</AlertTitle>
              <AlertDescription>{dataError.message}</AlertDescription>
            </Alert>
          )}
          {!isLoading && !dataError && authUser && (!incomeSources || incomeSources.length === 0) && (!titheRecords || titheRecords.length === 0) && (
            <p className="text-center text-muted-foreground py-10">No income records yet. Add one above!</p>
          )}
          {!dataError && authUser && (incomeSources?.length > 0 || titheRecords?.length > 0) && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Amount / Budget</TableHead>
                    <TableHead>Member</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incomeSources?.map((source) => {
                      const account = incomeAccounts?.find(a => a.id === source.accountId);
                      const isBudgeted = source.category !== 'Tithe';
                      return (
                          <TableRow key={source.id}>
                              <TableCell>{source.code}</TableCell>
                              <TableCell>
                                {isBudgeted ? (
                                    <Link href={`/income/${source.id}`} className="hover:underline text-primary font-medium">
                                        {source.transactionName}
                                    </Link>
                                ) : (
                                    source.transactionName
                                )}
                              </TableCell>
                              <TableCell>{source.category}</TableCell>
                              <TableCell>{account ? `${account.code} - ${account.name}` : 'N/A'}</TableCell>
                              <TableCell>{formatCurrency(source.budget || 0)}</TableCell>
                              <TableCell>{'N/A'}</TableCell>
                              <TableCell className="text-right space-x-1">
                                <Button variant="ghost" size="icon" onClick={() => handleOpenEditDialog(source)} disabled={!authUser || form.formState.isSubmitting} aria-label="Edit income source">
                                    <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteRecord(source)} disabled={!authUser || form.formState.isSubmitting} aria-label="Delete income source">
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </TableCell>
                          </TableRow>
                      );
                  })}
                  {/* We can show tithes here too if needed, or keep them separate */}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      
      <EditIncomeSourceDialog
        isOpen={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        source={editingSource}
        onSave={handleSaveEditedSource}
        currentUser={authUser}
        incomeAccounts={incomeAccounts}
      />
    </div>
  );
}
