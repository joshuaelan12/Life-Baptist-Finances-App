
"use client";

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Edit, Trash2, Loader2, AlertTriangle, Users, Search } from "lucide-react";
import { auth, db } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { collection, query, orderBy, Timestamp } from 'firebase/firestore';
import { addMember, updateMember, deleteMember } from '@/services/memberService';
import type { Member, MemberFirestore, MemberFormValues, IncomeRecord, IncomeRecordFirestore } from '@/types';
import { memberSchema } from '@/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

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

export default function MembersPage() {
    const { toast } = useToast();
    const [authUser, authLoading, authError] = useAuthState(auth);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isMemberDialogOpen, setIsMemberDialogOpen] = useState(false);
    const [editingMember, setEditingMember] = useState<Member | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

    const memberForm = useForm<MemberFormValues>({
        resolver: zodResolver(memberSchema),
        defaultValues: { fullName: "" },
    });

    const membersQuery = useMemo(() => authUser ? query(collection(db, 'members'), orderBy('fullName')).withConverter(memberConverter) : null, [authUser]);
    const [members, loadingMembers, errorMembers] = useCollectionData(membersQuery);
    
    const incomeQuery = useMemo(() => authUser ? query(collection(db, 'income_records'), where('category', '==', 'Tithe')) : null, [authUser]);
    const [titheRecords, loadingTithes, errorTithes] = useCollectionData(incomeQuery?.withConverter(incomeConverter));

    const filteredMembers = useMemo(() => {
        if (!members) return [];
        if (!searchTerm) return members;
        return members.filter(member => member.fullName.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [members, searchTerm]);
    
    const memberTitheTotals = useMemo(() => {
        if (!titheRecords) return {};
        return titheRecords.reduce((acc, record) => {
            if (record.memberName) {
                acc[record.memberName] = (acc[record.memberName] || 0) + record.amount;
            }
            return acc;
        }, {} as Record<string, number>);

    }, [titheRecords]);


    const handleMemberSubmit = async (data: MemberFormValues) => {
        if (!authUser) return;
        setIsSubmitting(true);
        try {
            if (editingMember) {
                await updateMember(editingMember.id, data, authUser.uid, authUser.email);
                toast({ title: "Success", description: "Member updated successfully." });
            } else {
                await addMember(data, authUser.uid, authUser.email);
                toast({ title: "Success", description: "Member added successfully." });
            }
            setIsMemberDialogOpen(false);
            setEditingMember(null);
            memberForm.reset({ fullName: "" });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to save member." });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const openMemberDialog = (member: Member | null) => {
        setEditingMember(member);
        memberForm.reset(member ? { fullName: member.fullName } : { fullName: "" });
        setIsMemberDialogOpen(true);
    };
    
    const handleDeleteMember = async (member: Member) => {
        if (!authUser) return;
        
        const hasTithes = titheRecords?.some(r => r.memberName === member.fullName);
        if (hasTithes) {
            toast({
                variant: "destructive",
                title: "Deletion Blocked",
                description: "Cannot delete a member with existing tithe records. Please reassign or remove their tithes first.",
            });
            return;
        }
        
        try {
            await deleteMember(member.id, authUser.uid, authUser.email);
            toast({ title: "Success", description: "Member deleted successfully." });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to delete member." });
        }
    };

    const formatCurrency = (value: number) => {
        return `${value.toLocaleString('fr-CM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} XAF`;
    };

    const isLoading = authLoading || loadingMembers || loadingTithes;
    const dataError = authError || errorMembers || errorTithes;

    if (isLoading) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
    }

    if (dataError) {
        return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{dataError.message}</AlertDescription></Alert>;
    }
    
    if (!authUser) {
         return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Not Authenticated</AlertTitle><AlertDescription>Please log in to manage members.</AlertDescription></Alert>;
    }

    return (
        <div className="space-y-6 md:space-y-8">
             <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center">
                <Users className="mr-3 h-8 w-8 text-primary" />
                Manage Members
            </h1>

            <Card className="shadow-lg">
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle>Church Members</CardTitle>
                            <CardDescription>Add, edit, or remove church members and view their tithe history.</CardDescription>
                        </div>
                        <Button onClick={() => openMemberDialog(null)}><UserPlus className="mr-2 h-4 w-4" /> Add Member</Button>
                    </div>
                     <div className="relative pt-4">
                        <Search className="absolute left-2.5 top-6 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="Search by name..."
                            className="pl-8 w-full"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    {!filteredMembers.length ? (
                         <p className="text-center text-muted-foreground py-10">
                            {searchTerm ? `No members found matching "${searchTerm}".` : "No members added yet."}
                         </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Member Name</TableHead>
                                        <TableHead>Total Tithes</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredMembers.map(member => (
                                        <TableRow key={member.id}>
                                            <TableCell>
                                                <Link href={`/members/${member.id}`} className="hover:underline text-primary font-medium">
                                                    {member.fullName}
                                                </Link>
                                            </TableCell>
                                            <TableCell>
                                                {formatCurrency(memberTitheTotals[member.fullName] || 0)}
                                            </TableCell>
                                            <TableCell className="text-right space-x-1">
                                                <Button variant="ghost" size="icon" onClick={() => openMemberDialog(member)} aria-label="Edit Member"><Edit className="h-4 w-4" /></Button>
                                                <Button variant="ghost" size="icon" onClick={() => handleDeleteMember(member)} aria-label="Delete Member"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Add/Edit Member Dialog */}
            <Dialog open={isMemberDialogOpen} onOpenChange={setIsMemberDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingMember ? 'Edit Member' : 'Add New Member'}</DialogTitle>
                        <DialogDescription>
                            {editingMember ? `Update the name for "${editingMember.fullName}".` : 'Add a new member to the church records.'}
                        </DialogDescription>
                    </DialogHeader>
                    <Form {...memberForm}>
                        <form onSubmit={memberForm.handleSubmit(handleMemberSubmit)} className="space-y-4 py-4">
                             <FormField control={memberForm.control} name="fullName" render={({ field }) => (
                                <FormItem><FormLabel>Member Full Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                             <DialogFooter>
                                <DialogClose asChild><Button type="button" variant="outline" disabled={isSubmitting}>Cancel</Button></DialogClose>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Save
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
