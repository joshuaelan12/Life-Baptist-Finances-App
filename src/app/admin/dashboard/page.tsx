
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldCheck, BrainCircuit, Users, Link2Off, HelpCircle, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { collection } from 'firebase/firestore';
import type { IncomeRecord, ExpenseRecord, IncomeSource, ExpenseSource, UserProfile, Account } from '@/types';

type IntegrityCheckResult = {
    orphanedIncomeRecords: IncomeRecord[];
    orphanedExpenseRecords: ExpenseRecord[];
    uncategorizedIncome: IncomeRecord[];
    uncategorizedExpenses: ExpenseRecord[];
    userCount: number;
};

export default function AdminDashboardPage() {
  const [analysisResult, setAnalysisResult] = useState<IntegrityCheckResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Data hooks
  const [incomeRecords, loadingIncome, errorIncome] = useCollectionData(collection(db, 'income_records'));
  const [expenseRecords, loadingExpenses, errorExpenses] = useCollectionData(collection(db, 'expense_records'));
  const [incomeSources, loadingIncomeSources, errorIncomeSources] = useCollectionData(collection(db, 'income_sources'));
  const [expenseSources, loadingExpenseSources, errorExpenseSources] = useCollectionData(collection(db, 'expense_sources'));
  const [accounts, loadingAccounts, errorAccounts] = useCollectionData(collection(db, 'accounts'));
  const [users, loadingUsers, errorUsers] = useCollectionData(collection(db, 'users'));
  
  const isLoadingData = loadingIncome || loadingExpenses || loadingIncomeSources || loadingExpenseSources || loadingAccounts || loadingUsers;
  const dataError = errorIncome || errorExpenses || errorIncomeSources || errorExpenseSources || errorAccounts || errorUsers;

  const handleRunAudit = () => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisResult(null);

    if (dataError) {
        setAnalysisError(dataError.message);
        setIsAnalyzing(false);
        return;
    }
    
    if (isLoadingData) {
        setAnalysisError("Data is still loading. Please wait a moment and try again.");
        setIsAnalyzing(false);
        return;
    }

    try {
        const accountIds = new Set(accounts?.map(a => a.id));
        const incomeSourceIds = new Set(incomeSources?.map(s => s.id));
        const expenseSourceIds = new Set(expenseSources?.map(s => s.id));

        const orphanedIncomeRecords = (incomeRecords as IncomeRecord[] || []).filter(r => 
            (r.accountId && !accountIds.has(r.accountId)) || 
            (r.incomeSourceId && !incomeSourceIds.has(r.incomeSourceId))
        );
        
        const orphanedExpenseRecords = (expenseRecords as ExpenseRecord[] || []).filter(r => 
            (r.accountId && !accountIds.has(r.accountId)) ||
            (r.expenseSourceId && !expenseSourceIds.has(r.expenseSourceId))
        );

        const uncategorizedIncome = (incomeRecords as IncomeRecord[] || []).filter(r => !r.category);
        const uncategorizedExpenses = (expenseRecords as ExpenseRecord[] || []).filter(r => !r.category);

        const userCount = users?.length || 0;

        setAnalysisResult({
            orphanedIncomeRecords,
            orphanedExpenseRecords,
            uncategorizedIncome,
            uncategorizedExpenses,
            userCount
        });

    } catch (error: any) {
        console.error("Data Integrity Audit Error:", error);
        setAnalysisError(error.message || "An unknown error occurred during the audit.");
    } finally {
        setIsAnalyzing(false);
    }
  };
  
  const getIssueCount = (result: IntegrityCheckResult) => {
      return result.orphanedIncomeRecords.length + result.orphanedExpenseRecords.length + result.uncategorizedIncome.length + result.uncategorizedExpenses.length;
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Admin Dashboard</h1>
      </div>
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Welcome, Admin!</CardTitle>
          <CardDescription>This is the central control panel for administration tasks.</CardDescription>
        </CardHeader>
        <CardContent>
          <p>
            You have successfully accessed the admin area. From here, you can manage users and
            oversee system-wide settings and data integrity.
          </p>
        </CardContent>
      </Card>
      
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3">
            <BrainCircuit className="h-8 w-8 text-primary" />
            <div>
              <CardTitle>Data Integrity &amp; System Audit</CardTitle>
              <CardDescription>Run a scan to find potential issues in your financial data.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button onClick={handleRunAudit} disabled={isAnalyzing || isLoadingData}>
            {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
            {isAnalyzing ? 'Running Audit...' : 'Run Data Audit'}
          </Button>

          {analysisError && (
            <Alert variant="destructive" className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Audit Failed</AlertTitle>
              <AlertDescription>{analysisError}</AlertDescription>
            </Alert>
          )}

          {analysisResult && (
            <div className="mt-6 space-y-6 animate-in fade-in-50">
                {getIssueCount(analysisResult) === 0 ? (
                     <Alert variant="default" className="border-green-500 text-green-700">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <AlertTitle>No Issues Found</AlertTitle>
                        <AlertDescription>The data integrity audit completed successfully. Everything looks clean!</AlertDescription>
                    </Alert>
                ) : (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>{getIssueCount(analysisResult)} Potential Issues Found</AlertTitle>
                        <AlertDescription>Review the details below. These issues may affect reporting accuracy.</AlertDescription>
                    </Alert>
                )}

              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                    <Users className="h-6 w-6 text-accent" />
                    <CardTitle>User Overview</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">{analysisResult.userCount}</p>
                        <p className="text-sm text-muted-foreground">Total registered users</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                    <Link2Off className="h-6 w-6 text-destructive" />
                    <CardTitle>Orphaned Records</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">{analysisResult.orphanedIncomeRecords.length + analysisResult.orphanedExpenseRecords.length}</p>
                        <p className="text-sm text-muted-foreground">Transactions linked to deleted accounts or sources.</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                    <HelpCircle className="h-6 w-6 text-amber-600" />
                    <CardTitle>Uncategorized Items</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">{analysisResult.uncategorizedIncome.length + analysisResult.uncategorizedExpenses.length}</p>
                         <p className="text-sm text-muted-foreground">Transactions missing a category.</p>
                    </CardContent>
                </Card>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
