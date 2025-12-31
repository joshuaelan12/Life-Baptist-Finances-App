
import { format } from 'date-fns';
import { utils, writeFile } from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { UserOptions } from 'jspdf-autotable';
import type { AccountType, IncomeRecord, ExpenseRecord, Account, IncomeSource, ExpenseSource } from '@/types';

// Extend jsPDF with autoTable
interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: UserOptions) => jsPDF;
}

const formatCurrency = (val: number | null | undefined) => {
    if (typeof val !== 'number') return 'N/A';
    // Use en-US locale to get comma separators, but keep XAF currency
    return val.toLocaleString('en-US', { style: 'currency', currency: 'XAF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).replace('XAF', '') + ' XAF';
};

const generateHierarchicalDataForCsv = (data: any[], options: ReportOptions) => {
    const csvData: any[] = [];
    const headers = ['Type', 'Description', 'Budget', 'Realized', '% Realized', 'Date', 'Amount'];
    csvData.push(headers);

    const typeOrder: AccountType[] = ['Balance', 'Income', 'Liability', 'Assets', 'Expense'];
    const accounts = data as Account[];
    const { incomeRecords = [], expenseRecords = [], incomeSources = [], expenseSources = [], budgetYear, startDate, endDate } = options;

    const filterByDate = (records: (IncomeRecord | ExpenseRecord)[]) => {
        if (!startDate || !endDate) return records;
        return records.filter(r => r.date >= startDate && r.date <= endDate);
    };

    const filteredIncomeRecords = filterByDate(incomeRecords);
    const filteredExpenseRecords = filterByDate(expenseRecords);

    const grouped: Record<string, any[]> = {};
    accounts.forEach(d => {
        if (!grouped[d.type]) grouped[d.type] = [];
        grouped[d.type].push(d);
    });

    typeOrder.forEach(type => {
        if (grouped[type]) {
            csvData.push([type.toUpperCase()]);
            grouped[type].forEach((account: Account) => {
                const accountBudget = account.budgets?.[budgetYear || ''] || 0;
                const relevantIncomeSources = incomeSources.filter(s => s.accountId === account.id);
                const relevantExpenseSources = expenseSources.filter(s => s.accountId === account.id);
                const incomeFromDirectRecords = filteredIncomeRecords.filter(r => r.accountId === account.id && !r.incomeSourceId).reduce((sum, r) => sum + r.amount, 0);
                const expenseFromDirectRecords = filteredExpenseRecords.filter(r => r.accountId === account.id && !r.expenseSourceId).reduce((sum, r) => sum + r.amount, 0);
                const realizedFromSources = (type === 'Income' ? relevantIncomeSources : relevantExpenseSources).reduce((sum, source) => {
                    const records = type === 'Income' ? filteredIncomeRecords.filter(r => r.incomeSourceId === source.id) : filteredExpenseRecords.filter(r => r.expenseSourceId === source.id);
                    return sum + records.reduce((s, r) => s + r.amount, 0);
                }, 0);
                const accountRealized = realizedFromSources + (type === 'Income' ? incomeFromDirectRecords : -expenseFromDirectRecords);
                const accountPercentage = accountBudget > 0 ? (accountRealized / accountBudget) * 100 : 0;
                
                csvData.push([
                    'Account',
                    `${account.code} - ${account.name}`,
                    accountBudget,
                    accountRealized,
                    `${accountPercentage.toFixed(1)}%`
                ]);

                const sources = type === 'Income' ? relevantIncomeSources : relevantExpenseSources;
                sources.forEach(source => {
                    const sourceBudget = source.budgets?.[budgetYear || ''] || (source.budget || 0); // fallback for old data
                    const records = type === 'Income' ? filteredIncomeRecords.filter(r => r.incomeSourceId === source.id) : filteredExpenseRecords.filter(r => r.expenseSourceId === source.id);
                    const sourceRealized = records.reduce((sum, r) => sum + r.amount, 0);
                    const sourcePercentage = sourceBudget > 0 ? (sourceRealized / sourceBudget) * 100 : 0;

                    csvData.push([
                        'Sub-Account',
                        `  ${source.code} - ${'transactionName' in source ? source.transactionName : source.expenseName}`,
                        sourceBudget,
                        sourceRealized,
                        `${sourcePercentage.toFixed(1)}%`
                    ]);

                    records.forEach(tx => {
                         csvData.push([
                            'Transaction',
                            `    ${(tx as IncomeRecord).transactionName || (tx as ExpenseRecord).expenseName}`,
                            '',
                            '',
                            '',
                            format(tx.date, 'PP'),
                            tx.amount,
                        ]);
                    });
                });
            });
        }
    });

    return csvData;
};


export const downloadCsv = (data: any[], reportTitle: string, reportType: string, options: ReportOptions) => {
    if (data.length === 0) {
        alert("No data to download.");
        return;
    }
    
    let ws;
    if (reportType === 'budget_vs_actuals' || reportType === 'balance_sheet') {
        const hierarchicalData = generateHierarchicalDataForCsv(data, options);
        ws = utils.aoa_to_sheet(hierarchicalData);
    } else {
        const { headers, body } = getHeadersAndRows(data, reportType, options);
        const csvData = [headers[0]].concat(body);
        ws = utils.aoa_to_sheet(csvData);
    }
    
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Report");
    
    const fileName = `${reportTitle.replace(/[\s/]/g, '_')}.xlsx`;
    writeFile(wb, fileName);
};

interface ReportOptions {
    budgetYear?: number;
    periodString?: string;
    incomeRecords?: IncomeRecord[];
    expenseRecords?: ExpenseRecord[];
    incomeSources?: IncomeSource[];
    expenseSources?: ExpenseSource[];
    startDate?: Date;
    endDate?: Date;
}


const getHeadersAndRows = (data: any[], reportType: string, options: ReportOptions): { headers: string[][], rows: any[][], total?: number, body: any[] } => {
    if (data.length === 0) return { headers: [], rows: [], body: [] };

    let headers: string[][] = [];
    let rows: any[][] = [];
    let body: any[] = [];
    let total: number | undefined = undefined;


    switch(reportType) {
        case 'income':
            headers.push(['Code', 'Date', 'Category', 'Account', 'Amount', 'Member Name', 'Description']);
            body = data.map(item => [
                item.code || 'N/A',
                item.date ? format(item.date, 'PP') : 'N/A', 
                item.category || 'N/A', 
                item.accountName || 'N/A',
                formatCurrency(item.amount), 
                item.memberName || 'N/A', 
                item.description || 'N/A',
            ]);
            break;
        case 'expenses':
            headers.push(['Code', 'Date', 'Category', 'Account', 'Amount', 'Payee', 'Payment Method', 'Description']);
            body = data.map(item => [
                item.code || 'N/A',
                item.date ? format(item.date, 'PP') : 'N/A',
                item.category || 'N/A',
                item.accountName || 'N/A',
                formatCurrency(item.amount),
                item.payee || 'N/A',
                item.paymentMethod || 'N/A',
                item.description || 'N/A',
            ]);
            break;
        case 'tithes':
            headers.push(['Date', 'Member Name', 'Amount']);
            body = data.map(item => [
                item.date ? format(item.date, 'PP') : 'N/A',
                item.memberName || 'N/A',
                formatCurrency(item.amount)
            ]);
            break;
        case 'summary':
            headers.push(['Category', 'Amount']);
            body = data.map(item => [
                item.Category,
                formatCurrency(item.Amount)
            ]);
            break;
        case 'individual_tithe':
            headers.push(['Date', 'Amount']);
            body = data.map(item => [
                item.date ? format(item.date, 'PP') : 'N/A',
                formatCurrency(item.amount)
            ]);
            total = data.reduce((sum, item) => sum + item.amount, 0);
            break;
        case 'budget_vs_actuals':
        case 'balance_sheet':
             const typeOrder: AccountType[] = ['Balance', 'Income', 'Liability', 'Assets', 'Expense'];
             const accounts = data as Account[];
             const { incomeRecords = [], expenseRecords = [], incomeSources = [], expenseSources = [], startDate, endDate } = options;

             const filterByDate = (records: (IncomeRecord | ExpenseRecord)[]) => {
                if (!startDate || !endDate) return records;
                return records.filter(r => r.date >= startDate && r.date <= endDate);
             }

             const filteredIncomeRecords = filterByDate(incomeRecords);
             const filteredExpenseRecords = filterByDate(expenseRecords);

             headers.push(['A/C# / Name', 'Description / Category', `Budget for ${options.budgetYear}`, `Realized: ${options.periodString}`, '% Realized']);

             const grouped: Record<string, any[]> = {};
             accounts.forEach(d => {
                 if (!grouped[d.type]) grouped[d.type] = [];
                 grouped[d.type].push(d);
             });

             typeOrder.forEach(type => {
                 if (grouped[type]) {
                     body.push([{ content: type.toUpperCase(), colSpan: 5, styles: { fontStyle: 'bold', fillColor: '#F2EAE2', textColor: '#2A4035' } }]);
                     
                     grouped[type].forEach((account: Account) => {
                         const accountBudget = account.budgets?.[options.budgetYear || ''] || 0;
                         const relevantIncomeSources = incomeSources.filter(s => s.accountId === account.id);
                         const relevantExpenseSources = expenseSources.filter(s => s.accountId === account.id);
                         
                         const incomeFromDirectRecords = filteredIncomeRecords.filter(r => r.accountId === account.id && !r.incomeSourceId).reduce((sum, r) => sum + r.amount, 0);
                         const expenseFromDirectRecords = filteredExpenseRecords.filter(r => r.accountId === account.id && !r.expenseSourceId).reduce((sum, r) => sum + r.amount, 0);

                         const realizedFromSources = (type === 'Income' ? relevantIncomeSources : relevantExpenseSources).reduce((sum, source) => {
                            const records = type === 'Income'
                                ? filteredIncomeRecords.filter(r => r.incomeSourceId === source.id)
                                : filteredExpenseRecords.filter(r => r.expenseSourceId === source.id);
                            return sum + records.reduce((s, r) => s + r.amount, 0);
                         }, 0);

                         const accountRealized = realizedFromSources + (type === 'Income' ? incomeFromDirectRecords : -expenseFromDirectRecords);
                         const accountPercentage = accountBudget > 0 ? (accountRealized / accountBudget) * 100 : 0;
                         
                         body.push([
                             { content: `${account.code} - ${account.name}`, styles: { fontStyle: 'bold', fillColor: '#FAF5F0' } },
                             { content: account.type, styles: { fillColor: '#FAF5F0' } },
                             { content: formatCurrency(accountBudget), styles: { halign: 'right', fillColor: '#FAF5F0' } },
                             { content: formatCurrency(accountRealized), styles: { halign: 'right', fillColor: '#FAF5F0' } },
                             { content: `${accountPercentage.toFixed(1)}%`, styles: { halign: 'right', fillColor: '#FAF5F0' } }
                         ]);

                         const sources = type === 'Income' ? relevantIncomeSources : relevantExpenseSources;

                         sources.forEach(source => {
                             const sourceBudget = source.budgets?.[options.budgetYear || ''] || (source.budget || 0); // Fallback for old budget field
                             const records = type === 'Income' 
                                 ? filteredIncomeRecords.filter(r => r.incomeSourceId === source.id) 
                                 : filteredExpenseRecords.filter(r => r.expenseSourceId === source.id);
                             const sourceRealized = records.reduce((sum, r) => sum + r.amount, 0);
                             const sourcePercentage = sourceBudget > 0 ? (sourceRealized / sourceBudget) * 100 : 0;

                             body.push([
                                 { content: `  ${source.code} - ${'transactionName' in source ? source.transactionName : source.expenseName}`, styles: { cellPadding: { left: 8 } } },
                                 source.category,
                                 { content: formatCurrency(sourceBudget), styles: { halign: 'right' } },
                                 { content: formatCurrency(sourceRealized), styles: { halign: 'right' } },
                                 { content: `${sourcePercentage.toFixed(1)}%`, styles: { halign: 'right' } }
                             ]);
                         });
                     });
                 }
             });
             break;


        default:
            if (data.length > 0) {
                const sanitizedData = data.map(d => {
                    const { id, recordedByUserId, createdAt, ...rest } = d;
                    return rest;
                });
                headers.push(Object.keys(sanitizedData[0]));
                body = sanitizedData.map(item => headers[0].map(header => item[header]));
            }
            break;
    }
    return { headers, rows, total, body };
};


export const downloadPdf = (data: any[], reportTitle: string, reportType: string, options: ReportOptions = {}) => {
    if (data.length === 0) {
        alert("No data available to generate PDF.");
        return;
    }

    const doc = new jsPDF('p', 'pt', 'a4') as jsPDFWithAutoTable;
    const { headers, body, total } = getHeadersAndRows(data, reportType, options);
    const fileName = `${reportTitle.replace(/[\s/]/g, '_')}.pdf`;
    const pageWidth = doc.internal.pageSize.getWidth();

    // Add Header
    const addHeader = (pageNumber: number) => {
        if (pageNumber > 1) return;
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor('#2A4035'); // --foreground color
        doc.text("Life Baptist Church Mutengene", pageWidth / 2, 40, { align: 'center' });
        
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor('#857B70'); // --muted-foreground
        const subTitle = reportType === 'budget_vs_actuals'
            ? `Budget vs. Actuals Report ${options.periodString || ''}`
            : reportTitle;
        doc.text(subTitle, pageWidth / 2, 60, { align: 'center' });
    };

    // Add Footer
    const addFooter = () => {
        const pageCount = (doc.internal as any).getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor('#857B70');
            const footerText = `Page ${i} of ${pageCount} | Generated on: ${format(new Date(), 'PPpp')}`;
            doc.text(footerText, pageWidth / 2, doc.internal.pageSize.getHeight() - 20, { align: 'center' });
        }
    };

    const isHierarchicalReport = reportType === 'budget_vs_actuals' || reportType === 'balance_sheet';

    if (isHierarchicalReport) {
        doc.autoTable({
            head: headers,
            body: body,
            startY: 80,
            theme: 'striped',
            headStyles: { 
                fillColor: '#346F4F', // --primary
                textColor: '#F7F2ED', // --primary-foreground
                fontSize: 10,
                fontStyle: 'bold',
            },
            styles: { 
                fontSize: 9, 
                cellPadding: 4,
                lineWidth: 0.2,
                lineColor: '#DCD0C3' // --border
            },
            alternateRowStyles: { fillColor: '#FFFFFF' }, // No alternate color for this complex report
            didDrawPage: (data) => {
                addHeader(data.pageNumber);
            },
        });

    } else { // Standard reports
        doc.autoTable({
            head: headers,
            body: body.filter(row => !row[0]?._subTable),
            startY: 80,
            headStyles: { 
                fillColor: '#346F4F', // --primary
                textColor: '#F7F2ED', // --primary-foreground
                fontSize: 10,
                fontStyle: 'bold'
            },
            styles: { fontSize: 9, cellPadding: 4 },
            alternateRowStyles: { fillColor: '#FAF5F0' }, // --popover
            didDrawPage: (data) => {
                addHeader(data.pageNumber);
            }
        });
        
        if (total !== undefined) {
            let finalYpos = (doc as any).lastAutoTable.finalY || 80;
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text(
                `Total: ${formatCurrency(total)}`,
                pageWidth - 40,
                finalYpos + 25,
                { align: 'right' }
            );
        }
    }

    addFooter();
    doc.save(fileName);
};
