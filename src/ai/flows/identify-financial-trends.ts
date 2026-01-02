
'use server';
/**
 * @fileOverview An AI flow to identify financial trends and provide recommendations.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'zod';
import {
  type IncomeRecord,
  type ExpenseRecord,
} from '@/types';


const FinancialAnalysisInputSchema = z.object({
  incomeRecords: z.array(z.any()).describe("List of all income records for the period."),
  expenseRecords: z.array(z.any()).describe("List of all expense records for the period."),
});

const FinancialAnalysisOutputSchema = z.object({
  trends: z.string().describe("Key financial trends observed from the data, formatted as a bulleted list."),
  insights: z.string().describe("Actionable insights derived from the trends, formatted as a bulleted list."),
  recommendations: z.string().describe("Strategic recommendations for better financial control, formatted as a bulleted list."),
});

export type IdentifyFinancialTrendsInput = z.infer<typeof FinancialAnalysisInputSchema>;
export type IdentifyFinancialTrendsOutput = z.infer<typeof FinancialAnalysisOutputSchema>;

export async function identifyFinancialTrends(input: IdentifyFinancialTrendsInput): Promise<IdentifyFinancialTrendsOutput> {
  return identifyFinancialTrendsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'financialAnalystPrompt',
  model: googleAI('gemini-pro'),
  input: { schema: FinancialAnalysisInputSchema },
  output: { schema: FinancialAnalysisOutputSchema },
  prompt: `You are an expert financial analyst for a church. Analyze the provided income and expense records.
  
  The data is provided as two JSON arrays: 'incomeRecords' and 'expenseRecords'.
  
  Based on this data, provide:
  1.  **Key Trends**: Identify the most significant financial trends (e.g., "Income from donations has increased by 20% in the last quarter," "Utility expenses are consistently high"). Use bullet points.
  2.  **Actionable Insights**: Explain what these trends mean in a practical sense (e.g., "The increase in donations corresponds with the recent community outreach event, indicating a positive impact," "High utility costs suggest a need for an energy audit"). Use bullet points.
  3.  **Strategic Recommendations**: Suggest concrete actions for better financial control (e.g., "Consider creating a dedicated budget for 'Outreach Events' to track ROI," "Recommend negotiating a new electricity tariff or installing energy-saving light bulbs"). Use bullet points.
  
  Income Records:
  {{{jsonStringify incomeRecords}}}
  
  Expense Records:
  {{{jsonStringify expenseRecords}}}
  `,
});

const identifyFinancialTrendsFlow = ai.defineFlow(
  {
    name: 'identifyFinancialTrendsFlow',
    inputSchema: FinancialAnalysisInputSchema,
    outputSchema: FinancialAnalysisOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
