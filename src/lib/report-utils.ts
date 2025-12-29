
import { format } from 'date-fns';
import { utils, writeFile } from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { UserOptions } from 'jspdf-autotable';

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
    
    const fileName = `${reportTitle.replace(/\s+/g, '_')}.xlsx`;
    writeFile(wb, fileName);
};

const getHeadersAndRows = (data: any[], reportType: string): { headers: string[], rows: any[][], total?: number } => {
    if (data.length === 0) return { headers: [], rows: [] };

    let headers: string[] = [];
    let rows: any[][] = [];
    let total: number | undefined = undefined;

    const formatCurrency = (val: number | null | undefined) => {
      if (typeof val !== 'number') return 'N/A';
      return val.toLocaleString('fr-CM', { style: 'currency', currency: 'XAF', minimumFractionDigits: 0, maximumFractionDigits: 0 });
    };

    switch(reportType) {
        case 'income':
            headers = ['Date', 'Category', 'Amount', 'Member Name', 'Description', 'Account ID'];
            rows = data.map(item => [
                item.date ? format(item.date, 'PP') : 'N/A', 
                item.category || 'N/A', 
                formatCurrency(item.amount), 
                item.memberName || 'N/A', 
                item.description || 'N/A',
                item.accountId || 'N/A',
            ]);
            break;
        case 'expenses':
            headers = ['Date', 'Category', 'Amount', 'Payee', 'Payment Method', 'Description', 'Account ID'];
            rows = data.map(item => [
                item.date ? format(item.date, 'PP') : 'N/A',
                item.category || 'N/A',
                formatCurrency(item.amount),
                item.payee || 'N/A',
                item.paymentMethod || 'N/A',
                item.description || 'N/A',
                item.accountId || 'N/A',
            ]);
            break;
        case 'tithes':
            headers = ['Date', 'Member Name', 'Amount'];
            rows = data.map(item => [
                item.date ? format(item.date, 'PP') : 'N/A',
                item.memberName || 'N/A',
                formatCurrency(item.amount)
            ]);
            break;
        case 'summary':
            headers = ['Category', 'Amount'];
            rows = data.map(item => [
                item.Category,
                formatCurrency(item.Amount)
            ]);
            break;
        case 'individual_tithe':
            headers = ['Date', 'Amount'];
            rows = data.map(item => [
                item.date ? format(item.date, 'PP') : 'N/A',
                formatCurrency(item.amount)
            ]);
            total = data.reduce((sum, item) => sum + item.amount, 0);
            break;
        default:
            // Generic fallback for unknown types
            if (data.length > 0) {
                const sanitizedData = data.map(d => {
                    const { id, recordedByUserId, createdAt, ...rest } = d;
                    return rest;
                });
                headers = Object.keys(sanitizedData[0]);
                rows = sanitizedData.map(item => headers.map(header => item[header]));
            }
            break;
    }
    return { headers, rows, total };
};


export const downloadPdf = (data: any[], reportTitle: string, reportType: string) => {
    if (data.length === 0) {
        alert("No data available to generate PDF.");
        return;
    }

    const doc = new jsPDF() as jsPDFWithAutoTable;
    const { headers, rows, total } = getHeadersAndRows(data, reportType);
    const fileName = `${reportTitle.replace(/\s+/g, '_')}.pdf`;

    // Set title
    doc.setFontSize(18);
    doc.text("Life Baptist Church Mutengene", 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(reportTitle, 14, 30);

    let finalY = (doc as any).lastAutoTable.finalY || 35;

    // Add table
    doc.autoTable({
        head: [headers],
        body: rows,
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
            `Total: ${total.toLocaleString('fr-CM', { style: 'currency', currency: 'XAF', minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
            14,
            finalY + 10
        );
    }


    doc.save(fileName);
};

    