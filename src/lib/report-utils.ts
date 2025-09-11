
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
    const formatCurrency = (val: number) => {
      if (typeof val !== 'number') return 'N/A';
      return val.toLocaleString('fr-CM', { style: 'currency', currency: 'XAF', minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    
    switch(reportType) {
        case 'income': return [
            item.date ? format(item.date, 'PP') : 'N/A', 
            item.category || 'N/A', 
            formatCurrency(item.amount), 
            item.memberName || 'N/A', 
            item.description || 'N/A'
        ];
        case 'expenses': return [
            item.date ? format(item.date, 'PP') : 'N/A',
            item.category || 'N/A',
            formatCurrency(item.amount),
            item.payee || 'N/A',
            item.paymentMethod || 'N/A',
            item.description || 'N/A'
        ];
        case 'tithes': return [
            item.date ? format(item.date, 'PP') : 'N/A',
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
              body { 
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                margin: 0;
                color: #333;
              }
              .report-container {
                padding: 20px;
              }
              h1 { 
                text-align: center; 
                color: #346F4F; /* Primary Theme Color */
                font-size: 24px;
                margin-bottom: 8px;
              }
              p.subtitle {
                text-align: center;
                margin-top: 0;
                font-size: 12px;
                color: #A38B4B; /* Accent Color */
              }
              table { 
                width: 100%; 
                border-collapse: collapse; 
                margin-top: 25px;
                font-size: 10px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              }
              th, td { 
                border: 1px solid #EBE2DA; /* Muted Border */
                padding: 10px 12px; 
                text-align: left; 
              }
              th { 
                background-color: #346F4F; /* Primary Theme Color */
                color: white;
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
              }
              tr:nth-child(even) { 
                background-color: #F7F2ED; /* Card Color */
              }
              tr:hover {
                background-color: #EBE2DA; /* Muted Color */
              }
              .no-print { 
                display: none !important; 
              }
              @page { 
                size: A4; 
                margin: 20mm; 
              }
            }
        </style>
        <div class="report-container">
          <h1>Life Baptist Church Mutengene</h1>
          <p class="subtitle">${reportTitle}</p>
          <table>
              <thead>
                  <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
              </thead>
              <tbody>
                  ${tableRows}
              </tbody>
          </table>
        </div>
    `;

    // Trigger print dialog
    window.print();

    // Clean up after printing
    printableContent.innerHTML = '';
};
