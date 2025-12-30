
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
import { UserPlus, PlusCircle, Edit, Trash2, Loader2, AlertTriangle, Users, Search } from "lucide-react";
import { auth, db } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { collection, query, orderBy, Timestamp, where } from 'firebase/firestore';
import { addMember, updateMember, deleteMember } from '@/services/memberService';
import { getTitheTotalForMember } from '@/services/titheService';
import type { Member, MemberFirestore, TitheRecord, TitheRecordFirestore } from '@/types';
import { memberSchema, type MemberFormValues } from '@/types';
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

const titheConverter = {
    fromFirestore: (snapshot: any): TitheRecord => {
        const data = snapshot.data() as Omit<TitheRecordFirestore, 'id'>;
        return {
            id: snapshot.id,
            ...data,
            date: (data.date as Timestamp).toDate(),
            createdAt: (data.createdAt as Timestamp)?.toDate(),
        };
    },
    toFirestore: (tithe: TitheRecord) => tithe,
}

export default function MembersPage() {
    const { toast } = useToast();
    const [authUser, authLoading] = useAuthState(auth);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [selectedMember, setSelectedMember] = useState<Member | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [memberTithes, setMemberTithes] = useState<Record<string, number>>({});

    const membersQuery = useMemo(() => authUser ? query(collection(db, 'members'), orderBy('fullName')).withConverter(memberConverter) : null, [authUser]);
    const [members, loadingMembers, errorMembers] = useCollectionData(membersQuery);
    
    const tithesQuery = useMemo(() => authUser ? collection(db, 'tithe_records').withConverter(titheConverter) : null, [authUser]);
    const [titheRecords, loadingTithes] = useCollectionData(tithesQuery);

    React.useEffect(() => {
      if (members && titheRecords) {
        const totals: Record<string, number> = {};
        members.forEach(member => {
            const memberTotal = titheRecords
                .filter(tithe => tithe.memberId === member.id)
                .reduce((sum, tithe) => sum + tithe.amount, 0);
            totals[member.id] = memberTotal;
        });
        setMemberTithes(totals);
      }
    }, [members, titheRecords])


    const addForm = useForm<MemberFormValues>({
        resolver: zodResolver(memberSchema),
        defaultValues: { fullName: "" },
    });

    const editForm = useForm<MemberFormValues>({ resolver: zodResolver(memberSchema) });

    const filteredMembers = useMemo(() => {
        if (!members) return [];
        if (!searchTerm) return members;
        return members.filter(member => member.fullName.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [members, searchTerm]);

    const handleAddMember = async (data: MemberFormValues) => {
        if (!authUser) return;
        setIsSubmitting(true);
        try {
            await addMember(data, authUser.uid, authUser.email);
            toast({ title: "Success", description: "Member added successfully." });
            addForm.reset({ fullName: "" });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to add member." });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdateMember = async (data: MemberFormValues) => {
        if (!authUser || !selectedMember) return;
        setIsSubmitting(true);
        try {
            await updateMember(selectedMember.id, data, authUser.uid, authUser.email);
            toast({ title: "Success", description: "Member updated successfully." });
            setIsEditDialogOpen(false);
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to update member." });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDeleteMember = async (memberId: string) => {
        if (!authUser) return;
        // Check if member has associated tithes
        const hasTithes = titheRecords?.some(t => t.memberId === memberId);
        if (hasTithes) {
            toast({
                variant: "destructive",
                title: "Deletion Blocked",
                description: "Cannot delete a member with existing tithe records. Please remove their tithes first.",
            });
            return;
        }
        try {
            await deleteMember(memberId, authUser.uid, authUser.email);
            toast({ title: "Success", description: "Member deleted successfully." });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to delete member." });
        }
    }

    const openEditDialog = (member: Member) => {
        setSelectedMember(member);
        editForm.reset(member);
        setIsEditDialogOpen(true);
    };

    const formatCurrency = (value: number) => {
        return `${value.toLocaleString('fr-CM', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} XAF`;
    };

    const isLoading = authLoading || loadingMembers || loadingTithes;

    if (isLoading && !members) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
    }
    
    if (!authUser) {
         return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Not Authenticated</AlertTitle><AlertDescription>Please log in to manage members and tithes.</AlertDescription></Alert>;
    }

    return (
        <div className="space-y-6 md:space-y-8">
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center">
                <Users className="mr-3 h-8 w-8 text-primary" />
                Manage Members & Tithes
            </h1>

            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle>Add New Member</CardTitle>
                    <CardDescription>Add a new member to the church records.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...addForm}>
                        <form onSubmit={addForm.handleSubmit(handleAddMember)} className="flex items-end gap-4">
                            <FormField control={addForm.control} name="fullName" render={({ field }) => (
                                <FormItem className="flex-grow"><FormLabel>Member's Full Name</FormLabel><FormControl><Input placeholder="e.g., John Doe" {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                                Add Member
                            </Button>
                        </form>
                    </Form>
                </CardContent>
            </Card>

            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle>Church Members</CardTitle>
                    <div className="flex justify-between items-center">
                        <CardDescription>View members, their total contributions, and manage their records.</CardDescription>
                         <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="search"
                                placeholder="Search by name..."
                                className="pl-8 w-full md:w-[300px]"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {errorMembers && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{errorMembers.message}</AlertDescription></Alert>}
                    {!errorMembers && filteredMembers.length > 0 && (
                         <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Member Name</TableHead>
                                        <TableHead>Total Tithe Contribution</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredMembers.map(member => (
                                        <TableRow key={member.id}>
                                            <TableCell>
                                                <Link href={`/tithes/${member.id}`} className="hover:underline text-primary font-medium">
                                                    {member.fullName}
                                                </Link>
                                            </TableCell>
                                            <TableCell>{formatCurrency(memberTithes[member.id] || 0)}</TableCell>
                                            <TableCell className="text-right space-x-1">
                                                <Button variant="ghost" size="icon" onClick={() => openEditDialog(member)} aria-label="Edit Member"><Edit className="h-4 w-4" /></Button>
                                                <Button variant="ghost" size="icon" onClick={() => handleDeleteMember(member.id)} aria-label="Delete Member"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                    {!errorMembers && filteredMembers.length === 0 && (
                        <p className="text-center text-muted-foreground py-10">
                            {searchTerm ? `No members found matching "${searchTerm}".` : "No members added yet."}
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Edit Member Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Member</DialogTitle>
                        <DialogDescription>Update the name for "{selectedMember?.fullName}".</DialogDescription>
                    </DialogHeader>
                    <Form {...editForm}>
                        <form onSubmit={editForm.handleSubmit(handleUpdateMember)} className="space-y-4 py-4">
                             <FormField control={editForm.control} name="fullName" render={({ field }) => (
                                <FormItem><FormLabel>Member Full Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
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
