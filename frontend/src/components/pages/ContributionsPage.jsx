import React, { useEffect, useMemo, useState } from 'react';
import {
  Heart, Calendar, Clock, Upload, ChevronLeft, ChevronRight,
  RotateCcw, CreditCard, Landmark,
} from 'lucide-react';
import PortalPageLayout from '../shared/PortalPageLayout';
import {
  formatDisplayDate,
  getAccount,
  getPayments,
  parseMoney,
  getPortalFiscalYearLabel,
} from '../../utils/portalData';
import { getPortalFiscalYearRange } from '../../utils/portalFiscalYear';
import { downloadContributionsStatement } from '../../utils/exportContributionsStatement';
import { showToast } from '../../utils/toast';

const DATE_FILTER_OPTIONS = [
  { id: 'all', label: 'All dates' },
  { id: 'month', label: 'This month' },
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 90 days' },
  { id: 'custom', label: 'Custom range' },
];

function paymentYmd(payment) {
  const raw = String(payment?.sortDate || payment?.date || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return '';
  const date = new Date(parsed);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toYmd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function filterPaymentsByDate(payments, { preset, customFrom, customTo, fiscalStart, fiscalEnd }) {
  if (preset === 'all') return payments;

  const todayYmd = toYmd(new Date());

  if (preset === 'custom') {
    const from = customFrom || fiscalStart;
    const to = customTo || fiscalEnd;
    return payments.filter((payment) => {
      const ymd = paymentYmd(payment);
      return ymd && ymd >= from && ymd <= to;
    });
  }

  let fromYmd = fiscalStart;
  if (preset === '30d') {
    const start = new Date();
    start.setDate(start.getDate() - 30);
    fromYmd = toYmd(start);
  } else if (preset === '90d') {
    const start = new Date();
    start.setDate(start.getDate() - 90);
    fromYmd = toYmd(start);
  } else if (preset === 'month') {
    const now = new Date();
    fromYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  }

  const rangeStart = fromYmd < fiscalStart ? fiscalStart : fromYmd;
  const rangeEnd = todayYmd > fiscalEnd ? fiscalEnd : todayYmd;

  return payments.filter((payment) => {
    const ymd = paymentYmd(payment);
    return ymd && ymd >= rangeStart && ymd <= rangeEnd;
  });
}

export default function ContributionsPage({ theme, sfData, onDonate, user }) {
  const [page, setPage] = useState(1);
  const [datePreset, setDatePreset] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const payments = getPayments(sfData);
  const fiscalRange = getPortalFiscalYearRange();
  const account = getAccount(sfData);
  const fiscalPeriodLabel = getPortalFiscalYearLabel();

  const filteredPayments = useMemo(
    () => filterPaymentsByDate(payments, {
      preset: datePreset,
      customFrom,
      customTo,
      fiscalStart: fiscalRange.startDate,
      fiscalEnd: fiscalRange.endDate,
    }),
    [payments, datePreset, customFrom, customTo, fiscalRange.startDate, fiscalRange.endDate],
  );

  const totalContributed = filteredPayments.reduce((sum, item) => sum + parseMoney(item.amount), 0);
  const lastPayment = filteredPayments[0];
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredPayments.length / pageSize));
  const pagedPayments = filteredPayments.slice((page - 1) * pageSize, page * pageSize);
  const hasActiveFilters = datePreset !== 'all';

  useEffect(() => {
    setPage(1);
  }, [datePreset, customFrom, customTo]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handleExport = () => {
    if (!filteredPayments.length) {
      showToast({ message: 'No contributions to export for this period.', type: 'error' });
      return;
    }

    downloadContributionsStatement({
      payments: filteredPayments,
      memberName: user?.name || sfData?.name || 'Member',
      accountName: account.name,
      email: user?.email || sfData?.email || account.email,
    });
    showToast({ message: 'Contribution statement downloaded.', type: 'success' });
  };

  const handleClearFilters = () => {
    setDatePreset('all');
    setCustomFrom('');
    setCustomTo('');
  };

  const activeFilterLabel = DATE_FILTER_OPTIONS.find((option) => option.id === datePreset)?.label || 'All dates';

  return (
    <PortalPageLayout
      theme={theme}
      title="Contribution History"
      subtitle={`Contributions for ${fiscalPeriodLabel}. Records reset each September 1.`}
    >
      <div className="contributions-summary-row">
        {[
          {
            label: 'Total Contributed',
            value: `$${totalContributed.toFixed(2)}`,
            sub: `${filteredPayments.length} payments this period`,
            icon: Heart,
          },
          {
            label: 'Total Contributions',
            value: String(filteredPayments.length),
            sub: fiscalPeriodLabel,
            icon: Calendar,
          },
          {
            label: 'Last Contribution',
            value: formatDisplayDate(lastPayment?.date),
            sub: lastPayment?.amount || '—',
            icon: Clock,
          },
        ].map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="contributions-stat glass-panel">
              <Icon size={20} className="text-accent" />
              <span className="dash-stat-label">{c.label}</span>
              <strong>{c.value}</strong>
              <small>{c.sub}</small>
            </div>
          );
        })}
        <div className="contributions-cta glass-panel">
          <button type="button" className="dash-btn-gold full-width" onClick={onDonate}>
            <Heart size={16} /> Make a Contribution
          </button>
          <small>Thank you for your generosity.</small>
        </div>
      </div>

      <div className="contributions-filters glass-panel">
        <div className="contributions-date-filter">
          <div className="filter-field">
            <Calendar size={16} aria-hidden="true" />
            <select
              value={datePreset}
              onChange={(event) => setDatePreset(event.target.value)}
              aria-label="Filter contributions by date"
            >
              {DATE_FILTER_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>

          {datePreset === 'custom' && (
            <div className="filter-field filter-field-date-range">
              <label className="filter-date-label">
                <span>From</span>
                <input
                  type="date"
                  value={customFrom}
                  min={fiscalRange.startDate}
                  max={customTo || fiscalRange.endDate}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  aria-label="Filter from date"
                />
              </label>
              <label className="filter-date-label">
                <span>To</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom || fiscalRange.startDate}
                  max={fiscalRange.endDate}
                  onChange={(event) => setCustomTo(event.target.value)}
                  aria-label="Filter to date"
                />
              </label>
            </div>
          )}
        </div>

        <button type="button" className="dash-btn-outline contributions-export-btn" onClick={handleExport}>
          <Upload size={16} /> Export Statement
        </button>
      </div>

      <div className="contributions-filter-meta">
        <span>
          {filteredPayments.length} Contributions Found · {fiscalPeriodLabel}
          {hasActiveFilters ? ` · ${activeFilterLabel}` : ''}
        </span>
        {hasActiveFilters && (
          <button type="button" className="portal-text-link" onClick={handleClearFilters}>
            <RotateCcw size={14} /> Clear filters
          </button>
        )}
      </div>

      <div className="dash-panel glass-panel">
        <table className="members-table contributions-table">
          <thead>
            <tr>
              <th>Date ↓</th>
              <th>Amount</th>
              <th>Type</th>
              <th>Payment Method</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredPayments.length ? pagedPayments.map((row, i) => (
              <tr key={row.id || i}>
                <td>{formatDisplayDate(row.date)}</td>
                <td><strong>{row.amount}</strong></td>
                <td>{row.subType || row.type}</td>
                <td className="payment-method-cell">
                  {(row.method || '').toLowerCase().includes('bank') ? <Landmark size={16} /> : <CreditCard size={16} />}
                  {row.method || '—'}
                </td>
                <td>
                  <span className={`badge ${row.status === 'Pending' ? 'badge-pending' : 'badge-active'}`}>
                    {row.status || 'Paid'}
                  </span>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary)' }}>
                  No contributions found yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {filteredPayments.length > pageSize && (
          <div className="table-pagination">
            <span>
              Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredPayments.length)} of {filteredPayments.length} contributions
            </span>
            <div className="pagination-controls">
              <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /></button>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  className={page === pageNumber ? 'active' : ''}
                  onClick={() => setPage(pageNumber)}
                >
                  {pageNumber}
                </button>
              ))}
              <button type="button" disabled={page === totalPages} onClick={() => setPage(page + 1)}><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>
    </PortalPageLayout>
  );
}