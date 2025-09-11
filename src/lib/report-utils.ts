
import { format } from 'date-fns';
import { utils, writeFile } from 'xlsx';

// A generic function to convert an array of objects to CSV
const arrayToCsv = (data: any[]): string => {
  if (data.length === 0) return "";
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','), // header row
    ...data.map(row => 
      headers.map(fieldName => {
        let field = row[fieldName];
        if (field instanceof Date) {
            return format(field, 'yyyy-MM-dd');
        }
        if (typeof field === 'string' && field.includes(',')) {
          return `"${field}"`; // Handle commas in strings
        }
        return field;
      }).join(',')
    )
  ];
  return csvRows.join('\n');
};

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

const getHeaders = (reportType: string): string[] => {
    switch(reportType) {
        case 'income': return ['Date', 'Category', 'Amount', 'Member Name', 'Description'];
        case 'expenses': return ['Date', 'Category', 'Amount', 'Payee', 'Payment Method', 'Description'];
        case 'tithes': return ['Date', 'Member Name', 'Amount'];
        case 'summary': return ['Category', 'Amount'];
        default: return [];
    }
};

const getRow = (item: any, reportType: string): string[] => {
    const formatCurrency = (val: number) => val?.toLocaleString('en-US', { style: 'currency', currency: 'XAF' }).replace('XAF', '').trim() + ' XAF';
    
    switch(reportType) {
        case 'income': return [
            format(item.date, 'PP'), 
            item.category || 'N/A', 
            formatCurrency(item.amount), 
            item.memberName || 'N/A', 
            item.description || 'N/A'
        ];
        case 'expenses': return [
            format(item.date, 'PP'),
            item.category || 'N/A',
            formatCurrency(item.amount),
            item.payee || 'N/A',
            item.paymentMethod || 'N/A',
            item.description || 'N/A'
        ];
        case 'tithes': return [
            format(item.date, 'PP'),
            item.memberName || 'N/A',
            formatCurrency(item.amount)
        ];
        case 'summary': return [
            item.Category,
            formatCurrency(item.Amount)
        ];
        default: return [];
    }
};


export const downloadPdf = (data: any[], reportTitle: string, reportType: string) => {
    const printableContent = document.getElementById('pdf-content');
    if (!printableContent || data.length === 0) {
        alert("No data available to generate PDF.");
        return;
    }

    const headers = getHeaders(reportType);
    const tableRows = data.map(item => `<tr>${getRow(item, reportType).map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('');

    printableContent.innerHTML = `
        <style>
            @media print {
              body { font-family: Arial, sans-serif; margin: 20px; }
              h1 { text-align: center; color: #333; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f2f2f2; }
              tr:nth-child(even) { background-color: #f9f9f9; }
              .no-print { display: none !important; }
              @page { size: A4; margin: 20mm; }
            }
        </style>
        <h1>${reportTitle}</h1>
        <table>
            <thead>
                <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>
    `;

    // Trigger print dialog
    window.print();

    // Clean up after printing
    printableContent.innerHTML = '';
};
