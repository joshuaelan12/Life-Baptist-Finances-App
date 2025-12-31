
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

export const downloadCsv = (data: any[], reportTitle: string) => {
    if (data.length === 0) {
        alert("No data to download.");
        return;
    }

    const ws = utils.json_to_sheet(data);
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

const formatCurrency = (val: number | null | undefined) => {
    if (typeof val !== 'number') return 'N/A';
    return val.toLocaleString('fr-CM', { style: 'currency', currency: 'XAF', minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

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
                     body.push([{ content: type.toUpperCase(), colSpan: 5, styles: { fontStyle: 'bold', fillColor: '#e2e8f0', textColor: '#1e293b' } }]);
                     
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
                             { content: `${account.code} - ${account.name}`, styles: { fontStyle: 'bold' } },
                             account.type,
                             { content: formatCurrency(accountBudget), styles: { halign: 'right' } },
                             { content: formatCurrency(accountRealized), styles: { halign: 'right' } },
                             { content: `${accountPercentage.toFixed(1)}%`, styles: { halign: 'right' } }
                         ]);

                         const sources = type === 'Income' ? relevantIncomeSources : relevantExpenseSources;

                         sources.forEach(source => {
                             const sourceBudget = source.budget || 0;
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

                             // Add sub-table for transactions
                             if (records.length > 0) {
                                 const subTableBody = records.map(tx => [
                                     format(tx.date, 'dd/MM/yy'),
                                     (tx as IncomeRecord).transactionName || (tx as ExpenseRecord).expenseName,
                                     ('memberName' in tx) ? tx.memberName : ('payee' in tx) ? tx.payee : 'N/A',
                                     formatCurrency(tx.amount)
                                 ]);
                                 const subTable = {
                                     head: [['Date', 'Description', 'Member/Payee', 'Amount']],
                                     body: subTableBody,
                                     theme: 'grid' as const,
                                     styles: { fontSize: 8, cellPadding: 1.5 },
                                     headStyles: { fillColor: '#f8fafc', textColor: '#475569', fontStyle: 'bold' as const, lineWidth: 0.1 },
                                     columnStyles: { 3: { halign: 'right' as const } }
                                 };
                                 body.push([{
                                     content: '',
                                     _subTable: subTable,
                                     colSpan: 5
                                 }]);
                             }
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

    // Set title
    doc.setFontSize(18);
    doc.text("Life Baptist Church Mutengene", doc.internal.pageSize.getWidth() / 2, 30, { align: 'center' });
    doc.setFontSize(12);
    doc.setTextColor(100);

    const subTitle = reportType === 'budget_vs_actuals'
        ? `Budget vs. Actuals Report ${options.periodString || ''}`
        : reportTitle;
    doc.text(subTitle, doc.internal.pageSize.getWidth() / 2, 45, { align: 'center' });

    
    const isHierarchicalReport = reportType === 'budget_vs_actuals' || reportType === 'balance_sheet';

    if (isHierarchicalReport) {
        let finalY = 60;
        body.forEach((row, index) => {
             // Check if it's a sub-table placeholder
            if (row[0] && row[0]._subTable) {
                const subTableData = row[0]._subTable;
                doc.autoTable({
                    ...subTableData,
                    startY: finalY,
                    margin: { left: 45 }, // Indent sub-table
                    tableWidth: doc.internal.pageSize.getWidth() - 80,
                });
                finalY = (doc as any).lastAutoTable.finalY + 5;
            } 
            // Check if it's a section header
            else if (row[0] && row[0].colSpan === 5) {
                 doc.autoTable({
                    body: [row],
                    startY: finalY,
                    theme: 'plain',
                    styles: { fontSize: 11, fontStyle: 'bold' }
                 });
                 finalY = (doc as any).lastAutoTable.finalY;
            }
            // Regular rows for the main table
            else {
                const isMainAccount = row[0].content && row[0].styles?.fontStyle === 'bold';
                doc.autoTable({
                    head: index === 0 ? headers : [], // Show headers only once
                    body: [row],
                    startY: finalY,
                    theme: isMainAccount ? 'striped' : 'grid',
                    headStyles: { fillColor: [52, 111, 79], fontSize: 10 },
                    styles: { 
                        fontSize: 9, 
                        cellPadding: 3,
                        lineWidth: isMainAccount ? {top: 0.5, right: 0.5, bottom: 0, left: 0.5} : 0.1,
                        lineColor: isMainAccount ? '#333' : '#ccc'
                    },
                    alternateRowStyles: { fillColor: [247, 242, 237] },
                });
                finalY = (doc as any).lastAutoTable.finalY;
            }
        });

    } else {
        doc.autoTable({
            head: headers,
            body: body.filter(row => !row[0]?._subTable),
            startY: 55,
            headStyles: { fillColor: [52, 111, 79], fontSize: 10 },
            styles: { fontSize: 9, cellPadding: 2.5 },
            alternateRowStyles: { fillColor: [247, 242, 237] },
        });
    }


    let finalYpos = (doc as any).lastAutoTable.finalY || 55;

    if (total !== undefined) {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(
            `Total: ${formatCurrency(total)}`,
            doc.internal.pageSize.getWidth() - 20,
            finalYpos + 20,
            { align: 'right' }
        );
    }


    doc.save(fileName);
};

    