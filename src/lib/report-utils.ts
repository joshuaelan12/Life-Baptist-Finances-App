
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
    if (typeof val !== 'number') return '0 XAF';
    return val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' XAF';
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
    typeFilter?: AccountType[]; 
    balanceBroughtForward?: number;
}

const generateHierarchicalDataForCsv = (data: any[], options: ReportOptions, reportType: string) => {
    const csvData: any[] = [];
    const headers = ['Level', 'Code', 'Name', 'Category/Type', 'Budget', 'Realized', '% Realized'];
    csvData.push(headers);

    const typeOrder: AccountType[] = options.typeFilter || ['Balance', 'Income', 'Liability', 'Assets', 'Expense'];
    const accounts = data as Account[];
    const { incomeRecords = [], expenseRecords = [], incomeSources = [], expenseSources = [], budgetYear = new Date().getFullYear(), startDate, endDate, balanceBroughtForward = 0 } = options;

    const filterByDate = (records: (IncomeRecord | ExpenseRecord)[]) => {
        if (!startDate || !endDate) return records;
        return records.filter(r => r.date >= startDate && r.date <= endDate);
    };

    const filteredIncomeRecords = filterByDate(incomeRecords);
    const filteredExpenseRecords = filterByDate(expenseRecords);

    let grandBudgetTotal = 0;
    
    typeOrder.forEach(type => {
        const relevantAccounts = accounts.filter(acc => acc.type === type);
        if (relevantAccounts.length > 0) {
            csvData.push([type.toUpperCase()]); 
            
            // Add B/F as an adjustment line if it's Income section
            if (type === 'Income' && balanceBroughtForward !== 0) {
                csvData.push(['Adjustment', '', `Balance Brought Forward (from ${budgetYear - 1})`, 'Historical', 0, balanceBroughtForward, 'N/A']);
            }

            let typeBudgetTotal = 0;
            let typeRealizedTotal = 0; // Don't include B/F in the sub-total sum per user request

            relevantAccounts.forEach((account: Account) => {
                const accountBudget = account.budgets?.[budgetYear] || 0;
                const relevantIncomeSources = incomeSources.filter(s => s.accountId === account.id);
                const relevantExpenseSources = expenseSources.filter(s => s.accountId === account.id);
                
                const directIncomeRecords = filteredIncomeRecords.filter(r => r.accountId === account.id);
                const directExpenseRecords = filteredExpenseRecords.filter(r => r.accountId === account.id);

                let realizedFromSources = 0;
                const sources = type === 'Income' ? relevantIncomeSources : relevantExpenseSources;
                sources.forEach(source => {
                    const records = type === 'Income' 
                        ? filteredIncomeRecords.filter(r => r.incomeSourceId === source.id) 
                        : filteredExpenseRecords.filter(r => r.expenseSourceId === source.id);
                    realizedFromSources += records.reduce((s, r) => s + r.amount, 0);
                });

                const directAmount = type === 'Income' 
                    ? directIncomeRecords.filter(r => !r.incomeSourceId).reduce((sum, r) => sum + r.amount, 0)
                    : directExpenseRecords.filter(r => !r.expenseSourceId).reduce((sum, r) => sum + r.amount, 0);

                const accountRealized = realizedFromSources + directAmount;
                const accountPercentage = accountBudget > 0 ? (accountRealized / accountBudget) * 100 : 0;
                
                typeBudgetTotal += accountBudget;
                typeRealizedTotal += accountRealized;

                csvData.push([
                    'Account',
                    account.code,
                    account.name,
                    account.type,
                    accountBudget,
                    accountRealized,
                    `${accountPercentage.toFixed(1)}%`
                ]);

                sources.forEach(source => {
                    const sourceBudget = source.budgets?.[budgetYear] || (source.budget || 0);
                    const records = type === 'Income' ? filteredIncomeRecords.filter(r => r.incomeSourceId === source.id) : filteredExpenseRecords.filter(r => r.expenseSourceId === source.id);
                    const sourceRealized = records.reduce((sum, r) => sum + r.amount, 0);
                    const sourcePercentage = sourceBudget > 0 ? (sourceRealized / sourceBudget) * 100 : 0;

                    csvData.push([
                        '  Sub-Account',
                        source.code,
                        'transactionName' in source ? source.transactionName : source.expenseName,
                        source.category,
                        sourceBudget,
                        sourceRealized,
                        `${sourcePercentage.toFixed(1)}%`
                    ]);
                });
            });

            csvData.push([
                `TOTAL ${type.toUpperCase()}`,
                '',
                '',
                '',
                typeBudgetTotal,
                typeRealizedTotal,
                `${typeBudgetTotal > 0 ? ((typeRealizedTotal / typeBudgetTotal) * 100).toFixed(1) : '0.0'}%`
            ]);
            csvData.push([]); 

            if (type === 'Income') grandBudgetTotal += typeBudgetTotal;
            else if (type === 'Expense') grandBudgetTotal -= typeBudgetTotal;
        }
    });

    if (reportType === 'budget_vs_actuals') {
        const totalIncomeActual = filteredIncomeRecords.reduce((sum, r) => sum + r.amount, 0);
        const totalExpenseActual = filteredExpenseRecords.reduce((sum, r) => sum + r.amount, 0);
        const grandRealizedTotal = balanceBroughtForward + totalIncomeActual - totalExpenseActual;
        csvData.push(['GRAND SUMMARY: AVAILABLE BALANCE']);
        csvData.push(['Available Balance', '', '', '', grandBudgetTotal, grandRealizedTotal, '']);
    } else if (reportType === 'balance_sheet') {
        // Church Status Table for Excel
        const totalIncomeActual = filteredIncomeRecords.reduce((sum, r) => sum + r.amount, 0);
        const totalExpenseActual = filteredExpenseRecords.reduce((sum, r) => sum + r.amount, 0);
        const totalIncomeWithBF = totalIncomeActual + balanceBroughtForward;
        const currentNetPosition = totalIncomeWithBF - totalExpenseActual;

        csvData.push(['CHURCH FINANCIAL STATUS']);
        csvData.push(['Church Status Item', 'Total Amount']);
        csvData.push([`Total Income (incl. B/F from ${budgetYear - 1})`, totalIncomeWithBF]);
        csvData.push(['Total Expenses (Current Period)', totalExpenseActual]);
        csvData.push(['Current Net Available Position', currentNetPosition]);
    }

    return csvData;
};


export const downloadCsv = (data: any[], reportTitle: string, reportType: string, options: ReportOptions) => {
    if (data.length === 0) return;
    
    let ws;
    if (reportType === 'budget_vs_actuals' || reportType === 'balance_sheet') {
        const hierarchicalData = generateHierarchicalDataForCsv(data, options, reportType);
        ws = utils.aoa_to_sheet(hierarchicalData);
    } else {
        const { headers, body } = getHeadersAndRows(data, reportType, options);
        const csvData = [headers[0]].concat(body.map(row => row.map(cell => typeof cell === 'object' ? cell.content : cell)));
        ws = utils.aoa_to_sheet(csvData);
    }
    
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Financial Report");
    const fileName = `${reportTitle.replace(/[\s/]/g, '_')}.xlsx`;
    writeFile(wb, fileName);
};


const getHeadersAndRows = (data: any[], reportType: string, options: ReportOptions): { headers: string[][], body: any[], statusTable?: any } => {
    if (data.length === 0) return { headers: [], body: [] };

    let headers: string[][] = [];
    let body: any[] = [];
    let statusTable: any = null;

    const { incomeRecords = [], expenseRecords = [], incomeSources = [], expenseSources = [], startDate, endDate, budgetYear = new Date().getFullYear(), balanceBroughtForward = 0, periodString = "" } = options;

    const filterByDate = (records: (IncomeRecord | ExpenseRecord)[]) => {
        if (!startDate || !endDate) return records;
        return records.filter(r => r.date >= startDate && r.date <= endDate);
    }

    const filteredIncomeRecords = filterByDate(incomeRecords);
    const filteredExpenseRecords = filterByDate(expenseRecords);

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
        case 'summary':
            headers.push(['Category', 'Amount']);
            body = data.map(item => [item.Category, formatCurrency(item.Amount)]);
            break;
        case 'individual_tithe':
            headers.push(['Date', 'Amount']);
            body = data.map(item => [item.date ? format(item.date, 'PP') : 'N/A', formatCurrency(item.amount)]);
            break;
        case 'budget_vs_actuals':
        case 'balance_sheet':
             const typeOrder: AccountType[] = options.typeFilter || ['Balance', 'Income', 'Liability', 'Assets', 'Expense'];
             const accounts = data as Account[];
             
             headers.push(['A/C# / Name', 'Description / Category', `Budget for ${budgetYear}`, `Realized: ${periodString}`, '% Realized']);

             let grandBudgetTotal = 0;

             typeOrder.forEach(type => {
                 const groupedAccounts = accounts.filter(acc => acc.type === type);
                 if (groupedAccounts.length > 0) {
                     body.push([{ content: type.toUpperCase(), colSpan: 5, styles: { fontStyle: 'bold', fillColor: '#346F4F', textColor: '#F7F2ED', halign: 'center' } }]);
                     
                     // Add Balance B/F line for Income section
                     if (type === 'Income' && balanceBroughtForward !== 0) {
                         body.push([
                             { content: `Adjustment: Balance Brought Forward (from ${budgetYear - 1})`, styles: { fontStyle: 'italic', fillColor: '#F0F0F0' } },
                             { content: 'Historical', styles: { fillColor: '#F0F0F0' } },
                             { content: formatCurrency(0), styles: { halign: 'right', fillColor: '#F0F0F0' } },
                             { content: formatCurrency(balanceBroughtForward), styles: { halign: 'right', fontStyle: 'bold', fillColor: '#F0F0F0' } },
                             { content: 'N/A', styles: { halign: 'right', fillColor: '#F0F0F0' } }
                         ]);
                     }

                     let typeBudgetTotal = 0;
                     let typeRealizedTotal = 0; // Don't include B/F in account subtotals per user request

                     groupedAccounts.forEach((account: Account) => {
                         const accountBudget = account.budgets?.[budgetYear] || 0;
                         const relevantIncomeSources = incomeSources.filter(s => s.accountId === account.id);
                         const relevantExpenseSources = expenseSources.filter(s => s.accountId === account.id);
                         
                         const directIncomeRecords = filteredIncomeRecords.filter(r => r.accountId === account.id);
                         const directExpenseRecords = filteredExpenseRecords.filter(r => r.accountId === account.id);

                         let realizedFromSources = 0;
                         const sources = type === 'Income' ? relevantIncomeSources : relevantExpenseSources;
                         sources.forEach(source => {
                            const records = type === 'Income'
                                ? filteredIncomeRecords.filter(r => r.incomeSourceId === source.id)
                                : filteredExpenseRecords.filter(r => r.expenseSourceId === source.id);
                            realizedFromSources += records.reduce((s, r) => s + r.amount, 0);
                         });

                         const directAmount = type === 'Income' 
                             ? directIncomeRecords.filter(r => !r.incomeSourceId).reduce((sum, r) => sum + r.amount, 0)
                             : directExpenseRecords.filter(r => !r.expenseSourceId).reduce((sum, r) => sum + r.amount, 0);

                         const accountRealized = realizedFromSources + directAmount;
                         const accountPercentage = accountBudget > 0 ? (accountRealized / accountBudget) * 100 : 0;
                         
                         typeBudgetTotal += accountBudget;
                         typeRealizedTotal += accountRealized;

                         body.push([
                             { content: `${account.code} - ${account.name}`, styles: { fontStyle: 'bold', fillColor: '#F8F9FA' } },
                             { content: account.type, styles: { fillColor: '#F8F9FA' } },
                             { content: formatCurrency(accountBudget), styles: { halign: 'right', fillColor: '#F8F9FA' } },
                             { content: formatCurrency(accountRealized), styles: { halign: 'right', fillColor: '#F8F9FA' } },
                             { content: `${accountPercentage.toFixed(1)}%`, styles: { halign: 'right', fillColor: '#F8F9FA' } }
                         ]);

                         sources.forEach(source => {
                             const sourceBudget = source.budgets?.[budgetYear] || (source.budget || 0);
                             const records = type === 'Income' 
                                 ? filteredIncomeRecords.filter(r => r.incomeSourceId === source.id) 
                                 : filteredExpenseRecords.filter(r => r.expenseSourceId === source.id);
                             const sourceRealized = records.reduce((sum, r) => sum + r.amount, 0);
                             const sourcePercentage = sourceBudget > 0 ? (sourceRealized / sourceBudget) * 100 : 0;

                             body.push([
                                 { content: `  ${source.code} - ${'transactionName' in source ? source.transactionName : source.expenseName}`, styles: { cellPadding: { left: 15 } } },
                                 source.category,
                                 { content: formatCurrency(sourceBudget), styles: { halign: 'right' } },
                                 { content: formatCurrency(sourceRealized), styles: { halign: 'right' } },
                                 { content: `${sourcePercentage.toFixed(1)}%`, styles: { halign: 'right' } }
                             ]);
                         });
                     });

                     body.push([
                         { content: `TOTAL ${type.toUpperCase()}`, colSpan: 2, styles: { fontStyle: 'bold', fillColor: '#EBE2DA', halign: 'right' } },
                         { content: formatCurrency(typeBudgetTotal), styles: { fontStyle: 'bold', fillColor: '#EBE2DA', halign: 'right' } },
                         { content: formatCurrency(typeRealizedTotal), styles: { fontStyle: 'bold', fillColor: '#EBE2DA', halign: 'right' } },
                         { content: `${typeBudgetTotal > 0 ? ((typeRealizedTotal / typeBudgetTotal) * 100).toFixed(1) : '0.0'}%`, styles: { fontStyle: 'bold', fillColor: '#EBE2DA', halign: 'right' } }
                     ]);

                     if (type === 'Income') grandBudgetTotal += typeBudgetTotal;
                     else if (type === 'Expense') grandBudgetTotal -= typeBudgetTotal;
                 }
             });

             if (reportType === 'budget_vs_actuals') {
                const totalIncomeActual = filteredIncomeRecords.reduce((sum, r) => sum + r.amount, 0);
                const totalExpenseActual = filteredExpenseRecords.reduce((sum, r) => sum + r.amount, 0);
                const availableBalance = balanceBroughtForward + totalIncomeActual - totalExpenseActual;

                body.push([
                    { content: 'SUMMARY: AVAILABLE BALANCE (NET POSITION)', colSpan: 2, styles: { fontStyle: 'bold', fillColor: '#346F4F', textColor: '#F7F2ED', halign: 'right' } },
                    { content: formatCurrency(grandBudgetTotal), styles: { fontStyle: 'bold', fillColor: '#346F4F', textColor: '#F7F2ED', halign: 'right' } },
                    { content: formatCurrency(availableBalance), styles: { fontStyle: 'bold', fillColor: '#346F4F', textColor: '#F7F2ED', halign: 'right' } },
                    { content: '', styles: { fillColor: '#346F4F' } }
                ]);
             } else if (reportType === 'balance_sheet') {
                // Construct Status Table for Balance Sheet
                const totalIncomeActual = filteredIncomeRecords.reduce((sum, r) => sum + r.amount, 0);
                const totalExpenseActual = filteredExpenseRecords.reduce((sum, r) => sum + r.amount, 0);
                const totalIncomeWithBF = totalIncomeActual + balanceBroughtForward;
                const currentNetPosition = totalIncomeWithBF - totalExpenseActual;

                statusTable = {
                    headers: [['Church Status Item', 'Total Amount']],
                    body: [
                        [`Total Income (incl. B/F from ${budgetYear - 1})`, formatCurrency(totalIncomeWithBF)],
                        ['Total Expenses (Current Period)', formatCurrency(totalExpenseActual)],
                        [{ content: 'Current Net Available Position', styles: { fontStyle: 'bold', fillColor: '#EBE2DA' } }, { content: formatCurrency(currentNetPosition), styles: { fontStyle: 'bold', fillColor: '#EBE2DA', halign: 'right' } }]
                    ]
                };
             }
             break;

        default:
            break;
    }
    return { headers, body, statusTable };
};


export const downloadPdf = (data: any[], reportTitle: string, reportType: string, options: ReportOptions = {}) => {
    if (data.length === 0) return;

    const doc = new jsPDF('p', 'pt', 'a4') as jsPDFWithAutoTable;
    const { headers, body, statusTable } = getHeadersAndRows(data, reportType, options);
    const pageWidth = doc.internal.pageSize.getWidth();

    const addHeader = (pageNumber: number) => {
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor('#2A4035');
        doc.text("Life Baptist Church Mutengene", pageWidth / 2, 40, { align: 'center' });
        
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor('#857B70');
        doc.text(reportTitle, pageWidth / 2, 60, { align: 'center' });
    };

    const addFooter = () => {
        const pageCount = (doc.internal as any).getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor('#857B70');
            doc.text(`Page ${i} of ${pageCount} | Generated: ${format(new Date(), 'PPpp')}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 20, { align: 'center' });
        }
    };

    const getColumnStyles = (type: string) => {
        const styles: any = {};
        if (type === 'income' || type === 'expenses') {
            styles[4] = { halign: 'right' }; 
        } else if (type === 'summary' || type === 'individual_tithe') {
            styles[1] = { halign: 'right' }; 
        }
        return styles;
    };

    doc.autoTable({
        head: headers,
        body: body,
        startY: 80,
        margin: { top: 80 }, 
        theme: 'grid',
        headStyles: { 
            fillColor: '#346F4F',
            textColor: '#F7F2ED',
            fontSize: 10,
            fontStyle: 'bold'
        },
        styles: { fontSize: 9, cellPadding: 8, lineColor: '#DCD0C3' },
        columnStyles: getColumnStyles(reportType),
        didDrawPage: (data) => {
            addHeader(data.pageNumber);
        }
    });

    // Handle Balance Sheet Status Table
    if (reportType === 'balance_sheet' && statusTable) {
        let finalY = (doc as any).lastAutoTable.finalY + 40;
        
        // Add a heading for the Status Table
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor('#2A4035');
        doc.text("Current Status of the Church", 40, finalY - 10);

        doc.autoTable({
            head: statusTable.headers,
            body: statusTable.body,
            startY: finalY,
            margin: { left: 40, right: 40 },
            theme: 'grid',
            headStyles: { fillColor: '#A38B4B', textColor: '#F7F2ED' },
            styles: { fontSize: 10, cellPadding: 10 },
            columnStyles: { 1: { halign: 'right' } }
        });
    }
    
    // Add total line for non-hierarchical simple reports
    if (reportType === 'income' || reportType === 'expenses' || reportType === 'individual_tithe') {
        const simpleTotal = data.reduce((sum, r) => sum + (r.amount || 0), 0);
        let finalYpos = (doc as any).lastAutoTable.finalY || 80;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`Total: ${formatCurrency(simpleTotal)}`, pageWidth - 40, finalYpos + 30, { align: 'right' });
    }

    addFooter();
    doc.save(`${reportTitle.replace(/[\s/]/g, '_')}.pdf`);
};
