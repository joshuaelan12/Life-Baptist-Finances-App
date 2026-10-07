'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useDocumentData, useCollectionData } from 'react-firebase-hooks/firestore';
import { doc, collection, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Member, IncomeRecord, MemberFirestore, IncomeRecordFirestore, IncomeFormValues, IncomeSource, IncomeSourceFirestore } from '@/types';
import { Loader2, AlertTriangle, ArrowLeft, DollarSign, HandCoins, Edit, Trash2, CalendarIcon, PlusCircle, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { incomeSchema } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { updateIncomeTransaction, deleteIncomeTransaction, addIncomeTransaction } from '@/services/incomeTransactionService';

const memberConverter = {
    fromFirestore: (snapshot: any): Member => {
        const data = snapshot.data() as Omit<MemberFirestore, 'id'>;
        return {
            id: snapshot.id,
            ...data,
            createdAt: (data.createdAt as Timestamp)?.toDate(),
        } as Member;
    },
    toFirestore: (member: Member) => member,
};

const incomeConverter = {
    fromFirestore: (snapshot: any): IncomeRecord => {
      const data = snapshot.data() as Omit<IncomeRecordFirestore, 'id'>;
      return {
        id: snapshot.id,
        ...data,
        date: (data.date as Timestamp).toDate(),
      };
    }
  };

const incomeSourceConverter = {
    fromFirestore: (snapshot: any): IncomeSource => {
        const data = snapshot.data();
        return {
            id: snapshot.id,
            ...data,
            createdAt: (data.createdAt as Timestamp)?.toDate(),
        } as IncomeSource;
    },
    toFirestore: (source: IncomeSource) => source,
};

export default function MemberTitheDetailsPage() {
    const router = useRouter();
    const params = useParams();
    const { toast } = useToast();
    const memberId = params.memberId as string;
    
    const [authUser, authLoading, authError] = useAuthState(auth);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState<IncomeRecord | null>(null);

    const memberRef = useMemo(() => memberId ? doc(db, 'members', memberId).withConverter(memberConverter) : null, [memberId]);
    const [member, loadingMember, errorMember] = useDocumentData(memberRef);

    const sourcesQuery = useMemo(() => authUser ? query(collection(db, 'income_sources'), where('category', '==', 'Tithe')) : null, [authUser]);
    const [titheSources, loadingSources] = useCollectionData(sourcesQuery?.withConverter(incomeSourceConverter));

    const titheQuery = useMemo(() => 
        member ? query(
            collection(db, 'income_records'), 
            where('category', '==', 'Tithe'),
            where('memberName', '==', member.fullName),
            orderBy('date', 'desc')
        ).withConverter(incomeConverter) : null, 
    [member]);
    
    const [titheRecords, loadingTithes, errorTithes] = useCollectionData(titheQuery);

    const form = useForm<IncomeFormValues>({
        resolver: zodResolver(incomeSchema),
        defaultValues: {
            code: "",
            transactionName: "",
            date: new Date(),
            amount: 0,
            description: "",
            category: "Tithe",
            accountId: "",
            memberName: "",
        },
    });

    useEffect(() => {
        if (member) {
            form.setValue('memberName', member.fullName);
            form.setValue('transactionName', `Tithe - ${member.fullName}`);
        }
        if (titheSources && titheSources.length > 0) {
            const firstSource = titheSources[0];
            form.setValue('accountId', firstSource.accountId || '');
        }
    }, [member, titheSources, form]);

    const totalTithes = useMemo(() => {
        return titheRecords?.reduce((sum, record) => sum + record.amount, 0) || 0;
    }, [titheRecords]);

    const handleUpdate = async (data: IncomeFormValues) => {
        if (!authUser || !editingTransaction) return;
        try {
            await updateIncomeTransaction(editingTransaction.id, data, authUser.uid, authUser.email);
            toast({ title: "Success", description: "Tithe record updated." });
            setIsEditDialogOpen(false);
            setEditingTransaction(null);
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to update record." });
        }
    };

    const handleAdd = async (data: IncomeFormValues) => {
        if (!authUser || !member) return;
        
        const selectedSource = titheSources?.find(s => s.accountId === data.accountId);
        if (!selectedSource) {
            toast({ variant: "destructive", title: "Config Error", description: "Please select a valid income source for this tithe." });
            return;
        }

        try {
            await addIncomeTransaction(data, selectedSource.id, authUser.uid, authUser.email);
            toast({ title: "Success", description: "Tithe recorded successfully." });
            setIsAddDialogOpen(false);
            form.reset({
                code: "",
                transactionName: `Tithe - ${member.fullName}`,
                date: new Date(),
                amount: 0,
                description: "",
                category: "Tithe",
                accountId: selectedSource.accountId || '',
                memberName: member.fullName,
            });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to record tithe." });
        }
    };

    const handleDelete = async (transactionId: string) => {
        if (!authUser) return;
        try {
            await deleteIncomeTransaction(transactionId, authUser.uid, authUser.email);
            toast({ title: "Success", description: "Tithe record deleted." });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to delete record." });
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
            category: "Tithe",
            accountId: transaction.accountId || "",
            memberName: transaction.memberName || member?.fullName || "",
        });
        setIsEditDialogOpen(true);
    };

    const formatCurrency = (value: number) => {
        return `${value.toLocaleString('fr-CM', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} XAF`;
    };

    const isLoading = loadingMember || loadingTithes || authLoading || loadingSources;
    const error = errorMember || errorTithes || authError;

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <Alert variant="destructive" className="m-6">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error.message}</AlertDescription>
            </Alert>
        );
    }
    
    if (!member) {
        return (
            <Alert variant="destructive" className="m-6">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Not Found</AlertTitle>
                <AlertDescription>The requested member could not be found.</AlertDescription>
            </Alert>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <Button variant="outline" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Members
                </Button>
                <Button onClick={() => setIsAddDialogOpen(true)}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Tithe Record
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                        <HandCoins className="h-8 w-8 text-primary" />
                        <span>Tithe History for {member.fullName}</span>
                    </CardTitle>
                    <CardDescription>View, edit, or delete all tithes recorded for this member.</CardDescription>
                </CardHeader>
                <CardContent>
                     <div className="flex items-center space-x-4 rounded-md border p-4 bg-muted/50">
                        <DollarSign className="h-8 w-8 text-emerald-500" />
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium leading-none">Total Tithes Paid</p>
                          <p className="text-2xl font-bold">{formatCurrency(totalTithes)}</p>
                        </div>
                      </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Tithe Records</CardTitle>
                    <CardDescription>List of individual tithe payments.</CardDescription>
                </CardHeader>
                <CardContent>
                    {!titheRecords || titheRecords.length === 0 ? (
                        <p className="text-center text-muted-foreground py-10">No tithe records found for this member.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Code</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {titheRecords.map(record => (
                                        <TableRow key={record.id}>
                                            <TableCell>{record.code}</TableCell>
                                            <TableCell>{format(record.date, "PP")}</TableCell>
                                            <TableCell className="text-right font-medium">{formatCurrency(record.amount)}</TableCell>
                                            <TableCell className="max-w-[200px] truncate" title={record.description}>{record.description || 'N/A'}</TableCell>
                                            <TableCell className="text-right space-x-1">
                                                <Button variant="ghost" size="icon" onClick={() => openEditDialog(record)} aria-label="Edit Tithe"><Edit className="h-4 w-4" /></Button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="icon" aria-label="Delete Tithe"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Delete Tithe Record?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                Are you sure you want to delete this tithe record of {formatCurrency(record.amount)}? This action cannot be undone.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => handleDelete(record.id)}>Delete</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Add Tithe Dialog */}
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Record Tithe for {member.fullName}</DialogTitle>
                        <DialogDescription>Enter the details for a tithe payment. You can select past dates if needed.</DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(handleAdd)} className="space-y-4 py-4">
                            <FormField control={form.control} name="date" render={({ field }) => (
                                <FormItem className="flex flex-col"><FormLabel>Payment Date</FormLabel>
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
                                            <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                                        </PopoverContent>
                                    </Popover>
                                <FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name="accountId" render={({ field }) => (
                                <FormItem><FormLabel>Assign to Income Fund</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value || ""}>
                                        <FormControl><SelectTrigger><SelectValue placeholder="Select accounting fund" /></SelectTrigger></FormControl>
                                        <SelectContent>
                                            {titheSources?.map(s => <SelectItem key={s.id} value={s.accountId || ''}>{s.transactionName}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <FormDescription className="flex items-center gap-1">
                                        <Info className="h-3 w-3" /> Links this payment to a budget category in your Income reports.
                                    </FormDescription>
                                <FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name="code" render={({ field }) => (
                                <FormItem><FormLabel>Receipt/Transaction Code</FormLabel><FormControl><Input placeholder="e.g., T-2024-001" {...field} /></FormControl><FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name="amount" render={({ field }) => (
                                <FormItem><FormLabel>Amount (XAF)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name="description" render={({ field }) => (
                                <FormItem><FormLabel>Notes (Optional)</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                            )}/>
                            <DialogFooter>
                                <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                                <Button type="submit" disabled={form.formState.isSubmitting}>
                                    {form.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                                    Record Tithe
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            {/* Edit Tithe Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={(open) => { setIsEditDialogOpen(open); if (!open) setEditingTransaction(null); }}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Edit Tithe Record</DialogTitle>
                        <DialogDescription>Update the details for this member's tithe payment.</DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(handleUpdate)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
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
                                            <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                                        </PopoverContent>
                                    </Popover>
                                <FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name="code" render={({ field }) => (
                                <FormItem><FormLabel>Transaction Code</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
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