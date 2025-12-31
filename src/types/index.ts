
import type { Timestamp } from 'firebase/firestore';
import { z } from 'zod';

// Schema for the income source form (used for creating budgeted income items)
export const incomeSourceSchema = z.object({
  code: z.string().min(1, { message: "Transaction code is required." }),
  transactionName: z.string().min(1, { message: "Transaction name is required." }),
  category: z.enum(["Offering", "Tithe", "Donation", "Other"], { required_error: "Category is required." }),
  accountId: z.string().min(1, { message: "Account is required." }),
  description: z.string().optional(),
  // For non-Tithe items, this will be the budget. For Tithes, it's the actual amount.
  amount: z.coerce.number().min(0, { message: "Amount or Budget must be zero or more." }),
  memberName: z.string().optional(),
}).refine(data => data.category !== "Tithe" || (data.category === "Tithe" && data.memberName && data.memberName.length > 0), {
  message: "Member name is required for tithes.",
  path: ["memberName"],
});
export type IncomeSourceFormValues = z.infer<typeof incomeSourceSchema>;

// For data coming from Firestore (Income Source)
export interface IncomeSourceFirestore {
  id: string;
  code: string;
  transactionName: string;
  category: IncomeCategory;
  accountId?: string;
  description?: string;
  budget?: number; // Legacy field for 2025 budget
  budgets?: Record<string, number>; // New multi-year budget map
  recordedByUserId: string;
  createdAt: Timestamp;
}

// For client-side display (Income Source)
export interface IncomeSource {
  id: string;
  code: string;
  transactionName: string;
  category: IncomeCategory;
  accountId?: string;
  description?: string;
  budget?: number; // Legacy field
  budgets?: Record<string, number>; // New map
  createdAt?: Date;
  recordedByUserId?: string;
}


// Tithes are now a special type of direct transaction within the income system.
// The existing IncomeRecord can represent a tithe transaction directly.
export type IncomeCategory = "Offering" | "Tithe" | "Donation" | "Other";

export const incomeSchema = z.object({
  code: z.string().min(1, { message: "Transaction code is required." }),
  transactionName: z.string().min(1, { message: "Transaction name is required." }),
  date: z.date({ required_error: "Date is required." }),
  category: z.enum(["Offering", "Tithe", "Donation", "Other"], { required_error: "Category is required." }),
  amount: z.coerce.number().positive({ message: "Amount must be positive." }),
  accountId: z.string().min(1, { message: "Account is required." }),
  description: z.string().optional(),
  memberName: z.string().optional(),
});
export type IncomeFormValues = z.infer<typeof incomeSchema>;


// This now represents a single transaction record (for tithes or for transactions under an income source)
export interface IncomeRecordFirestore {
  id: string;
  code: string;
  transactionName: string;
  date: Timestamp;
  category: IncomeCategory;
  amount: number;
  description?: string;
  memberName?: string;
  recordedByUserId: string;
  createdAt: Timestamp;
  accountId?: string;
  incomeSourceId?: string; // Links transaction to a budgeted income source
}

export interface IncomeRecord {
  id: string;
  code: string;
  transactionName: string;
  date: Date;
  category: IncomeCategory;
  amount: number;
  description?: string;
  memberName?: string;
  recordedByUserId?: string;
  createdAt?: Date;
  accountId?: string;
  incomeSourceId?: string; // Links transaction to a budgeted income source
}

// Member Management
export const memberSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters."),
});
export type MemberFormValues = z.infer<typeof memberSchema>;

export interface Member {
  id: string;
  fullName: string;
  createdAt: Date;
  recordedByUserId: string;
}

export interface MemberFirestore {
  fullName: string;
  createdAt: Timestamp;
  recordedByUserId: string;
}


// Expense Management Types
export type ExpenseCategory =
  | "Utilities"
  | "Ministry Supplies"
  | "Salaries & Stipends"
  | "Rent/Mortgage"
  | "Outreach & Evangelism"
  | "Maintenance & Repairs"
  | "Administrative Costs"
  | "Events & Programs"
  | "Transportation"
  | "Other";

export const expenseCategories: ExpenseCategory[] = [
  "Utilities",
  "Ministry Supplies",
  "Salaries & Stipends",
  "Rent/Mortgage",
  "Outreach & Evangelism",
  "Maintenance & Repairs",
  "Administrative Costs",
  "Events & Programs",
  "Transportation",
  "Other"
];

// Schema for creating budgeted expense sources
export const expenseSourceSchema = z.object({
  code: z.string().min(1, { message: "Code is required." }),
  expenseName: z.string().min(1, { message: "Expense name is required." }),
  category: z.enum(expenseCategories as [ExpenseCategory, ...ExpenseCategory[]], { required_error: "Category is required." }),
  accountId: z.string().min(1, { message: "Account is required." }),
  budget: z.coerce.number().min(0, { message: "Budget must be zero or more." }),
  description: z.string().optional(),
});
export type ExpenseSourceFormValues = z.infer<typeof expenseSourceSchema>;


// For data stored in Firestore (Expense Source)
export interface ExpenseSourceFirestore {
  id: string;
  code: string;
  expenseName: string;
  category: ExpenseCategory;
  accountId?: string;
  description?: string;
  budget?: number; // Legacy field for 2025
  budgets?: Record<string, number>; // New multi-year budget map
  recordedByUserId: string;
  createdAt: Timestamp;
}

// For client-side display (Expense Source)
export interface ExpenseSource {
  id: string;
  code: string;
  expenseName: string;
  category: ExpenseCategory;
  accountId?: string;
  description?: string;
  budget?: number; // Legacy field
  budgets?: Record<string, number>; // New map
  createdAt?: Date;
  recordedByUserId?: string;
}

// For Expense transaction validation
export const expenseRecordSchema = z.object({
  code: z.string().min(1, { message: "Transaction code is required." }),
  expenseName: z.string().min(1, { message: "Transaction name is required." }),
  date: z.date({ required_error: "Date is required." }),
  amount: z.coerce.number().positive({ message: "Amount must be positive." }),
  payee: z.string().optional(),
  paymentMethod: z.string().optional(),
  description: z.string().optional(),
});
export type ExpenseRecordFormValues = z.infer<typeof expenseRecordSchema>;


// For individual expense transactions in Firestore
export interface ExpenseRecordFirestore {
  id: string;
  code: string;
  expenseName: string;
  date: Timestamp;
  category: ExpenseCategory; // Inherited from source
  amount: number;
  payee?: string;
  paymentMethod?: string;
  description?: string;
  recordedByUserId: string;
  createdAt: Timestamp;
  accountId?: string; // Inherited from source
  expenseSourceId?: string; // Links back to the budgeted source
}

// For client-side display of individual expense transactions
export interface ExpenseRecord {
  id: string;
  code: string;
  expenseName: string;
  date: Date;
  category: ExpenseCategory;
  amount: number;
  payee?: string;
  paymentMethod?: string;
  description?: string;
  recordedByUserId?: string;
  createdAt?: Date;
  accountId?: string;
  expenseSourceId?: string;
}


export interface FinancialSummary {
  totalOfferings: number;
  totalTithes: number;
  otherIncome: number;
  totalIncome: number;
}

// AI Report related types (mirroring genkit flow outputs for clarity)
export interface FinancialTrendsOutput {
  trends: string;
  insights: string;
  recommendations: string;
}

export interface QuarterlyReportOutput {
  reportSummary: string;
}

// Activity Log Types
export type ActivityLogAction =
  | "CREATE_INCOME_SOURCE"
  | "UPDATE_INCOME_SOURCE"
  | "DELETE_INCOME_SOURCE"
  | "CREATE_INCOME_TRANSACTION"
  | "UPDATE_INCOME_TRANSACTION"
  | "DELETE_INCOME_TRANSACTION"
  | "CREATE_INCOME_RECORD"
  | "UPDATE_INCOME_RECORD"
  | "DELETE_INCOME_RECORD"
  | "CREATE_EXPENSE_SOURCE"
  | "UPDATE_EXPENSE_SOURCE"
  | "DELETE_EXPENSE_SOURCE"
  | "CREATE_EXPENSE_TRANSACTION"
  | "UPDATE_EXPENSE_TRANSACTION"
  | "DELETE_EXPENSE_TRANSACTION"
  | "USER_LOGIN"
  | "USER_LOGOUT"
  | "USER_SIGNUP"
  | "UPDATE_PROFILE"
  | "CHANGE_PASSWORD"
  | "CREATE_ACCOUNT"
  | "UPDATE_ACCOUNT"
  | "DELETE_ACCOUNT"
  | "SET_BUDGET"
  | "CREATE_MEMBER"
  | "UPDATE_MEMBER"
  | "DELETE_MEMBER";

export interface ActivityLogRecord {
  id: string;
  userId: string;
  userEmail: string; // Store user email at time of logging
  action: ActivityLogAction;
  timestamp: Date;
  details?: string; // e.g., "Record ID: xyz123 for Tithe"
  collectionName?: string; // e.g., 'income_records', 'tithe_records'
  recordId?: string; // The ID of the document that was affected
}

export interface ActivityLogRecordFirestore {
  id: string;
  userId: string;
  userEmail: string;
  action: ActivityLogAction;
  timestamp: Timestamp;
  details?: string;
  collectionName?: string;
  recordId?: string;
}

// User Profile Types
export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  createdAt?: Date;
}

export interface UserProfileFirestore {
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  createdAt: Timestamp;
}

// Chart of Accounts Types
export const accountTypes = ["Income", "Expense", "Assets", "Liability", "Balance"] as const;
export type AccountType = typeof accountTypes[number];

export const accountSchema = z.object({
  code: z.string().min(1, "Account code is required."),
  name: z.string().min(2, "Account name must be at least 2 characters."),
  type: z.enum(accountTypes, { required_error: "Account type is required." }),
});
export type AccountFormValues = z.infer<typeof accountSchema>;

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  // Budgets stored as a map of year to amount, e.g., { '2024': 100000, '2025': 120000 }
  budgets?: Record<string, number>;
  createdAt?: Date;
  recordedByUserId: string;
}

export interface AccountFirestore {
  code: string;
  name: string;
  type: AccountType;
  budgets?: Record<string, number>;
  createdAt: Timestamp;
  recordedByUserId: string;
}
