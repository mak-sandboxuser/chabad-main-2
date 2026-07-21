import React from 'react';
import { DollarSign, Calendar, TrendingUp, ArrowUpRight, ShieldCheck } from 'lucide-react';
import BuildingSketch from './shared/BuildingSketch';
import {
  formatDisplayDate,
  formatMoney,
  getAccount,
  getContacts,
  getFinancialSummary,
  getMembership,
  getPayments,
  getRecurring,
} from '../utils/portalData';

export default function DashboardHome({
  theme,
  user,
  sfData,
  onNavigate,
  onDonate,
}) {
  const firstName =
    sfData?.name?.split(' ')[0] ||
    user?.name?.split(' ')[0] ||
    user?.email?.split('@')[0] ||
    'Member';

  const account = getAccount(sfData);
  const contacts = getContacts(sfData);
  const membership = getMembership(sfData);
  const summary = getFinancialSummary(sfData);
  const payments = getPayments(sfData);
  const recentPayments = payments.slice(0, 4);
  const totalContributed = formatMoney(summary.totalContributed || summary.contributed);
  const activeRecurring = getRecurring(sfData).find(
    (item) => ['active', 'finished', 'open'].includes((item.status || '').toLowerCase()),
  ) || getRecurring(sfData)[0];

  const contributedYtd = summary.contributedYtd || totalContributed || '$2824.00';
  const outstandingBal = formatMoney(summary.outstanding);
  const progressPct = summary.progressPct || 56;

  return (
    <div className="member-dashboard" style={{ width: '100%' }}>
      <div className="member-dashboard-main" style={{ width: '100%' }}>
        {/* Welcome Header */}
        <div className="dash-welcome-card glass-panel" style={{ width: '100%' }}>
          <div className="dash-welcome-text">
            <h2>Welcome back, {firstName}!</h2>
            <p>Here&apos;s an overview of your membership and financial activity.</p>
          </div>
          <BuildingSketch theme={theme} className="dash-welcome-sketch" />
        </div>

        {/* 3 Executive Summary Cards */}
        <div className="dash-balance-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '22px', width: '100%' }}>
          
          {/* Card 1: Total Contributed YTD */}
          <div className="dash-balance-card glass-panel dash-card-fancy" style={{ padding: '28px 30px', minHeight: '195px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="dash-icon-wrapper gold-glow">
                  <TrendingUp size={18} />
                </div>
                <span className="dash-card-title">Total Contributed (YTD)</span>
              </div>
              <span className="dash-pill-badge gold">
                {summary.paymentCount ? `${summary.paymentCount} Payments` : 'CRM Synced'}
              </span>
            </div>

            <div style={{ margin: '14px 0 6px 0' }}>
              <div style={{ fontSize: '32px', fontWeight: 800, fontFamily: 'var(--font-heading)', color: '#10b981', letterSpacing: '-0.5px' }}>
                {contributedYtd}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Since 2023 To Till Date</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Synced from CRM</span>
            </div>
          </div>

          {/* Card 2: Outstanding Balance */}
          <div className="dash-balance-card glass-panel dash-card-fancy" style={{ padding: '28px 30px', minHeight: '195px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="dash-icon-wrapper red-glow">
                  <DollarSign size={18} />
                </div>
                <span className="dash-card-title">Outstanding Balance</span>
              </div>
              <span className="dash-pill-badge red">
                {membership.annualCommitment ? `Commitment ${membership.annualCommitment}` : 'Due Balance'}
              </span>
            </div>

            <div style={{ margin: '14px 0 6px 0' }}>
              <div style={{ fontSize: '32px', fontWeight: 800, fontFamily: 'var(--font-heading)', color: '#ef4444', letterSpacing: '-0.5px' }}>
                {outstandingBal}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {activeRecurring?.nextDate ? `Due on ${formatDisplayDate(activeRecurring.nextDate)}` : 'No due date scheduled'}
              </span>
              <button type="button" className="dash-btn-gold-action" onClick={onDonate}>
                Make Payment
                <ArrowUpRight size={14} style={{ marginLeft: '4px' }} />
              </button>
            </div>
          </div>

          {/* Card 3: Next Scheduled Contribution */}
          <div className="dash-balance-card glass-panel dash-card-fancy" style={{ padding: '28px 30px', minHeight: '195px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="dash-icon-wrapper blue-glow">
                  <Calendar size={18} />
                </div>
                <span className="dash-card-title">Next Payment</span>
              </div>
              {activeRecurring?.frequency && (
                <span className="dash-pill-badge blue">
                  {activeRecurring.frequency}
                </span>
              )}
            </div>

            <div style={{ margin: '14px 0 6px 0' }}>
              <div style={{ fontSize: '32px', fontWeight: 800, fontFamily: 'var(--font-heading)', color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
                {activeRecurring?.amount || '—'}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {activeRecurring?.nextDate ? `Scheduled: ${formatDisplayDate(activeRecurring.nextDate)}` : 'No scheduled billing'}
              </span>
              <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ShieldCheck size={14} /> Auto-pay
              </span>
            </div>
          </div>

        </div>

        {/* Recent Payments & Household Summary */}
        <div className="dash-split-row" style={{ width: '100%' }}>
          <div className="dash-panel glass-panel">
            <div className="dash-panel-header">
              <h3>Recent Payments</h3>
            </div>
            <div className="table-wrapper">
              <table className="members-table dash-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.length ? recentPayments.map((row, i) => (
                    <tr key={row.id || i}>
                      <td>{formatDisplayDate(row.date)}</td>
                      <td>{row.method || row.type || '—'}</td>
                      <td>{row.amount || '—'}</td>
                      <td><span className="badge badge-active">{row.status || '—'}</span></td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={4} className="portal-empty-table">No payments on file.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <button type="button" className="dash-view-all" onClick={() => onNavigate('payments')}>
              View all payments
            </button>
          </div>

          <div className="dash-panel glass-panel">
            <div className="dash-panel-header">
              <h3>Household Summary</h3>
            </div>
            {contacts.length ? (
              <ul className="dash-household-list">
                {contacts.map((person) => {
                  const initials = person.name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
                  const tag = person.isPrimary ? 'Owner' : 'Member';
                  const tagClass = person.isPrimary ? 'owner' : 'member';
                  return (
                    <li key={person.id || person.contactId || person.name} className="dash-household-item">
                      <div className="dash-household-avatar">{initials}</div>
                      <div className="dash-household-info">
                        <strong>{person.name}</strong>
                        <span>{person.role}</span>
                      </div>
                      <span className={`dash-role-tag ${tagClass}`}>{tag}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="portal-empty-table">No household members on file.</div>
            )}
            <button type="button" className="dash-view-all" onClick={() => onNavigate('household')}>
              View all members
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
