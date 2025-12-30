
"use client";

import React, { useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarIcon, PlusCircle, Trash2, Loader2, AlertTriangle, DollarSign, Edit } from "lucide-react";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import type { IncomeRecord, IncomeCategory, IncomeRecordFirestore, Account, AccountFirestore, IncomeFormValues as EditIncomeFormValues, Member, MemberFirestore } from '@/types';
import { incomeSchema } from '@/types';
import { addIncomeRecord, deleteIncomeRecord, updateIncomeRecord } from '@/services/incomeService';
import { useToast } from "@/hooks/use-toast";
import { auth, db } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { collection, query, orderBy, Timestamp, where, type QueryDocumentSnapshot, type SnapshotOptions } from 'firebase/firestore';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { User } from 'firebase/auth';

type IncomeFormValues = z.infer<typeof incomeSchema>;

const incomeConverter = {
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions): IncomeRecord => {
    const data = snapshot.data(options) as Omit<IncomeRecordFirestore, 'id'>;
    return {
      id: snapshot.id,
      code: data.code,
      transactionName: data.transactionName,
      date: (data.date as Timestamp).toDate(),
      category: data.category,
      amount: data.amount,
      description: data.description,
      memberName: data.memberName,
      recordedByUserId: data.recordedByUserId,
      createdAt: (data.createdAt as Timestamp)?.toDate(),
      accountId: data.accountId,
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


interface EditIncomeDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  record: IncomeRecord | null;
  onSave: (updatedData: EditIncomeFormValues, recordId: string) => Promise<void>;
  currentUser: User | null;
  incomeAccounts: Account[] | undefined;
  members: Member[] | undefined;
}

const EditIncomeDialog: React.FC<EditIncomeDialogProps> = ({ isOpen, onOpenChange, record, onSave, currentUser, incomeAccounts, members }) => {
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  
  const editForm = useForm<EditIncomeFormValues>({
    resolver: zodResolver(incomeSchema),
  });

  const selectedCategory = editForm.watch("category");

  React.useEffect(() => {
    if (record && isOpen) {
      editForm.reset({
        code: record.code,
        transactionName: record.transactionName,
        date: record.date,
        category: record.category,
        amount: record.amount,
        description: record.description || "",
        memberName: record.memberName || "",
        accountId: record.accountId || "",
      });
    }
  }, [record, isOpen, editForm]);

  const handleEditSubmit = async (data: EditIncomeFormValues) => {
    if (!record || !currentUser?.uid) {
      toast({ variant: "destructive", title: "Error", description: "Cannot save. Record or user information is missing." });
      return;
    }
    setIsSaving(true);
    try {
      await onSave(data, record.id);
      onOpenChange(false);
    } catch (error) {
      // Error toast is handled by onSave caller
    } finally {
      setIsSaving(false);
    }
  };

  if (!record) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Income Record</DialogTitle>
          <DialogDescription>
            Update the details for this income record. Click save when you're done.
          </DialogDescription>
        </DialogHeader>
        <Form {...editForm}>
          <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
            <FormField
                control={editForm.control}
                name="code"
                render={({ field }) => (
                <FormItem>
                    <FormLabel>Transaction Code</FormLabel>
                    <FormControl>
                    <Input placeholder="e.g., 10011" {...field} disabled={isSaving}/>
                    </FormControl>
                    <FormMessage />
                </FormItem>
                )}
            />
            <FormField
                control={editForm.control}
                name="transactionName"
                render={({ field }) => (
                <FormItem>
                    <FormLabel>Transaction Name</FormLabel>
                    <FormControl>
                    <Input placeholder="e.g., Sunday Offering" {...field} disabled={isSaving}/>
                    </FormControl>
                    <FormMessage />
                </FormItem>
                )}
            />
            <FormField
              control={editForm.control}
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={`w-full pl-3 text-left font-normal ${!field.value && "text-muted-foreground"}`}
                          disabled={isSaving}
                        >
                          {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={editForm.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={isSaving}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select income category" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Offering">Offering</SelectItem>
                      <SelectItem value="Tithe">Tithe</SelectItem>
                      <SelectItem value="Donation">Donation</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={editForm.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount (XAF)</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} disabled={isSaving} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={editForm.control}
              name="accountId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={isSaving}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select an income account" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {incomeAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.code} - {acc.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {selectedCategory === "Tithe" && (
              <FormField
                control={editForm.control}
                name="memberName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Member Name</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isSaving}>
                        <FormControl>
                            <SelectTrigger>
                            <SelectValue placeholder="Select a member" />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {members?.map(m => <SelectItem key={m.id} value={m.fullName}>{m.fullName}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={editForm.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="E.g., Special offering for youth ministry" {...field} disabled={isSaving} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
              <DialogClose asChild><Button type="button" variant="outline" disabled={isSaving}>Cancel</Button></DialogClose>
              <Button type="submit" disabled={isSaving || !currentUser}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Changes
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
  const [editingRecord, setEditingRecord] = useState<IncomeRecord | null>(null);

  const form = useForm<IncomeFormValues>({
    resolver: zodResolver(incomeSchema),
    defaultValues: {
      code: "",
      transactionName: "",
      date: new Date(),
      category: undefined,
      amount: 0,
      description: "",
      memberName: "",
      accountId: "",
    },
  });

  const selectedCategory = form.watch("category");

  const incomeQuery = useMemo(() => authUser ? query(collection(db, 'income_records'), orderBy('date', 'desc')).withConverter<IncomeRecord>(incomeConverter) : null, [authUser]);
  const [incomeRecords, loadingIncome, errorIncome] = useCollectionData(incomeQuery);
  
  const accountsQuery = useMemo(() => authUser ? query(collection(db, 'accounts'), where('type', '==', 'Income'), orderBy('name')).withConverter(accountConverter) : null, [authUser]);
  const [incomeAccounts, loadingAccounts, errorAccounts] = useCollectionData(accountsQuery);
  
  const membersQuery = useMemo(() => authUser ? query(collection(db, 'members'), orderBy('fullName')).withConverter(memberConverter) : null, [authUser]);
  const [members, loadingMembers, errorMembers] = useCollectionData(membersQuery);

  const onSubmit = async (data: IncomeFormValues) => {
    if (!authUser?.uid || !authUser.email) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in to add income." });
      return;
    }
    try {
      await addIncomeRecord(
        { ...data, category: data.category as IncomeCategory },
        authUser.uid,
        authUser.email
      );
      form.reset({ code: "", transactionName: "", date: new Date(), category: undefined, amount: 0, description: "", memberName: "", accountId: "" });
      toast({ title: "Success", description: "Income record saved successfully." });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Error", description: "Failed to save income record." });
    }
  };
  
  const handleOpenEditDialog = (record: IncomeRecord) => {
    setEditingRecord(record);
    setIsEditDialogOpen(true);
  };
  
  const handleSaveEditedIncome = async (updatedData: EditIncomeFormValues, recordId: string) => {
    if (!authUser?.uid || !authUser.email) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in to update an income record." });
      throw new Error("User not authenticated");
    }
    try {
      await updateIncomeRecord(recordId, updatedData, authUser.uid, authUser.email);
      toast({ title: "Income Record Updated", description: `Record dated ${format(updatedData.date, "PP")} has been updated.`});
      setEditingRecord(null);
    } catch (err) {
        console.error(err);
        toast({ variant: "destructive", title: "Error", description: "Failed to update income record." });
        throw err;
    }
  };

  const handleDeleteRecord = async (record: IncomeRecord) => {
    if (!authUser?.uid || !authUser.email) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in to delete records." });
      return;
    }
    try {
      await deleteIncomeRecord(record.id, authUser.uid, authUser.email);
      toast({ title: "Deleted", description: `Income record from ${format(record.date, "PP")} deleted successfully.` });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Error", description: "Failed to delete income record." });
    }
  };
  
  const formatCurrency = (value: number) => {
    return `${value.toLocaleString('fr-CM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} XAF`;
  };

  const isLoading = authLoading || loadingIncome || loadingAccounts || loadingMembers;
  const dataError = errorIncome || errorAccounts || errorMembers;

  if (isLoading && !incomeRecords && !incomeAccounts) { 
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center">
        <DollarSign className="mr-3 h-8 w-8 text-primary" />
        Record Income
      </h1>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Add New Income</CardTitle>
          <CardDescription>Enter the details of the income received. For tithes, select the member from the list.</CardDescription>
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
                <div className="grid md:grid-cols-3 gap-6">
                  <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Transaction Code</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 10011" {...field} disabled={form.formState.isSubmitting}/>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="transactionName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Transaction Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Sunday Offering" {...field} disabled={form.formState.isSubmitting}/>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={`w-full pl-3 text-left font-normal ${!field.value && "text-muted-foreground"}`}
                                disabled={form.formState.isSubmitting}
                              >
                                {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                 <div className="grid md:grid-cols-3 gap-6">
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value} disabled={form.formState.isSubmitting}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select income category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Offering">Offering</SelectItem>
                              <SelectItem value="Tithe">Tithe</SelectItem>
                              <SelectItem value="Donation">Donation</SelectItem>
                              <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount (XAF)</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="0.00" {...field} step="0.01" disabled={form.formState.isSubmitting}/>
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
                            <Select onValueChange={field.onChange} value={field.value} disabled={form.formState.isSubmitting || loadingAccounts}>
                            <FormControl>
                                <SelectTrigger>
                                <SelectValue placeholder={loadingAccounts ? "Loading accounts..." : "Select an income account"} />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {incomeAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.code} - {acc.name}</SelectItem>)}
                            </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                </div>
                
                <div className="grid md:grid-cols-3 gap-6">
                    {selectedCategory === "Tithe" && (
                      <FormField
                        control={form.control}
                        name="memberName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Member Name</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={form.formState.isSubmitting || loadingMembers}>
                                <FormControl>
                                    <SelectTrigger>
                                    <SelectValue placeholder={loadingMembers ? "Loading members..." : "Select a member"} />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {members?.map(m => <SelectItem key={m.id} value={m.fullName}>{m.fullName}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                     <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem className={selectedCategory === "Tithe" ? 'md:col-span-2' : 'md:col-span-3'}>
                          <FormLabel>Description (Optional)</FormLabel>
                          <FormControl>
                            <Textarea placeholder="E.g., Special offering for youth ministry" {...field} disabled={form.formState.isSubmitting}/>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                </div>

                <Button type="submit" className="w-full md:w-auto" disabled={form.formState.isSubmitting || !authUser}>
                  {form.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                   Save Income
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Recent Income Records</CardTitle>
        </CardHeader>
        <CardContent>
           {loadingIncome && <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading records...</p></div>}
          {dataError && (
             <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error Loading Records</AlertTitle>
              <AlertDescription>{dataError.message}</AlertDescription>
            </Alert>
          )}
          {!loadingIncome && !dataError && authUser && (!incomeRecords || incomeRecords.length === 0) && (
            <p className="text-center text-muted-foreground py-10">No income records yet. Add one above!</p>
          )}
          {!dataError && authUser && incomeRecords && incomeRecords.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Transaction Name</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Member</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incomeRecords.map((record) => {
                      const account = incomeAccounts?.find(a => a.id === record.accountId);
                      return (
                          <TableRow key={record.id}>
                              <TableCell>{record.code}</TableCell>
                              <TableCell>{record.transactionName}</TableCell>
                              <TableCell>{format(record.date, "PP")}</TableCell>
                              <TableCell>{account ? `${account.code} - ${account.name}` : 'N/A'}</TableCell>
                              <TableCell>{record.category}</TableCell>
                              <TableCell>{formatCurrency(record.amount)}</TableCell>
                              <TableCell>{record.memberName || 'N/A'}</TableCell>
                              <TableCell className="max-w-[200px] truncate" title={record.description}>{record.description || 'N/A'}</TableCell>                              
                              <TableCell className="text-right space-x-1">
                                <Button variant="ghost" size="icon" onClick={() => handleOpenEditDialog(record)} disabled={!authUser || form.formState.isSubmitting} aria-label="Edit income">
                                    <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteRecord(record)} disabled={!authUser || form.formState.isSubmitting} aria-label="Delete income">
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
        </CardContent>
      </Card>
      
      <EditIncomeDialog
        isOpen={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        record={editingRecord}
        onSave={handleSaveEditedIncome}
        currentUser={authUser}
        incomeAccounts={incomeAccounts}
        members={members}
      />
    </div>
  );
}

    