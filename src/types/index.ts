
import type { Timestamp } from 'firebase/firestore';
import { z } from 'zod';

// For TithesPage form - DEPRECATED but kept for reference during transition
export const titheSchema = z.object({
  date: z.date({ required_error: "Date is required." }),
  amount: z.coerce.number().positive({ message: "Amount must be positive." }),
  memberId: z.string().min(1, "A member must be selected."),
});
export type TitheFormValues = z.infer<typeof titheSchema>;


export type IncomeCategory = "Offering" | "Tithe" | "Donation" | "Other";

// Schema for the income form (used for both creation and editing)
export const incomeSchema = z.object({
  code: z.string().min(1, { message: "Transaction code is required." }),
  transactionName: z.string().min(1, { message: "Transaction name is required." }),
  date: z.date({ required_error: "Date is required." }),
  category: z.enum(["Offering", "Tithe", "Donation", "Other"], { required_error: "Category is required." }),
  amount: z.coerce.number().positive({ message: "Amount must be positive." }),
  accountId: z.string().min(1, { message: "Account is required." }),
  description: z.string().optional(),
  memberName: z.string().optional(),
}).refine(data => data.category !== "Tithe" || (data.category === "Tithe" && data.memberName && data.memberName.length > 0), {
  message: "Member name is required for tithes.",
  path: ["memberName"],
});

export type IncomeFormValues = z.infer<typeof incomeSchema>;


// For data coming from Firestore
export interface IncomeRecordFirestore {
  id: string;
  code: string;
  transactionName: string;
  date: Timestamp; // Firestore Timestamp
  category: IncomeCategory;
  amount: number;
  description?: string;
  memberName?: string;
  recordedByUserId: string;
  createdAt: Timestamp; // Firestore Timestamp
  accountId?: string;
}

// For client-side form and display
export interface IncomeRecord {
  id: string;
  code: string;
  transactionName: string;
  date: Date; // JavaScript Date object
  category: IncomeCategory;
  amount: number;
  description?: string;
  memberName?: string;
  recordedByUserId?: string; // Optional on client until save
  createdAt?: Date; // Optional on client until save
  accountId?: string;
}


// TitheRecord types are now deprecated in favor of IncomeRecord with "Tithe" category
export interface TitheRecord {
  id:string;
  memberId: string;
  memberName: string;
  date: Date; // JavaScript Date object
  amount: number;
  recordedByUserId?: string;
  createdAt?: Date;
}

export interface TitheRecordFirestore {
  id:string;
  memberId: string;
  memberName: string;
  date: Timestamp;
  amount: number;
  recordedByUserId: string;
  createdAt: Timestamp;
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

// For Expense Page Form validation
export const expenseSchema = z.object({
  code: z.string().min(1, { message: "Transaction code is required." }),
  date: z.date({ required_error: "Date is required." }),
  category: z.enum(expenseCategories as [ExpenseCategory, ...ExpenseCategory[]], { required_error: "Category is required." }),
  amount: z.coerce.number().positive({ message: "Amount must be positive." }),
  description: z.string().optional(),
  payee: z.string().optional(),
  paymentMethod: z.string().optional(),
  accountId: z.string().min(1, { message: "Account is required." }),
});

export type ExpenseFormValues = z.infer<typeof expenseSchema>;

// For data stored in Firestore
export interface ExpenseRecordFirestore {
  id: string;
  code: string;
  date: Timestamp;
  category: ExpenseCategory;
  amount: number;
  description?: string;
  payee?: string;
  paymentMethod?: string;
  recordedByUserId: string;
  createdAt: Timestamp;
  accountId?: string;
}

// For client-side display and manipulation
export interface ExpenseRecord {
  id: string;
  code: string;
  date: Date;
  category: ExpenseCategory;
  amount: number;
  description?: string;
  payee?: string;
  paymentMethod?: string;
  recordedByUserId: string;
  createdAt?: Date;
  accountId?: string;
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
  | "CREATE_INCOME_RECORD"
  | "UPDATE_INCOME_RECORD"
  | "DELETE_INCOME_RECORD"
  | "CREATE_EXPENSE_RECORD"
  | "UPDATE_EXPENSE_RECORD"
  | "DELETE_EXPENSE_RECORD"
  | "CREATE_TITHE_RECORD"
  | "UPDATE_TITHE_RECORD"
  | "DELETE_TITHE_RECORD"
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

    