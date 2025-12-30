
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarIcon, PlusCircle, Trash2, Edit, Loader2, AlertTriangle, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { auth, db } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useDocumentData } from 'react-firebase-hooks/firestore';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { collection, doc, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { addTitheRecord, updateTitheRecord, deleteTitheRecord } from '@/services/titheService';
import type { Member, TitheRecord, TitheFormValues, TitheRecordFirestore } from '@/types';
import { titheSchema } from '@/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const titheConverter = {
    fromFirestore: (snapshot: any): TitheRecord => {
        const data = snapshot.data() as Omit<TitheRecordFirestore, 'id'>;
        return {
            id: snapshot.id,
            ...data,
            date: (data.date as Timestamp).toDate(),
        };
    },
    toFirestore: (tithe: TitheRecord) => tithe,
};

export default function MemberTitheDetailsPage() {
    const router = useRouter();
    const params = useParams();
    const memberId = params.memberId as string;
    const { toast } = useToast();
    const [authUser, authLoading, authError] = useAuthState(auth);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState<TitheRecord | null>(null);

    const [member, loadingMember, errorMember] = useDocumentData(
        memberId ? doc(db, 'members', memberId) : null
    );

    const tithesQuery = useMemo(() => 
        memberId ? query(collection(db, 'tithe_records'), where('memberId', '==', memberId), orderBy('date', 'desc')).withConverter(titheConverter) : null,
    [memberId]);
    const [titheRecords, loadingTithes, errorTithes] = useCollectionData(tithesQuery);

    const form = useForm<Omit<TitheFormValues, 'memberId'>>({
        resolver: zodResolver(titheSchema.omit({ memberId: true })),
        defaultValues: { date: new Date(), amount: 0 },
    });
    
    const editForm = useForm<Omit<TitheFormValues, 'memberId'>>({
        resolver: zodResolver(titheSchema.omit({ memberId: true })),
    });

    const handleAddTithe = async (data: Omit<TitheFormValues, 'memberId'>) => {
        if (!authUser || !member) return;
        setIsSubmitting(true);
        try {
            await addTitheRecord({ ...data, memberId }, authUser.uid, authUser.email, (member as Member).fullName);
            toast({ title: "Success", description: "Tithe record added successfully." });
            form.reset({ date: new Date(), amount: 0 });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to add tithe record." });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdateTithe = async (data: Omit<TitheFormValues, 'memberId'>) => {
        if (!authUser || !editingRecord) return;
        setIsSubmitting(true);
        try {
            await updateTitheRecord(editingRecord.id, data, authUser.uid, authUser.email);
            toast({ title: "Success", description: "Tithe record updated successfully." });
            setIsEditDialogOpen(false);
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to update tithe record." });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDeleteTithe = async (recordId: string) => {
        if (!authUser) return;
        try {
            await deleteTitheRecord(recordId, authUser.uid, authUser.email);
            toast({ title: "Success", description: "Tithe record deleted successfully." });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to delete tithe record." });
        }
    };

    const openEditDialog = (record: TitheRecord) => {
        setEditingRecord(record);
        editForm.reset({ date: record.date, amount: record.amount });
        setIsEditDialogOpen(true);
    };

    const formatCurrency = (value: number) => {
        return `${value.toLocaleString('fr-CM', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} XAF`;
    };

    const totalContributions = useMemo(() => {
        return titheRecords?.reduce((sum, record) => sum + record.amount, 0) || 0;
    }, [titheRecords]);

    const isLoading = loadingMember || loadingTithes || authLoading;
    const error = errorMember || errorTithes || authError;

    if (isLoading) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
    }

    if (error) {
        return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{error.message}</AlertDescription></Alert>;
    }

    if (!member) {
        return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Not Found</AlertTitle><AlertDescription>The requested member could not be found.</AlertDescription></Alert>;
    }

    return (
        <div className="space-y-6">
            <Button variant="outline" onClick={() => router.push('/tithes')} className="mb-4">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to All Members
            </Button>
            
            <Card>
                <CardHeader>
                    <CardTitle>Tithe Records for {(member as Member).fullName}</CardTitle>
                    <CardDescription>Total Contributions: {formatCurrency(totalContributions)}</CardDescription>
                </CardHeader>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Add New Tithe Record</CardTitle>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(handleAddTithe)} className="flex items-end gap-4">
                            <FormField control={form.control} name="date" render={({ field }) => (
                                <FormItem className="flex-grow"><FormLabel>Date</FormLabel>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <FormControl>
                                        <Button variant={"outline"} className={`w-full pl-3 text-left font-normal ${!field.value && "text-muted-foreground"}`}>
                                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                        </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date > new Date()} initialFocus />
                                    </PopoverContent>
                                </Popover>
                                <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="amount" render={({ field }) => (
                                <FormItem className="flex-grow"><FormLabel>Amount (XAF)</FormLabel><FormControl><Input type="number" placeholder="0" {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                             <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                                Add Tithe
                            </Button>
                        </form>
                    </Form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Contribution History</CardTitle>
                </CardHeader>
                <CardContent>
                    {titheRecords && titheRecords.length > 0 ? (
                        <Table>
                            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Amount</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {titheRecords.map(record => (
                                    <TableRow key={record.id}>
                                        <TableCell>{format(record.date, "PP")}</TableCell>
                                        <TableCell>{formatCurrency(record.amount)}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(record)}><Edit className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleDeleteTithe(record.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <p className="text-center text-muted-foreground py-10">No tithe records found for this member yet.</p>
                    )}
                </CardContent>
            </Card>

            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Tithe Record</DialogTitle>
                    </DialogHeader>
                    <Form {...editForm}>
                        <form onSubmit={editForm.handleSubmit(handleUpdateTithe)} className="space-y-4 py-4">
                            <FormField control={editForm.control} name="date" render={({ field }) => (
                                 <FormItem className="flex flex-col"><FormLabel>Date</FormLabel>
                                 <Popover>
                                     <PopoverTrigger asChild>
                                         <FormControl>
                                         <Button variant={"outline"} className={`w-full pl-3 text-left font-normal ${!field.value && "text-muted-foreground"}`}>
                                             {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                             <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                         </Button>
                                         </FormControl>
                                     </PopoverTrigger>
                                     <PopoverContent className="w-auto p-0" align="start">
                                         <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date > new Date()} initialFocus />
                                     </PopoverContent>
                                 </Popover>
                                 <FormMessage />
                                 </FormItem>
                            )} />
                            <FormField control={editForm.control} name="amount" render={({ field }) => (
                                <FormItem><FormLabel>Amount (XAF)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
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
        </div>
    );
}

    