import React from 'react';
import {
  Wallet, Calendar, Lock, Heart, RefreshCw, CreditCard,
  User, Mail, Phone, MapPin, ChevronRight, ShieldCheck, Plus,
} from 'lucide-react';
import PortalPageLayout from '../shared/PortalPageLayout';

const PAYMENTS = [
  { date: 'May 15, 2025', desc: 'Monthly Membership Contribution', amount: '$150.00', method: 'Visa •••• 4242', status: 'Completed' },
  { date: 'Apr 15, 2025', desc: 'Monthly Membership Contribution', amount: '$150.00', method: 'Visa •••• 4242', status: 'Completed' },
  { date: 'Mar 15, 2025', desc: 'Monthly Membership Contribution', amount: '$150.00', method: 'Visa •••• 4242', status: 'Completed' },
];

export default function FinancialOverviewPage({ theme, sfData, onNavigate, onDonate }) {
  const contributed = 1125;
  const total = 1800;
  const remaining = total - contributed;
  const pct = Math.round((contributed / total) * 100);

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
            <strong className="financial-big">${remaining.toFixed(2)}</strong>
            <small className="text-warn">{100 - pct}% of annual commitment remaining</small>
          </div>
        </div>
        <div className="financial-top-col">
          <Calendar size={20} className="text-accent" />
          <div>
            <span className="dash-stat-label">Next Payment</span>
            <strong>June 15, 2024</strong>
            <strong className="financial-amount">$150.00</strong>
            <button type="button" className="portal-text-link">View payment schedule →</button>
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
            <div className="financial-donut" style={{ '--pct': pct }}>
              <span>{pct}%<small>of commitment met</small></span>
            </div>
            <ul className="financial-legend">
              <li><span className="dot blue" /> Contributed — ${contributed.toFixed(2)} ({pct}%)</li>
              <li><span className="dot gold" /> Remaining — ${remaining.toFixed(2)} ({100 - pct}%)</li>
              <li><span className="dot gray" /> Total Commitment — ${total.toFixed(2)}</li>
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
              {(sfData?.financials?.payments?.slice(0, 3) || PAYMENTS).map((p, i) => (
                <tr key={i}>
                  <td>{p.date}</td>
                  <td>{p.desc || p.type}</td>
                  <td>{p.amount}</td>
                  <td>{p.method || 'Visa •••• 4242'}</td>
                  <td><span className="badge badge-active">{p.status || 'Completed'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="financial-side-stack">
          <div className="dash-panel glass-panel">
            <h3>My Account</h3>
            {[
              ['Membership', 'Chai Society'],
              ['Membership Status', 'Active', 'badge'],
              ['Member Since', 'Jan 1, 2024'],
              ['Renewal Date', 'Jan 1, 2025'],
              ['Household', 'Doe Family (4)', 'link'],
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
                <strong>Visa ending in 4242</strong>
                <span className="badge badge-active">Primary</span>
              </div>
            </div>
            <button type="button" className="portal-text-link"><Plus size={14} /> Add Payment Method</button>
          </div>

          <div className="dash-panel glass-panel">
            <div className="dash-panel-header">
              <h3>Billing Contact</h3>
              <button type="button" className="portal-text-link">Edit</button>
            </div>
            <div className="billing-contact">
              <p><User size={14} /> {sfData?.name || 'John Doe'}</p>
              <p><Mail size={14} /> {sfData?.profile?.email || 'john.doe@example.com'}</p>
              <p><Phone size={14} /> {sfData?.profile?.phone || '(914) 555-1234'}</p>
              <p><MapPin size={14} /> 123 Bedford Road, Bedford, NY 10506</p>
            </div>
          </div>
        </div>

        <div className="dash-panel glass-panel">
          <div className="recurring-header">
            <RefreshCw size={20} className="text-purple" />
            <div>
              <h3>Monthly Membership Contribution</h3>
              <strong className="recurring-amount">$150.00 / month</strong>
            </div>
          </div>
          <div className="financial-info-row"><span>Next Charge</span><strong>June 15, 2024</strong></div>
          <div className="financial-info-row"><span>Status</span><span className="badge badge-active">Active</span></div>
          <button type="button" className="dash-btn-outline full-width" onClick={() => onNavigate('recurring')}>
            Manage Contribution <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </PortalPageLayout>
  );
}
