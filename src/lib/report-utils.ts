
import { format } from 'date-fns';
import { utils, writeFile } from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { UserOptions } from 'jspdf-autotable';
import type { AccountType, IncomeRecord, ExpenseRecord, Account } from '@/types';

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
            const { incomeRecords = [], expenseRecords = [], startDate, endDate } = options;

            const realizedAmounts: Record<string, number> = {};
            const accountTransactions: Record<string, (IncomeRecord | ExpenseRecord)[]> = {};

             const filterAndProcess = (records: (IncomeRecord | ExpenseRecord)[]) => {
                records.filter(r => r.accountId && startDate && endDate && r.date >= startDate && r.date <= endDate)
                .forEach(r => {
                    realizedAmounts[r.accountId!] = (realizedAmounts[r.accountId!] || 0) + r.amount;
                    if (!accountTransactions[r.accountId!]) {
                        accountTransactions[r.accountId!] = [];
                    }
                    accountTransactions[r.accountId!].push(r);
                });
            };

            filterAndProcess(incomeRecords);
            filterAndProcess(expenseRecords);
            
            headers.push(['A/C#', 'A/C NAME', `Budget for ${options.budgetYear}`, `Realized: ${options.periodString}`, '% Realized']);

            const grouped: Record<string, any[]> = {};
            accounts.forEach(d => {
                if (!grouped[d.type]) grouped[d.type] = [];
                grouped[d.type].push(d);
            });

            typeOrder.forEach(type => {
                if (grouped[type]) {
                    body.push([{ content: type.toUpperCase(), colSpan: 5, styles: { fontStyle: 'bold', fillColor: '#e2e8f0', textColor: '#1e293b' } }]);
                    grouped[type].forEach(account => {
                        const budget = account.budgets?.[options.budgetYear || ''] || 0;
                        const realized = realizedAmounts[account.id] || 0;
                        const percentage = budget > 0 ? (realized / budget) * 100 : 0;
                        body.push([
                            account.code,
                            account.name,
                            formatCurrency(budget),
                            formatCurrency(realized),
                            `${percentage.toFixed(1)}%`
                        ]);

                        // Add sub-table for transactions
                        const transactions = accountTransactions[account.id];
                        if (transactions && transactions.length > 0) {
                            const subTableBody = transactions.map(tx => {
                                const isIncome = 'memberName' in tx || tx.category === 'Tithe' || tx.category === 'Donation' || tx.category === 'Offering';
                                return [
                                    '', // Indent
                                    format(tx.date, 'dd/MM/yy'),
                                    (tx as IncomeRecord).transactionName || (tx as ExpenseRecord).expenseName || 'N/A',
                                    isIncome ? 'Income' : 'Expense',
                                    formatCurrency(tx.amount)
                                ];
                            });

                            const subTable = {
                                head: [['', 'Date', 'Description', 'Type', 'Amount']],
                                body: subTableBody,
                                theme: 'grid' as const,
                                styles: { fontSize: 8, cellPadding: 1.5, halign: 'right' as const },
                                headStyles: { fillColor: '#f8fafc', textColor: '#475569', fontStyle: 'bold' as const, lineWidth: 0.1 },
                                columnStyles: {
                                    0: { cellWidth: 10 },
                                    1: { halign: 'left' as const },
                                    2: { halign: 'left' as const },
                                    3: { halign: 'left' as const },
                                }
                            };
                             body.push([{
                                content: '', // This row will be replaced by autoTable in downloadPdf
                                _subTable: subTable, // Custom property to carry sub-table data
                                colSpan: 5
                            }]);
                        }
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

    const doc = new jsPDF() as jsPDFWithAutoTable;
    const { headers, body, total } = getHeadersAndRows(data, reportType, options);
    const fileName = `${reportTitle.replace(/[\s/]/g, '_')}.pdf`;

    // Set title
    doc.setFontSize(18);
    doc.text("Life Baptist Church Mutengene", 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    
    // For budget report, the title is dynamic
    if (reportType === 'budget_vs_actuals') {
        const title = `Financial Report from ${options.periodString || 'start to end'}`;
        doc.text(title, 14, 30);
    } else {
        doc.text(reportTitle, 14, 30);
    }

    let finalY = (doc as any).lastAutoTable.finalY || 35;

    const isDetailedReport = reportType === 'budget_vs_actuals' || reportType === 'balance_sheet';

    doc.autoTable({
        head: headers,
        body: body.filter(row => !row[0]?._subTable), // Filter out sub-table placeholder rows
        startY: 35,
        headStyles: {
            fillColor: [52, 111, 79], // #346F4F - Primary Theme Color
            fontSize: 10,
        },
        styles: {
            fontSize: 9,
            cellPadding: 2.5,
        },
        alternateRowStyles: {
            fillColor: [247, 242, 237] // #F7F2ED - Card Color
        },
        // This is the magic part for hierarchical reports
        didDrawCell: (hookData) => {
            if (isDetailedReport && hookData.section === 'body') {
                 const row = body[hookData.row.index];
                 const subTableData = row[0]?._subTable;
                 if (subTableData) {
                    doc.autoTable({
                        ...subTableData,
                        startY: hookData.cell.y + hookData.cell.height,
                        margin: { left: hookData.cell.x + hookData.cell.padding('left') }
                    });
                 }
            }
        },
        didDrawPage: (data) => {
            finalY = data.cursor?.y ?? 35;
        }
    });

    finalY = (doc as any).lastAutoTable.finalY;

    if (total !== undefined) {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(
            `Total: ${formatCurrency(total)}`,
            14,
            finalY + 10
        );
    }


    doc.save(fileName);
};
