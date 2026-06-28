import React, { useState } from 'react';
import {
  Heart, Calendar, Clock, Filter, Upload, ChevronLeft, ChevronRight,
  RotateCcw, CreditCard, Landmark,
} from 'lucide-react';
import PortalPageLayout from '../shared/PortalPageLayout';
import { formatDisplayDate, getPayments, parseMoney } from '../../utils/portalData';

export default function ContributionsPage({ theme, sfData, onDonate }) {
  const [page, setPage] = useState(1);
  const payments = getPayments(sfData);
  const totalContributed = payments.reduce((sum, item) => sum + parseMoney(item.amount), 0);
  const lastPayment = payments[0];

  return (
    <PortalPageLayout
      theme={theme}
      title="Contribution History"
      subtitle="View your historical contributions and payment records."
    >
      <div className="contributions-summary-row">
        {[
          { label: 'Total Contributed', value: `$${totalContributed.toFixed(2)}`, sub: `${payments.length} payments on file`, icon: Heart },
          { label: 'Total Contributions', value: String(payments.length), sub: 'All time contributions', icon: Calendar },
          { label: 'Last Contribution', value: formatDisplayDate(lastPayment?.date), sub: lastPayment?.amount || '—', icon: Clock },
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
        <div className="filter-field">
          <Calendar size={16} />
          <select defaultValue="all"><option>All dates</option></select>
        </div>
        <div className="filter-field">
          <Filter size={16} />
          <select defaultValue="all"><option>All Types</option></select>
        </div>
        <button type="button" className="dash-btn-outline"><Upload size={16} /> Export Statement</button>
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
              <th>Type</th>
              <th>Payment Method</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {payments.length ? payments.map((row, i) => (
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

        {payments.length > 10 && (
          <div className="table-pagination">
            <span>Showing 1 to 10 of {payments.length} contributions</span>
            <div className="pagination-controls">
              <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /></button>
              <button type="button" className={page === 1 ? 'active' : ''} onClick={() => setPage(1)}>1</button>
              <button type="button" onClick={() => setPage(2)}><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>
    </PortalPageLayout>
  );
}
