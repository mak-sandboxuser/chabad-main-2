import React from 'react';
import {
  Wallet, Calendar, Lock, Heart, RefreshCw, CreditCard,
  User, Mail, Phone, MapPin, ChevronRight, ShieldCheck,
} from 'lucide-react';
import PortalPageLayout from '../shared/PortalPageLayout';
import {
  formatAddress,
  formatDisplayDate,
  formatMoney,
  getAccount,
  getFinancialSummary,
  getMembership,
  getPayments,
  getRecurring,
} from '../../utils/portalData';

export default function FinancialOverviewPage({ theme, sfData, onNavigate, onDonate }) {
  const summary = getFinancialSummary(sfData);
  const membership = getMembership(sfData);
  const account = getAccount(sfData);
  const payments = getPayments(sfData);
  const recurring = getRecurring(sfData)[0];

  return (
    <PortalPageLayout
      theme={theme}
      title="Financial Overview"
      subtitle="View your financial commitments and contribution activity."
    >
      <div className="financial-top-card glass-panel">
        <div className="financial-top-col">
          <Wallet size={24} className="text-accent" />
          <div>
            <span className="dash-stat-label">Outstanding Balance</span>
            <strong className="financial-big">${summary.outstanding.toFixed(2)}</strong>
            <small className="text-warn">
              {summary.paymentCount ? `${summary.paymentCount} payments · ${formatMoney(summary.totalContributed)} contributed` : 'No payment history yet'}
            </small>
          </div>
        </div>
        <div className="financial-top-col">
          <Calendar size={20} className="text-accent" />
          <div>
            <span className="dash-stat-label">Next Payment</span>
            <strong>{formatDisplayDate(recurring?.nextDate || membership.renewalDate)}</strong>
            <strong className="financial-amount">{recurring?.amount || '—'}</strong>
            <button type="button" className="portal-text-link" onClick={() => onNavigate('financial')}>View payment schedule →</button>
          </div>
        </div>
        <div className="financial-top-col actions">
          <button type="button" className="dash-btn-gold" onClick={onDonate}>
            <Lock size={16} /> Make a Payment
          </button>
          <small className="stripe-note"><ShieldCheck size={12} /> Secure payments by Stripe</small>
        </div>
      </div>

      <div className="financial-mid-row">
        <div className="financial-donut-card glass-panel">
          <h3>Annual Commitment Progress</h3>
          <div className="financial-donut-wrap">
            <div className="financial-donut" style={{ '--pct': summary.progressPct }}>
              <span>{summary.progressPct}%<small>of commitment met</small></span>
            </div>
            <ul className="financial-legend">
              <li><span className="dot blue" /> Contributed — {membership.contributedYtd} ({summary.progressPct}%)</li>
              <li><span className="dot gold" /> Remaining — ${summary.outstanding.toFixed(2)} ({100 - summary.progressPct}%)</li>
              <li><span className="dot gray" /> Total Commitment — {membership.annualCommitment}</li>
            </ul>
          </div>
        </div>
        <div className="membership-thanks-card glass-panel compact">
          <Heart size={22} className="text-accent" />
          <div>
            <strong>Thank you!</strong>
            <p>Your generosity helps sustain our community programs and services.</p>
          </div>
        </div>
      </div>

      <div className="financial-bottom-grid">
        <div className="dash-panel glass-panel">
          <div className="dash-panel-header">
            <h3>Recent Payments</h3>
            <button type="button" className="portal-text-link" onClick={() => onNavigate('payments')}>View all →</button>
          </div>
          <table className="members-table dash-table">
            <thead>
              <tr><th>Date</th><th>Description</th><th>Amount</th><th>Payment Method</th><th>Status</th></tr>
            </thead>
            <tbody>
              {payments.length ? payments.slice(0, 5).map((p, i) => (
                <tr key={p.id || i}>
                  <td>{formatDisplayDate(p.date)}</td>
                  <td>{p.type || p.subType || 'Donation'}</td>
                  <td>{p.amount}</td>
                  <td>{p.method || 'Cash'}</td>
                  <td><span className="badge badge-active">{p.status || 'Paid'}</span></td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="portal-empty-table">No payments on file.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="financial-side-stack">
          <div className="dash-panel glass-panel">
            <h3>My Account</h3>
            {[
              ['Membership', membership.tier],
              ['Membership Status', membership.status, 'badge'],
              ['Member Since', formatDisplayDate(membership.memberSince)],
              ['Renewal Date', formatDisplayDate(membership.renewalDate)],
              [`Household (${sfData?.contacts?.length || 1})`, account.name, 'link'],
            ].map(([label, val, type]) => (
              <div key={label} className="financial-info-row">
                <span>{label}</span>
                {type === 'badge' ? <span className="badge badge-active">{val}</span>
                  : type === 'link' ? <button type="button" className="portal-text-link" onClick={() => onNavigate('household')}>{val}</button>
                  : <strong>{val}</strong>}
              </div>
            ))}
          </div>

          <div className="dash-panel glass-panel">
            <h3>Payment Method</h3>
            <div className="payment-method-row">
              <CreditCard size={18} />
              <div>
                <strong>{membership.paymentMethod}</strong>
                <span className="badge badge-active">Primary</span>
              </div>
            </div>
          </div>

          <div className="dash-panel glass-panel">
            <div className="dash-panel-header">
              <h3>Billing Contact</h3>
            </div>
            <div className="billing-contact">
              <p><User size={14} /> {sfData?.name}</p>
              <p><Mail size={14} /> {sfData?.email}</p>
              <p><Phone size={14} /> {account.phone || '—'}</p>
              <p><MapPin size={14} /> {formatAddress(account)}</p>
            </div>
          </div>
        </div>

        <div className="dash-panel glass-panel">
          <div className="recurring-header">
            <RefreshCw size={20} className="text-purple" />
            <div>
              <h3>{recurring?.type || 'Recurring Contribution'}</h3>
              <strong className="recurring-amount">{recurring ? `${recurring.amount} / ${(recurring.frequency || 'month').toLowerCase()}` : 'Not configured'}</strong>
            </div>
          </div>
          <div className="financial-info-row"><span>Next Charge</span><strong>{formatDisplayDate(recurring?.nextDate)}</strong></div>
          <div className="financial-info-row"><span>Status</span><span className="badge badge-active">{recurring?.status || 'Inactive'}</span></div>
          <button type="button" className="dash-btn-outline full-width" onClick={() => onNavigate('recurring')}>
            Manage Billing <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </PortalPageLayout>
  );
}
