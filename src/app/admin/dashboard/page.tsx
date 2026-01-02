
"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldCheck, BrainCircuit, Loader2, AlertTriangle, Sparkles, Wand2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { collection, query, where, Timestamp } from 'firebase/firestore';
import { sub } from 'date-fns';
import { identifyFinancialTrends } from '@/ai/flows/identify-financial-trends';
import type { IncomeRecord, ExpenseRecord } from '@/types';
import type { IdentifyFinancialTrendsOutput } from '@/ai/flows/identify-financial-trends';

const incomeConverter = {
    fromFirestore: (snapshot: any): IncomeRecord => {
        const data = snapshot.data();
        return { id: snapshot.id, ...data, date: (data.date as Timestamp).toDate() } as IncomeRecord;
    },
    toFirestore: (record: IncomeRecord) => record,
}
const expenseConverter = {
    fromFirestore: (snapshot: any): ExpenseRecord => {
        const data = snapshot.data();
        return { id: snapshot.id, ...data, date: (data.date as Timestamp).toDate() } as ExpenseRecord;
    },
    toFirestore: (record: ExpenseRecord) => record,
}


export default function AdminDashboardPage() {
  const [analysisResult, setAnalysisResult] = useState<IdentifyFinancialTrendsOutput | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Data hooks for the last 12 months
  const oneYearAgo = sub(new Date(), { years: 1 });
  const incomeQuery = useMemo(() => query(collection(db, 'income_records'), where('date', '>=', oneYearAgo)).withConverter(incomeConverter), []);
  const expenseQuery = useMemo(() => query(collection(db, 'expense_records'), where('date', '>=', oneYearAgo)).withConverter(expenseConverter), []);

  const [incomeRecords, loadingIncome, errorIncome] = useCollectionData(incomeQuery);
  const [expenseRecords, loadingExpenses, errorExpenses] = useCollectionData(expenseQuery);
  
  const isLoadingData = loadingIncome || loadingExpenses;
  const dataError = errorIncome || errorExpenses;

  const handleRunAnalysis = async () => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisResult(null);

    if (dataError) {
        setAnalysisError(`Failed to load data: ${dataError.message}`);
        setIsAnalyzing(false);
        return;
    }
    
    if (!incomeRecords || !expenseRecords) {
        setAnalysisError("Financial records are not loaded yet. Please wait a moment and try again.");
        setIsAnalyzing(false);
        return;
    }
    
    try {
        const result = await identifyFinancialTrends({
            incomeRecords: incomeRecords,
            expenseRecords: expenseRecords,
        });
        setAnalysisResult(result);
    } catch (error: any) {
        console.error("AI Analysis Error:", error);
        setAnalysisError(error.message || "An unknown error occurred during analysis. Check the console for details.");
    } finally {
        setIsAnalyzing(false);
    }
  };

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
            oversee system-wide settings and financial analysis.
          </p>
        </CardContent>
      </Card>
      
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3">
            <BrainCircuit className="h-8 w-8 text-primary" />
            <div>
              <CardTitle>AI-Powered Financial Analysis</CardTitle>
              <CardDescription>Generate insights and recommendations based on the last 12 months of financial data.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button onClick={handleRunAnalysis} disabled={isAnalyzing || isLoadingData}>
            {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {isAnalyzing ? 'Analyzing...' : isLoadingData ? 'Loading Data...' : 'Analyze Financial Health'}
          </Button>

          {analysisError && (
            <Alert variant="destructive" className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Analysis Failed</AlertTitle>
              <AlertDescription>{analysisError}</AlertDescription>
            </Alert>
          )}
          
          {analysisResult && (
            <div className="mt-6 space-y-6 animate-in fade-in-50">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg"><Wand2 className="h-5 w-5 text-accent"/> Key Trends</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm">{analysisResult.trends}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="h-5 w-5 text-accent"/> Actionable Insights</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm">{analysisResult.insights}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5 text-accent"/> Strategic Recommendations</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm">{analysisResult.recommendations}</p>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
