import { formatDisplayDate, parseMoney } from './portalData';
import { getPortalFiscalYearLabel } from './portalFiscalYear';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function downloadContributionsStatement({
  payments = [],
  memberName = 'Member',
  accountName = '',
  email = '',
} = {}) {
  const periodLabel = getPortalFiscalYearLabel();
  const total = payments.reduce((sum, item) => sum + parseMoney(item.amount || item.total), 0);
  const generatedAt = new Date().toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const rowsHtml = payments.length
    ? payments.map((row) => `
        <tr>
          <td>${escapeHtml(formatDisplayDate(row.date))}</td>
          <td>${escapeHtml(row.amount || row.total || '$0.00')}</td>
          <td>${escapeHtml(row.type || 'Donation')}</td>
          <td>${escapeHtml(row.subType || 'General')}</td>
          <td>${escapeHtml(row.method || '—')}</td>
          <td>${escapeHtml(row.status || 'Paid')}</td>
        </tr>
      `).join('')
    : `
        <tr>
          <td colspan="6" style="text-align:center;padding:24px;color:#666;">No contributions in this period.</td>
        </tr>
      `;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Contribution Statement - ${escapeHtml(memberName)}</title>
  <style>
    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #1a1a1a;
      margin: 32px;
      background: #ffffff;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 24px;
      color: #1a1a1a;
    }
    .meta {
      margin: 0 0 24px;
      color: #555;
      font-size: 13px;
      line-height: 1.6;
    }
    .summary {
      display: inline-block;
      margin-bottom: 24px;
      padding: 14px 18px;
      border: 1px solid #e5d4a1;
      background: #fff9e8;
      border-radius: 8px;
      font-size: 14px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    thead th {
      background: #c9a227;
      color: #1a1a1a;
      font-weight: 700;
      text-align: left;
      padding: 12px 14px;
      border: 1px solid #b8921f;
    }
    tbody td {
      padding: 10px 14px;
      border: 1px solid #dddddd;
      vertical-align: top;
    }
    tbody tr:nth-child(even) td {
      background: #f8f8f8;
    }
    tfoot td {
      padding: 12px 14px;
      font-weight: 700;
      border: 1px solid #dddddd;
      background: #f3f3f3;
    }
    .footer {
      margin-top: 24px;
      font-size: 12px;
      color: #777;
    }
  </style>
</head>
<body>
  <h1>Contribution Statement</h1>
  <p class="meta">
    <strong>${escapeHtml(memberName)}</strong><br />
    ${accountName ? `${escapeHtml(accountName)}<br />` : ''}
    ${email ? `${escapeHtml(email)}<br />` : ''}
    Period: ${escapeHtml(periodLabel)}<br />
    Generated: ${escapeHtml(generatedAt)}
  </p>
  <div class="summary">
    Total Contributed: <strong>$${total.toFixed(2)}</strong> &nbsp;|&nbsp;
    Contributions: <strong>${payments.length}</strong>
  </div>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Amount</th>
        <th>Type</th>
        <th>Sub-Type</th>
        <th>Payment Method</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
    <tfoot>
      <tr>
        <td>Total</td>
        <td>$${total.toFixed(2)}</td>
        <td colspan="4">${payments.length} contribution${payments.length === 1 ? '' : 's'}</td>
      </tr>
    </tfoot>
  </table>
  <p class="footer">Chabad Bedford Member Portal · ${escapeHtml(periodLabel)}</p>
</body>
</html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeName = String(memberName || 'member').replace(/[^\w.-]+/g, '_');
  link.href = url;
  link.download = `contribution-statement-${safeName}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
