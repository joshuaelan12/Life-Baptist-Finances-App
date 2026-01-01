
"use client";

import React, { useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarIcon, FileText, Download, Loader2, AlertTriangle, FileUp, Search } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear } from "date-fns";
import { DateRange } from "react-day-picker";
import { auth, db } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { collection, query, orderBy, Timestamp, type DocumentData, type QueryDocumentSnapshot, type SnapshotOptions, where } from 'firebase/firestore';
import type { IncomeRecord, ExpenseRecord, IncomeRecordFirestore, ExpenseRecordFirestore, Account, AccountFirestore, IncomeSource, ExpenseSource } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { downloadCsv, downloadPdf } from '@/lib/report-utils';

type ReportType = "income" | "expenses" | "summary" | "budget_vs_actuals" | "balance_sheet";
type PeriodType = "all" | "monthly" | "custom";

const incomeConverter = {
  toFirestore(record: IncomeRecord): DocumentData { return record as DocumentData; },
  fromFirestore(snapshot: QueryDocumentSnapshot, options: SnapshotOptions): IncomeRecord {
    const data = snapshot.data(options) as Omit<IncomeRecordFirestore, 'id'>;
    return {
      id: snapshot.id,
      ...data,
      date: data.date instanceof Timestamp ? data.date.toDate() : new Date(),
    };
  }
};
const expenseConverter = {
  toFirestore(record: ExpenseRecord): DocumentData { return record as DocumentData; },
  fromFirestore(snapshot: QueryDocumentSnapshot, options: SnapshotOptions): ExpenseRecord {
    const data = snapshot.data(options) as Omit<ExpenseRecordFirestore, 'id'>;
    return {
      id: snapshot.id,
      ...data,
      date: data.date instanceof Timestamp ? data.date.toDate() : new Date(),
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

const expenseSourceConverter = {
    fromFirestore: (snapshot: any): ExpenseSource => {
        const data = snapshot.data();
        return {
            id: snapshot.id,
            ...data,
            createdAt: (data.createdAt as Timestamp)?.toDate(),
        } as ExpenseSource;
    },
    toFirestore: (source: ExpenseSource) => source,
};


export default function ReportsPage() {
  const { toast } = useToast();
  const [authUser, authLoading, authError] = useAuthState(auth);

  const [reportType, setReportType] = useState<ReportType>("budget_vs_actuals");
  const [periodType, setPeriodType] = useState<PeriodType>("monthly");
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [selectedDateRange, setSelectedDateRange] = useState<DateRange | undefined>({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });
  const [budgetYear, setBudgetYear] = useState(new Date().getFullYear());

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const [titheMemberSearch, setTitheMemberSearch] = useState('');

  const [incomeRecords, loadingIncome] = useCollectionData(collection(db, 'income_records').withConverter(incomeConverter));
  const [expenseRecords, loadingExpenses] = useCollectionData(collection(db, 'expense_records').withConverter(expenseConverter));
  const [accounts, loadingAccounts] = useCollectionData(collection(db, 'accounts').withConverter(accountConverter));
  const [incomeSources, loadingIncomeSources] = useCollectionData(collection(db, 'income_sources').withConverter(incomeSourceConverter));
  const [expenseSources, loadingExpenseSources] = useCollectionData(collection(db, 'expense_sources').withConverter(expenseSourceConverter));
  const [members, loadingMembers] = useCollectionData(collection(db, 'members'));
  
  const accountsMap = useMemo(() => {
    if (!accounts) return new Map<string, Account>();
    return new Map(accounts.map(acc => [acc.id, acc]));
  }, [accounts]);

  const filteredTitheRecords = useMemo(() => {
    if (!titheMemberSearch || !incomeRecords) return [];
    return incomeRecords.filter(r => 
      r.category === 'Tithe' && r.memberName && r.memberName.toLowerCase().includes(titheMemberSearch.toLowerCase())
    ).sort((a,b) => a.date.getTime() - b.date.getTime());
  }, [incomeRecords, titheMemberSearch]);

  const uniqueMemberNames = useMemo(() => {
    if (!incomeRecords) return [];
    const names = new Set(incomeRecords.filter(r => r.category === 'Tithe' && r.memberName).map(r => r.memberName) as string[]);
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [incomeRecords]);
  
  const selectedMember = useMemo(() => {
    if (titheMemberSearch && uniqueMemberNames.includes(titheMemberSearch)) {
      return titheMemberSearch;
    }
    return null;
  }, [titheMemberSearch, uniqueMemberNames]);

  const generateReport = async (formatType: 'pdf' | 'csv') => {
    setIsGenerating(true);
    setGenerationError(null);
    
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    let periodString = "";

    if (periodType === 'monthly') {
      startDate = startOfMonth(selectedMonth);
      endDate = endOfMonth(selectedMonth);
      periodString = `for ${format(selectedMonth, "MMMM yyyy")}`;
    } else if (periodType === 'custom' && selectedDateRange?.from) {
      startDate = selectedDateRange.from;
      endDate = selectedDateRange.to ?? selectedDateRange.from;
      periodString = `from ${format(startDate, "PPP")} to ${format(endDate, "PPP")}`;
    } else {
      periodString = "for All Time";
    }

    try {
      let rawData: any[] = [];
      let reportTitle = "";

      const reportOptions = { 
          budgetYear, 
          periodString, 
          incomeRecords: incomeRecords || [], 
          expenseRecords: expenseRecords || [],
          incomeSources: incomeSources || [],
          expenseSources: expenseSources || [],
          startDate,
          endDate,
      };

      switch (reportType) {
        case 'income':
          reportTitle = `Income Report ${periodString}`;
          rawData = (incomeRecords || [])
            .filter(r => !startDate || (r.date >= startDate && r.date <= endDate!))
            .map(r => ({ ...r, accountName: accountsMap.get(r.accountId || '')?.name || 'N/A' }));
          break;
        case 'expenses':
          reportTitle = `Expense Report ${periodString}`;
          rawData = (expenseRecords || [])
            .filter(r => !startDate || (r.date >= startDate && r.date <= endDate!))
            .map(r => ({ ...r, accountName: accountsMap.get(r.accountId || '')?.name || 'N/A' }));
          break;
        case 'summary':
           reportTitle = `Financial Summary ${periodString}`;
           const filteredIncome = (incomeRecords || []).filter(r => !startDate || (r.date >= startDate && r.date <= endDate!));
           const filteredExpenses = (expenseRecords || []).filter(r => !startDate || (r.date >= startDate && r.date <= endDate!));
           const totalIncome = filteredIncome.reduce((sum, r) => sum + r.amount, 0);
           const totalExpenses = filteredExpenses.reduce((sum, r) => sum + r.amount, 0);
           rawData = [
             { Category: 'Total Income', Amount: totalIncome },
             { Category: 'Total Expenses', Amount: totalExpenses },
             { Category: 'Net Balance', Amount: totalIncome - totalExpenses },
           ];
          break;
        case 'budget_vs_actuals':
        case 'balance_sheet':
          reportTitle = reportType === 'balance_sheet' ? `Balance Sheet as of ${format(endDate || new Date(), "PPP")}` : `Budget vs. Actuals ${periodString}`;
          rawData = accounts || [];
          break;
      }
      
      const finalData = rawData.map(record => {
          const { id, recordedByUserId, createdAt, accountId, ...rest } = record;
          return rest;
      });

      if (finalData.length === 0) {
        toast({ title: "No Data", description: "No records found for the selected criteria." });
        return;
      }

      if (formatType === 'csv') {
        downloadCsv(rawData, reportTitle, reportType, reportOptions);
      } else {
        downloadPdf(rawData, reportTitle, reportType, reportOptions);
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

  const yearOptions = Array.from({length: 11}, (_, i) => new Date().getFullYear() + 5 - i);


  if (authLoading || loadingAccounts || loadingIncome || loadingExpenses || loadingMembers || loadingIncomeSources || loadingExpenseSources) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  if (authError) {
    return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Authentication Error</AlertTitle><AlertDescription>{authError.message}</AlertDescription></Alert>;
  }
  if (!authUser) {
    return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Not Authenticated</AlertTitle><AlertDescription>Please log in to generate reports.</AlertDescription></Alert>;
  }

  const showPeriodSelector = reportType !== 'balance_sheet';

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
                  <SelectItem value="budget_vs_actuals">Budget vs Actuals</SelectItem>
                  <SelectItem value="balance_sheet">Balance Sheet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {showPeriodSelector && (
              <div className="space-y-2">
                <Label>2. Select Period</Label>
                <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)} disabled={isGenerating}>
                   <SelectTrigger>
                      <SelectValue placeholder="Choose a period..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="custom">Custom Range</SelectItem>
                      <SelectItem value="all">All Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            {periodType === 'monthly' && showPeriodSelector && (
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
                        fromYear={startOfYear(subMonths(new Date(), 60)).getFullYear()}
                        toYear={new Date().getFullYear()}
                      />
                    </PopoverContent>
                  </Popover>
              </div>
            )}
            {(periodType === 'custom' || reportType === 'balance_sheet') && (
              <div className="space-y-2">
                  <Label>{reportType === 'balance_sheet' ? 'Select Date' : '3. Select Date Range'}</Label>
                  <Popover>
                      <PopoverTrigger asChild>
                      <Button
                          id="date"
                          variant={"outline"}
                          className={("w-full sm:w-[300px] justify-start text-left font-normal")}
                          disabled={isGenerating}
                      >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {reportType === 'balance_sheet' ? (
                            selectedDateRange?.to ? format(selectedDateRange.to, "LLL dd, y") : <span>Pick a date</span>
                          ) : (
                            selectedDateRange?.from ? (
                                selectedDateRange.to ? (
                                <>
                                    {format(selectedDateRange.from, "LLL dd, y")} - {format(selectedDateRange.to, "LLL dd, y")}
                                </>
                                ) : (
                                format(selectedDateRange.from, "LLL dd, y")
                                )
                            ) : (
                                <span>Pick a date range</span>
                            )
                          )}
                      </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                          initialFocus
                          mode={reportType === 'balance_sheet' ? 'single' : 'range'}
                          defaultMonth={reportType === 'balance_sheet' ? selectedDateRange?.to : selectedDateRange?.from}
                          selected={reportType === 'balance_sheet' ? selectedDateRange?.to : selectedDateRange}
                          onSelect={reportType === 'balance_sheet' ? (date) => setSelectedDateRange({from: date, to: date}) : setSelectedDateRange}
                          numberOfMonths={reportType === 'balance_sheet' ? 1 : 2}
                      />
                      </PopoverContent>
                  </Popover>
              </div>
            )}

            {(reportType === 'budget_vs_actuals') && (
               <div className="space-y-2">
                 <Label>Select Budget Year</Label>
                 <Select value={String(budgetYear)} onValueChange={(v) => setBudgetYear(Number(v))} disabled={isGenerating}>
                    <SelectTrigger className="w-full sm:w-[280px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {yearOptions.map(year => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}
                    </SelectContent>
                 </Select>
               </div>
            )}
          </div>

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

    