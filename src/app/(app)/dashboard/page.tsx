
"use client";

import React, { useMemo, useState } from 'react';
import { StatCard } from '@/components/dashboard/stat-card';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DollarSign, Users, HandCoins, Landmark, LineChart, TrendingUp, TrendingDown, Loader2, AlertTriangle, ReceiptText, Scale, Milestone } from 'lucide-react';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, LabelList } from 'recharts';
import type { ChartConfig } from '@/components/ui/chart';
import { auth, db } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { collection, query, orderBy, Timestamp, type DocumentData, type QueryDocumentSnapshot, type SnapshotOptions } from 'firebase/firestore';
import type { IncomeRecord, ExpenseRecord, IncomeRecordFirestore, ExpenseRecordFirestore } from '@/types';
import { format, subMonths, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Firestore Converters
const incomeConverter = {
  toFirestore(record: IncomeRecord): DocumentData {
    const { id, date, createdAt, recordedByUserId, ...rest } = record;
    const data: any = { ...rest, date: Timestamp.fromDate(date) };
    if (recordedByUserId) data.recordedByUserId = recordedByUserId;
    return data;
  },
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

const expenseConverter = {
  toFirestore(record: ExpenseRecord): DocumentData {
    const { id, date, createdAt, recordedByUserId, ...rest } = record;
    const data: any = { ...rest, date: Timestamp.fromDate(date) };
    if (recordedByUserId) data.recordedByUserId = recordedByUserId;
    return data;
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options: SnapshotOptions): ExpenseRecord {
    const data = snapshot.data(options) as Omit<ExpenseRecordFirestore, 'id'>;
    return {
      id: snapshot.id,
      date: data.date instanceof Timestamp ? data.date.toDate() : new Date(),
      category: data.category,
      amount: data.amount,
      description: data.description,
      payee: data.payee,
      paymentMethod: data.paymentMethod,
      recordedByUserId: data.recordedByUserId,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : undefined,
    };
  }
};


export default function DashboardPage() {
  const [authUser, authLoading, authError] = useAuthState(auth);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const incomeCollectionRef = authUser ? collection(db, 'income_records') : null;
  const incomeQuery = incomeCollectionRef 
    ? query(incomeCollectionRef, orderBy('date', 'desc')).withConverter<IncomeRecord>(incomeConverter)
    : null;
  const [incomeRecords, isLoadingIncome, errorIncome] = useCollectionData(incomeQuery);

  const expensesCollectionRef = authUser ? collection(db, 'expense_records') : null;
  const expensesQuery = expensesCollectionRef
    ? query(expensesCollectionRef, orderBy('date', 'desc')).withConverter<ExpenseRecord>(expenseConverter)
    : null;
  const [expenseRecords, isLoadingExpenses, errorExpenses] = useCollectionData(expensesQuery);


  const financialSummary = useMemo(() => {
    const yearStart = startOfYear(new Date(selectedYear, 0, 1));
    const yearEnd = endOfYear(new Date(selectedYear, 0, 1));
    const prevYearStart = startOfYear(subMonths(yearStart, 12));
    const prevYearEnd = endOfYear(subMonths(yearStart, 12));

    let totalOfferings = 0;
    let otherIncome = 0;
    let totalTithes = 0;
    let totalIncome = 0;
    let totalExpenses = 0;
    let prevYearTotalIncome = 0;
    let prevYearTotalExpenses = 0;

    incomeRecords?.forEach(record => {
      if (record.date >= yearStart && record.date <= yearEnd) {
        if (record.category === "Offering") totalOfferings += record.amount;
        else if (record.category === "Tithe") totalTithes += record.amount;
        else if (record.category === "Donation" || record.category === "Other") otherIncome += record.amount;
      }
      if (record.date >= prevYearStart && record.date <= prevYearEnd) {
        prevYearTotalIncome += record.amount;
      }
    });

    totalIncome = totalOfferings + totalTithes + otherIncome;

    expenseRecords?.forEach(record => {
       if (record.date >= yearStart && record.date <= yearEnd) {
        totalExpenses += record.amount;
      }
      if (record.date >= prevYearStart && record.date <= prevYearEnd) {
        prevYearTotalExpenses += record.amount;
      }
    });
    
    const netBalance = totalIncome - totalExpenses;
    const balanceBroughtForward = prevYearTotalIncome - prevYearTotalExpenses;

    return { totalOfferings, totalTithes, otherIncome, totalIncome, totalExpenses, netBalance, prevYearTotalIncome, balanceBroughtForward };
  }, [incomeRecords, expenseRecords, selectedYear]);

  const { totalOfferings, totalTithes, otherIncome, totalIncome, totalExpenses, netBalance, prevYearTotalIncome, balanceBroughtForward } = financialSummary;
  
  const incomeChangePercentage = totalIncome && prevYearTotalIncome
    ? ((totalIncome - prevYearTotalIncome) / prevYearTotalIncome) * 100
    : totalIncome > 0 ? Infinity : 0; // Show Infinity if there was no income last year but there is this year.

  const monthlyChartData = useMemo(() => {
    const dataForYear: { month: string; income: number; expenses: number }[] = [];
    
    for (let i = 0; i < 12; i++) {
      const targetMonthDate = new Date(selectedYear, i, 1);
      const monthName = format(targetMonthDate, "MMM");
      const monthStart = startOfMonth(targetMonthDate);
      const monthEnd = endOfMonth(targetMonthDate);

      let monthlyIncomeTotal = 0;
      incomeRecords?.forEach(record => {
        if (record.date >= monthStart && record.date <= monthEnd) {
          monthlyIncomeTotal += record.amount;
        }
      });
      
      let monthlyExpensesTotal = 0;
      expenseRecords?.forEach(record => {
        if (record.date >= monthStart && record.date <= monthEnd) {
          monthlyExpensesTotal += record.amount;
        }
      });

      dataForYear.push({
        month: monthName,
        income: monthlyIncomeTotal,
        expenses: monthlyExpensesTotal,
      });
    }
    return dataForYear;
  }, [incomeRecords, expenseRecords, selectedYear]);
  
  const incomeBreakdownData = useMemo(() => [
    { name: 'Offerings', value: totalOfferings, fill: "hsl(var(--chart-1))" },
    { name: 'Tithes', value: totalTithes, fill: "hsl(var(--chart-2))" },
    { name: 'Other', value: otherIncome, fill: "hsl(var(--chart-3))" },
  ], [totalOfferings, totalTithes, otherIncome]);

  const incomeChartConfig = {
    income: { label: "Income", color: "hsl(var(--chart-1))" },
    expenses: { label: "Expenses", color: "hsl(var(--chart-2))" },
  } satisfies ChartConfig;

  const formatCurrency = (value: number) => {
    return `${value.toLocaleString('fr-CM', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} XAF`;
  };
  
  const formatCurrencyWithDecimals = (value: number) => {
     return `${value.toLocaleString('fr-CM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} XAF`;
  };

  const pastYearOptions = Array.from({length: 5}, (_, i) => new Date().getFullYear() - i);


  if (authLoading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-100px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (authError) {
    return (
      <Alert variant="destructive" className="mt-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Authentication Error</AlertTitle>
        <AlertDescription>{authError.message}</AlertDescription>
      </Alert>
    );
  }
  
  if (!authUser) {
     return (
      <Alert variant="destructive" className="mt-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Not Authenticated</AlertTitle>
        <AlertDescription>Please log in to view the dashboard.</AlertDescription>
      </Alert>
    );
  }

  if (isLoadingIncome || isLoadingExpenses) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-100px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-2">Loading financial data...</p>
      </div>
    );
  }

  if (errorIncome || errorExpenses) {
    return (
      <Alert variant="destructive" className="mt-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error Loading Data</AlertTitle>
        <AlertDescription>
          {errorIncome?.message || errorExpenses?.message || "Could not load financial data."}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <div className="flex items-center gap-2">
            <Label htmlFor="year-select">Year:</Label>
            <Select value={String(selectedYear)} onValueChange={(val) => setSelectedYear(Number(val))}>
                <SelectTrigger className="w-[120px]" id="year-select"><SelectValue /></SelectTrigger>
                <SelectContent>{pastYearOptions.map(year => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}</SelectContent>
            </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Balance B/F"
          value={formatCurrency(balanceBroughtForward)}
          icon={Milestone}
          description={`From year ${selectedYear - 1}`}
          iconClassName={balanceBroughtForward >= 0 ? 'text-blue-500' : 'text-orange-500'}
        />
        <StatCard
          title="Total Income"
          value={formatCurrency(totalIncome)}
          icon={LineChart}
          description={
            <span className={`flex items-center ${incomeChangePercentage >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {isFinite(incomeChangePercentage) && (incomeChangePercentage >= 0 ? <TrendingUp className="h-4 w-4 mr-1" /> : <TrendingDown className="h-4 w-4 mr-1" />)}
              {isFinite(incomeChangePercentage) 
                ? `${incomeChangePercentage.toLocaleString('fr-CM', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% from last year`
                : (totalIncome > 0 ? "Up from 0 last year" : "No change")}
            </span>
          }
          iconClassName={incomeChangePercentage >= 0 ? 'text-emerald-500' : 'text-red-500'}
        />
        <StatCard
          title="Total Expenses"
          value={formatCurrency(totalExpenses)}
          icon={ReceiptText}
          description={`All recorded expenses for ${selectedYear}`}
        />
        <StatCard
          title="Net Balance"
          value={formatCurrency(netBalance)}
          icon={Scale}
          description="Income minus Expenses"
          iconClassName={netBalance >= 0 ? 'text-emerald-500' : 'text-red-500'}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-3">
        <StatCard
          title="Total Offerings"
          value={formatCurrency(totalOfferings)}
          icon={HandCoins}
          description={`Offerings received in ${selectedYear}`}
        />
        <StatCard
          title="Total Tithes"
          value={formatCurrency(totalTithes)}
          icon={Users}
          description={`Tithes from members in ${selectedYear}`}
        />
        <StatCard
          title="Other Income"
          value={formatCurrency(otherIncome)}
          icon={Landmark}
          description={`Donations, events, etc. in ${selectedYear}`}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Income vs Expenses ({selectedYear})</CardTitle>
            <CardDescription>Monthly breakdown for the selected year.</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px] p-2">
            <ChartContainer config={incomeChartConfig} className="w-full h-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChartData} margin={{ top: 20, right: 0, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis tickFormatter={(value) => `${(value / 1000).toLocaleString('fr-CM', { maximumFractionDigits: 0 })}k`} tickLine={false} axisLine={false} tickMargin={8} width={80} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" formatter={(value, name, props) => {
                     return (
                        <div className="flex flex-col">
                          <span className="text-muted-foreground">{props.payload?.month}</span>
                          <span className="font-semibold">{`${name}: ${formatCurrency(Number(value))}`}</span>
                        </div>
                     );
                  }} />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="income" fill="var(--color-income)" radius={[4, 4, 0, 0]} name="Income" />
                  <Bar dataKey="expenses" fill="var(--color-expenses)" radius={[4, 4, 0, 0]} name="Expenses"/>
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Income Breakdown ({selectedYear})</CardTitle>
            <CardDescription>Distribution of income sources for the selected year.</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px] p-2">
             <ChartContainer config={{}} className="w-full h-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={incomeBreakdownData} layout="vertical" margin={{ top: 20, right: 50, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(value) => `${(value / 1000).toLocaleString('fr-CM', { maximumFractionDigits: 0 })}k`} />
                  <YAxis dataKey="name" type="category" width={80} tickLine={false} axisLine={false} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={(value, name) => {
                     return (
                        <div className="flex flex-col">
                          <span className="font-semibold">{`${name}: ${formatCurrency(Number(value))}`}</span>
                        </div>
                     );
                  }} />} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                     <LabelList 
                       dataKey="value" 
                       position="right" 
                       formatter={(value: number) => formatCurrency(Number(value))} 
                       className="fill-foreground text-xs"
                     />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
