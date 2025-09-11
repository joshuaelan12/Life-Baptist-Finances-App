
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

const getHeadersAndRows = (data: any[], reportType: string): { headers: string[], rows: string[][] } => {
    if (data.length === 0) return { headers: [], rows: [] };

    let headers: string[] = [];
    let rows: string[][] = [];
    const formatCurrency = (val: number | null | undefined) => {
      if (typeof val !== 'number') return 'N/A';
      return val.toLocaleString('fr-CM', { style: 'currency', currency: 'XAF', minimumFractionDigits: 0, maximumFractionDigits: 0 });
    };

    switch(reportType) {
        case 'income':
            headers = ['Date', 'Category', 'Amount', 'Member Name', 'Description'];
            rows = data.map(item => [
                item.date ? format(item.date, 'PP') : 'N/A', 
                item.category || 'N/A', 
                formatCurrency(item.amount), 
                item.memberName || 'N/A', 
                item.description || 'N/A'
            ]);
            break;
        case 'expenses':
            headers = ['Date', 'Category', 'Amount', 'Payee', 'Payment Method', 'Description'];
            rows = data.map(item => [
                item.date ? format(item.date, 'PP') : 'N/A',
                item.category || 'N/A',
                formatCurrency(item.amount),
                item.payee || 'N/A',
                item.paymentMethod || 'N/A',
                item.description || 'N/A'
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
        default:
            // Generic fallback for unknown types
            if (data.length > 0) {
                headers = Object.keys(data[0]);
                rows = data.map(item => headers.map(header => item[header]));
            }
            break;
    }
    return { headers, rows };
};


export const downloadPdf = (data: any[], reportTitle: string, reportType: string) => {
    if (data.length === 0) {
        alert("No data available to generate PDF.");
        return;
    }

    const doc = new jsPDF() as jsPDFWithAutoTable;
    const { headers, rows } = getHeadersAndRows(data, reportType);
    const fileName = `${reportTitle.replace(/\s+/g, '_')}.pdf`;

    // Set title
    doc.setFontSize(18);
    doc.text("Life Baptist Church Mutengene", 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(reportTitle, 14, 30);

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
        }
    });

    doc.save(fileName);
};
