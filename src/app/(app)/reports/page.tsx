
"use client";

import React, { useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarIcon, FileText, Download, Loader2, AlertTriangle, FileUp, Search, User } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { auth, db } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { collection, query, orderBy, Timestamp, type DocumentData, type QueryDocumentSnapshot, type SnapshotOptions } from 'firebase/firestore';
import type { IncomeRecord, TitheRecord, ExpenseRecord, IncomeRecordFirestore, TitheRecordFirestore, ExpenseRecordFirestore } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { downloadCsv, downloadPdf } from '@/lib/report-utils';

type ReportType = "income" | "expenses" | "tithes" | "summary";
type PeriodType = "all" | "monthly";

// We keep the converters here to ensure the useCollectionData hooks work as expected for data display/preview
const incomeConverter = {
  toFirestore(record: IncomeRecord): DocumentData { return record as DocumentData; },
  fromFirestore(snapshot: QueryDocumentSnapshot, options: SnapshotOptions): IncomeRecord {
    const data = snapshot.data(options) as Omit<IncomeRecordFirestore, 'id'>;
    return {
      id: snapshot.id,
      date: data.date instanceof Timestamp ? data.date.toDate() : new Date(),
      category: data.category,
      amount: data.amount,
      description: data.description,
      memberName: data.memberName,
      recordedByUserId: data.recordedByUserId,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : undefined,
    };
  }
};
const titheConverter = {
  toFirestore(record: TitheRecord): DocumentData { return record as DocumentData; },
  fromFirestore(snapshot: QueryDocumentSnapshot, options: SnapshotOptions): TitheRecord {
    const data = snapshot.data(options) as Omit<TitheRecordFirestore, 'id'>;
    return {
      id: snapshot.id, memberName: data.memberName,
      date: data.date instanceof Timestamp ? data.date.toDate() : new Date(),
      amount: data.amount, recordedByUserId: data.recordedByUserId,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : undefined,
    };
  }
};
const expenseConverter = {
  toFirestore(record: ExpenseRecord): DocumentData { return record as DocumentData; },
  fromFirestore(snapshot: QueryDocumentSnapshot, options: SnapshotOptions): ExpenseRecord {
    const data = snapshot.data(options) as Omit<ExpenseRecordFirestore, 'id'>;
    return {
      id: snapshot.id,
      date: data.date instanceof Timestamp ? data.date.toDate() : new Date(),
      category: data.category, amount: data.amount, description: data.description,
      payee: data.payee, paymentMethod: data.paymentMethod, recordedByUserId: data.recordedByUserId,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : undefined,
    };
  }
};


export default function ReportsPage() {
  const { toast } = useToast();
  const [authUser, authLoading, authError] = useAuthState(auth);

  const [reportType, setReportType] = useState<ReportType>("summary");
  const [periodType, setPeriodType] = useState<PeriodType>("monthly");
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const [titheMemberSearch, setTitheMemberSearch] = useState('');

  const [incomeRecords] = useCollectionData(collection(db, 'income_records').withConverter(incomeConverter));
  const [titheRecords] = useCollectionData(collection(db, 'tithe_records').withConverter(titheConverter));
  const [expenseRecords] = useCollectionData(collection(db, 'expense_records').withConverter(expenseConverter));

  const filteredTitheRecords = useMemo(() => {
    if (!titheMemberSearch) return [];
    return (titheRecords || []).filter(r => 
      r.memberName.toLowerCase().includes(titheMemberSearch.toLowerCase())
    ).sort((a,b) => a.date.getTime() - b.date.getTime());
  }, [titheRecords, titheMemberSearch]);

  const uniqueMemberNames = useMemo(() => {
    const names = new Set((titheRecords || []).map(r => r.memberName));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [titheRecords]);
  
  const selectedMember = useMemo(() => {
    if (titheMemberSearch && uniqueMemberNames.includes(titheMemberSearch)) {
      return titheMemberSearch;
    }
    return null;
  }, [titheMemberSearch, uniqueMemberNames]);

  const generateReport = async (formatType: 'pdf' | 'csv') => {
    setIsGenerating(true);
    setGenerationError(null);
    
    const startDate = periodType === 'monthly' ? startOfMonth(selectedMonth) : undefined;
    const endDate = periodType === 'monthly' ? endOfMonth(selectedMonth) : undefined;

    try {
      let rawData: any[] = [];
      let reportTitle = "";
      const periodString = periodType === 'monthly' ? `for ${format(selectedMonth, "MMMM yyyy")}` : 'for All Time';

      switch (reportType) {
        case 'income':
          reportTitle = `Income Report ${periodString}`;
          rawData = (incomeRecords || []).filter(r => 
            !startDate || (r.date >= startDate && r.date <= endDate!)
          );
          break;
        case 'expenses':
          reportTitle = `Expense Report ${periodString}`;
          rawData = (expenseRecords || []).filter(r => 
            !startDate || (r.date >= startDate && r.date <= endDate!)
          );
          break;
        case 'tithes':
          reportTitle = `Tithe Report ${periodString}`;
          rawData = (titheRecords || []).filter(r => 
            !startDate || (r.date >= startDate && r.date <= endDate!)
          );
          break;
        case 'summary':
           reportTitle = `Financial Summary ${periodString}`;
           const filteredIncome = (incomeRecords || []).filter(r => !startDate || (r.date >= startDate && r.date <= endDate!));
           const filteredTithes = (titheRecords || []).filter(r => !startDate || (r.date >= startDate && r.date <= endDate!));
           const filteredExpenses = (expenseRecords || []).filter(r => !startDate || (r.date >= startDate && r.date <= endDate!));
           const totalOfferingsAndDonations = filteredIncome.reduce((sum, r) => sum + r.amount, 0);
           const totalTithes = filteredTithes.reduce((sum, r) => sum + r.amount, 0);
           const totalExpenses = filteredExpenses.reduce((sum, r) => sum + r.amount, 0);
           rawData = [
             { Category: 'Total Income (Offerings, Donations, etc.)', Amount: totalOfferingsAndDonations },
             { Category: 'Total Tithes', Amount: totalTithes },
             { Category: 'Total Combined Income', Amount: totalOfferingsAndDonations + totalTithes },
             { Category: 'Total Expenses', Amount: totalExpenses },
             { Category: 'Net Balance', Amount: totalOfferingsAndDonations + totalTithes - totalExpenses },
           ];
          break;
      }
      
      // Sanitize data for export: remove id and recordedByUserId
      const finalData = rawData.map(record => {
          const { id, recordedByUserId, createdAt, ...rest } = record;
          return rest;
      });

      if (finalData.length === 0) {
        toast({ title: "No Data", description: "No records found for the selected criteria." });
        return;
      }

      if (formatType === 'csv') {
        downloadCsv(finalData, reportTitle);
      } else {
        downloadPdf(finalData, reportTitle, reportType);
      }

      toast({ title: "Success", description: `Report has been prepared for download.` });

    } catch (err: any) {
      setGenerationError(err.message || "Failed to generate report.");
      toast({ variant: "destructive", title: "Generation Failed", description: err.message || "An unknown error occurred." });
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleIndividualTitheDownload = () => {
    if (!selectedMember || filteredTitheRecords.length === 0) {
      toast({ title: "No Data", description: "Please select a member with records to download." });
      return;
    }
    const reportTitle = `Tithe Statement for ${selectedMember}`;
    downloadPdf(filteredTitheRecords, reportTitle, 'individual_tithe');
  }

  const formatCurrency = (value: number) => {
    return `${value.toLocaleString('fr-CM', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} XAF`;
  };


  if (authLoading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  if (authError) {
    return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Authentication Error</AlertTitle><AlertDescription>{authError.message}</AlertDescription></Alert>;
  }
  if (!authUser) {
    return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Not Authenticated</AlertTitle><AlertDescription>Please log in to generate reports.</AlertDescription></Alert>;
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center">
          <FileText className="mr-3 h-8 w-8 text-primary" />
          Financial Reports
        </h1>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>General Report Generator</CardTitle>
          <CardDescription>Select your report criteria and download the data in your desired format.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>1. Select Report Type</Label>
              <Select value={reportType} onValueChange={(v) => setReportType(v as ReportType)} disabled={isGenerating}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a report type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="summary">Financial Summary</SelectItem>
                  <SelectItem value="income">Income Report</SelectItem>
                  <SelectItem value="expenses">Expense Report</SelectItem>
                  <SelectItem value="tithes">Tithe Report</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>2. Select Period</Label>
              <RadioGroup value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)} className="flex items-center space-x-4" disabled={isGenerating}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="monthly" id="monthly" />
                  <Label htmlFor="monthly">Monthly</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="all" id="all" />
                  <Label htmlFor="all">All-Time</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
          
          {periodType === 'monthly' && (
            <div className="space-y-2">
              <Label>3. Select Month</Label>
               <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full sm:w-[280px] justify-start text-left font-normal" disabled={isGenerating}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(selectedMonth, "MMMM yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={selectedMonth}
                      onSelect={(d) => d && setSelectedMonth(d)}
                      initialFocus
                      captionLayout="dropdown-buttons"
                      fromYear={2020}
                      toYear={new Date().getFullYear()}
                    />
                  </PopoverContent>
                </Popover>
            </div>
          )}

          {generationError && (
             <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{generationError}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t">
            <Button onClick={() => generateReport('pdf')} disabled={isGenerating} className="w-full sm:w-auto">
              {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Download PDF
            </Button>
            <Button onClick={() => generateReport('csv')} disabled={isGenerating} className="w-full sm:w-auto">
              {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
              Download Excel (CSV)
            </Button>
          </div>
        </CardContent>
      </Card>
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Individual Tithe Report</CardTitle>
          <CardDescription>Search for a member to view and download their individual tithe statement.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="member-search">Search Member Name</Label>
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                        id="member-search"
                        type="search"
                        placeholder="Start typing a member's name..."
                        className="pl-8"
                        value={titheMemberSearch}
                        onChange={(e) => setTitheMemberSearch(e.target.value)}
                        list="member-names"
                    />
                    <datalist id="member-names">
                      {uniqueMemberNames.map(name => <option key={name} value={name} />)}
                    </datalist>
                </div>
            </div>

            {selectedMember && (
                <div>
                    <h3 className="text-lg font-semibold my-4">Records for: {selectedMember}</h3>
                    {filteredTitheRecords.length > 0 ? (
                        <>
                            <div className="overflow-x-auto border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Date</TableHead>
                                            <TableHead className="text-right">Amount</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredTitheRecords.map(record => (
                                            <TableRow key={record.id}>
                                                <TableCell>{format(record.date, 'PP')}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(record.amount)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                            <p className="text-right font-bold mt-2">
                                Total: {formatCurrency(filteredTitheRecords.reduce((sum, r) => sum + r.amount, 0))}
                            </p>
                            <div className="pt-4 border-t mt-4">
                                <Button onClick={handleIndividualTitheDownload} disabled={!selectedMember || filteredTitheRecords.length === 0}>
                                    <Download className="mr-2 h-4 w-4" />
                                    Download PDF for {selectedMember}
                                </Button>
                            </div>
                        </>
                    ) : (
                        <p className="text-center text-muted-foreground py-6">No tithe records found for this member.</p>
                    )}
                </div>
            )}
            {!selectedMember && titheMemberSearch && (
                 <p className="text-center text-muted-foreground py-6">No member found matching your search.</p>
            )}
        </CardContent>
      </Card>
    </div>
  );
}

    