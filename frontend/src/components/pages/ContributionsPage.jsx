import React, { useState } from 'react';
import {
  Heart, Calendar, Clock, Filter, Upload, ChevronLeft, ChevronRight,
  RotateCcw, CreditCard, Landmark,
} from 'lucide-react';
import PortalPageLayout from '../shared/PortalPageLayout';

const ROWS = [
  { date: 'Dec 15, 2024', amount: '$150.00', method: 'Visa ending in 4242', type: 'visa', status: 'Completed' },
  { date: 'Nov 15, 2024', amount: '$150.00', method: 'Visa ending in 4242', type: 'visa', status: 'Completed' },
  { date: 'Oct 15, 2024', amount: '$150.00', method: 'Bank Account •••• 5678', type: 'bank', status: 'Completed' },
  { date: 'Sep 15, 2024', amount: '$150.00', method: 'Visa ending in 4242', type: 'visa', status: 'Pending' },
  { date: 'Aug 15, 2024', amount: '$150.00', method: 'Visa ending in 4242', type: 'visa', status: 'Completed' },
];

export default function ContributionsPage({ theme, sfData, onDonate }) {
  const [page, setPage] = useState(1);
  const payments = sfData?.financials?.payments?.length
    ? sfData.financials.payments.map((p) => ({
        date: p.date,
        amount: p.amount,
        method: p.method || 'Visa ending in 4242',
        type: 'visa',
        status: p.status || 'Completed',
      }))
    : ROWS;

  return (
    <PortalPageLayout
      theme={theme}
      title="Contribution History"
      subtitle="View your historical contributions and payment records."
    >
      <div className="contributions-summary-row">
        {[
          { label: '2024 Contributions', value: '$1,125.00', sub: 'Total contributed in 2024', extra: '↑ 12% vs last year', extraClass: 'text-success', icon: Heart },
          { label: 'Total Contributions', value: '18', sub: 'All time contributions', icon: Calendar },
          { label: 'Last Contribution', value: 'Dec 15, 2024', sub: 'Most recent contribution', icon: Clock },
        ].map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="contributions-stat glass-panel">
              <Icon size={20} className="text-accent" />
              <span className="dash-stat-label">{c.label}</span>
              <strong>{c.value}</strong>
              <small>{c.sub}</small>
              {c.extra && <small className={c.extraClass}>{c.extra}</small>}
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
        <div className="filter-field">
          <Calendar size={16} />
          <select defaultValue="2024"><option>Jan 1, 2024 - Dec 31, 2024</option></select>
        </div>
        <div className="filter-field">
          <Filter size={16} />
          <select defaultValue="all"><option>All Types</option></select>
        </div>
        <button type="button" className="dash-btn-outline"><Upload size={16} /> Export Statement</button>
        <button type="button" className="dash-btn-gold">Apply Filters</button>
      </div>

      <div className="contributions-filter-meta">
        <span>{payments.length} Contributions Found</span>
        <button type="button" className="portal-text-link"><RotateCcw size={14} /> Clear all filters</button>
      </div>

      <div className="dash-panel glass-panel">
        <table className="members-table contributions-table">
          <thead>
            <tr>
              <th>Date ↓</th>
              <th>Amount</th>
              <th>Payment Method</th>
              <th>Status</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {payments.slice(0, 10).map((row, i) => (
              <tr key={i}>
                <td>{row.date}</td>
                <td><strong>{row.amount}</strong></td>
                <td className="payment-method-cell">
                  {row.type === 'bank' ? <Landmark size={16} /> : <CreditCard size={16} />}
                  {row.method}
                </td>
                <td>
                  <span className={`badge ${row.status === 'Pending' ? 'badge-pending' : 'badge-active'}`}>
                    {row.status}
                  </span>
                </td>
                <td><button type="button" className="portal-text-link">View Details →</button></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="table-pagination">
          <span>Showing 1 to 10 of {payments.length} contributions</span>
          <div className="pagination-controls">
            <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /></button>
            <button type="button" className={page === 1 ? 'active' : ''} onClick={() => setPage(1)}>1</button>
            <button type="button" className={page === 2 ? 'active' : ''} onClick={() => setPage(2)}>2</button>
            <button type="button" onClick={() => setPage(2)}><ChevronRight size={16} /></button>
          </div>
          <label className="rows-per-page">
            Rows per page
            <select defaultValue="10"><option>10</option><option>25</option></select>
          </label>
        </div>
      </div>
    </PortalPageLayout>
  );
}
