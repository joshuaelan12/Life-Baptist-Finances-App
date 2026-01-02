
"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldCheck, BrainCircuit, Lightbulb, TrendingUp, Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import { identifyFinancialTrends, IdentifyFinancialTrendsOutput } from '@/ai/flows/identify-financial-trends';
import { db } from '@/lib/firebase';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { collection, query, where, Timestamp } from 'firebase/firestore';
import { subYears } from 'date-fns';
import type { IncomeRecord, ExpenseRecord } from '@/types';


export default function AdminDashboardPage() {
  const [analysisResult, setAnalysisResult] = useState<IdentifyFinancialTrendsOutput | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const oneYearAgo = useMemo(() => subYears(new Date(), 1), []);

  const incomeQuery = useMemo(() => query(collection(db, 'income_records'), where('date', '>=', Timestamp.fromDate(oneYearAgo))), [oneYearAgo]);
  const [incomeRecords, loadingIncome, errorIncome] = useCollectionData(incomeQuery);
  
  const expenseQuery = useMemo(() => query(collection(db, 'expense_records'), where('date', '>=', Timestamp.fromDate(oneYearAgo))), [oneYearAgo]);
  const [expenseRecords, loadingExpenses, errorExpenses] = useCollectionData(expenseQuery);


  const handleAnalyzeFinances = async () => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisResult(null);

    try {
      if (errorIncome || errorExpenses) {
        throw new Error(errorIncome?.message || errorExpenses?.message || "Could not fetch financial data.");
      }
      
      if (!incomeRecords || !expenseRecords) {
        throw new Error("Financial data is not loaded yet.");
      }

      const financialData = {
        income: incomeRecords.map(r => ({...r, date: (r.date as any).toDate()})),
        expenses: expenseRecords.map(r => ({...r, date: (r.date as any).toDate()})),
      };

      const result = await identifyFinancialTrends({ financialData: JSON.stringify(financialData) });
      setAnalysisResult(result);

    } catch (error: any) {
      console.error("AI Analysis Error:", error);
      setAnalysisError(error.message || "An unknown error occurred during analysis.");
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
            You have successfully accessed the admin area. From here, you will be able to manage users,
            oversee system-wide settings, and view comprehensive analytics.
          </p>
        </CardContent>
      </Card>
      
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3">
            <BrainCircuit className="h-8 w-8 text-primary" />
            <div>
              <CardTitle>AI-Powered Financial Analysis</CardTitle>
              <CardDescription>Generate strategic insights from the last 12 months of financial data.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button onClick={handleAnalyzeFinances} disabled={isAnalyzing || loadingIncome || loadingExpenses}>
            {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {isAnalyzing ? 'Analyzing Data...' : 'Analyze Financial Health'}
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
                <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                  <TrendingUp className="h-6 w-6 text-accent" />
                  <CardTitle>Key Trends</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{analysisResult.trends}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                  <Lightbulb className="h-6 w-6 text-accent" />
                  <CardTitle>Actionable Insights</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{analysisResult.insights}</p>
                </CardContent>
              </Card>

               <Card>
                <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                  <Sparkles className="h-6 w-6 text-accent" />
                  <CardTitle>Strategic Recommendations</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{analysisResult.recommendations}</p>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
