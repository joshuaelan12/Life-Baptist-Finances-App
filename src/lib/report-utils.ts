
import { format } from 'date-fns';
import { utils, writeFile } from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { UserOptions } from 'jspdf-autotable';
import type { AccountType } from '@/types';

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
            const grouped: Record<string, any[]> = {};
            data.forEach(d => {
                if (!grouped[d.Type]) grouped[d.Type] = [];
                grouped[d.Type].push(d);
            });
            
            headers.push(['A/C#', 'A/C NAME', `Budget for ${options.budgetYear}`, `Realized: ${options.periodString}`, '% Realized']);

            typeOrder.forEach(type => {
                if (grouped[type]) {
                    body.push([{ content: type, colSpan: 5, styles: { fontStyle: 'bold', fillColor: '#EAEAEA' } }]);
                    grouped[type].forEach(item => {
                        const budget = item['Budget'];
                        const realized = item['Realized'];
                        const percentage = budget > 0 ? (realized / budget) * 100 : 0;
                        body.push([
                            item['A/C#'],
                            item['A/C NAME'],
                            formatCurrency(budget),
                            formatCurrency(realized),
                            `${percentage.toFixed(1)}%`
                        ]);
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

    doc.autoTable({
        head: headers,
        body: body,
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

    