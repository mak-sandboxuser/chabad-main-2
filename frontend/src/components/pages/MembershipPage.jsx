import React from 'react';
import {
  ShieldCheck, Calendar, CircleDollarSign, Gem,
  CreditCard, CheckCircle2, FileText, StickyNote, Heart,
  Bell, Lock, Clock, Download, Settings, ChevronRight,
} from 'lucide-react';
import PortalPageLayout from '../shared/PortalPageLayout';
import { formatDisplayDate, getFinancialSummary, getMembership } from '../../utils/portalData';

export default function MembershipPage({ theme, sfData, onNavigate, onDonate }) {
  const membership = getMembership(sfData);
  const summary = getFinancialSummary(sfData);

  const stats = [
    { label: 'Membership Tier', value: membership.tier || '—', sub: membership.status || '—', icon: Gem, badge: membership.tier || '—', badgeClass: 'blue' },
    { label: 'Status', value: membership.status, sub: 'In good standing', icon: ShieldCheck, valueClass: 'text-success' },
    { label: 'Member Since', value: formatDisplayDate(membership.memberSince), sub: '', icon: Calendar },
    { label: 'Renewal Date', value: formatDisplayDate(membership.renewalDate), sub: `${summary.outstanding > 0 ? `$${summary.outstanding.toFixed(2)} outstanding` : 'Up to date'}`, icon: Calendar, subClass: summary.outstanding > 0 ? 'text-warn' : '' },
    { label: 'Annual Commitment', value: membership.annualCommitment, sub: 'Per year', icon: CircleDollarSign },
  ];

  const details = [
    {
      icon: CreditCard,
      label: 'Payment Method',
      value: membership.paymentMethod,
      sub: membership.paymentMethodExpiry ? `Expires ${membership.paymentMethodExpiry}` : null,
      action: null,
    },
    {
      icon: CheckCircle2,
      label: 'Auto-Renewal',
      value: membership.autoRenewal,
      sub: membership.autoRenewal === 'Enabled' ? 'Your membership will renew automatically.' : 'Auto-renewal is not active.',
      action: membership.autoRenewal === 'Enabled' ? 'Manage' : null,
      valueClass: membership.autoRenewal === 'Enabled' ? 'text-success' : '',
    },
    {
      icon: StickyNote,
      label: 'Membership Notes',
      value: membership.notes || 'No notes on file.',
      sub: null,
      action: null,
    },
    {
      icon: FileText,
      label: 'Receipts & Statements',
      value: 'View and download your membership receipts.',
      sub: null,
      action: 'View All',
      actionTab: 'payments',
    },
  ];

  return (
    <PortalPageLayout
      theme={theme}
      title={`${membership.tier} Membership`}
      subtitle="Thank you for your ongoing commitment to our community."
      breadcrumbs={[
        { label: 'Dashboard', onClick: () => onNavigate('dashboard') },
        { label: 'Membership' },
      ]}
      showSketch={false}
    >
      <div className="membership-page-grid">
        <div className="membership-main">
          <div className="membership-hero-badge-row">
            <span className="badge badge-active">{membership.status} Member</span>
          </div>

          <div className="membership-stats-row">
            {stats.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="membership-stat-card glass-panel">
                  <Icon size={18} className="membership-stat-icon" />
                  <span className="dash-stat-label">{s.label}</span>
                  <strong className={s.valueClass}>{s.value}</strong>
                  {s.badge ? <span className={`role-badge ${s.badgeClass}`}>{s.badge}</span> : null}
                  {s.sub ? <small className={s.subClass}>{s.sub}</small> : null}
                </div>
              );
            })}
          </div>

          <div className="membership-details-card glass-panel">
            <h3>Membership Details</h3>
            {details.map((row) => {
              const Icon = row.icon;
              return (
                <div key={row.label} className="membership-detail-row">
                  <Icon size={18} />
                  <div className="membership-detail-body">
                    <span className="membership-detail-label">{row.label}</span>
                    <strong className={row.valueClass}>{row.value}</strong>
                    {row.sub && <small>{row.sub}</small>}
                  </div>
                  {row.action && (
                    <button type="button" className="portal-text-link" onClick={() => row.actionTab && onNavigate(row.actionTab)}>
                      {row.action}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="membership-thanks-card glass-panel">
            <Heart size={22} className="text-accent" />
            <div>
              <strong>Thank you for making a difference.</strong>
              <p>Your membership helps strengthen Jewish life and community programs at Chabad Bedford.</p>
            </div>
          </div>
        </div>

        <aside className="membership-rail">
          <div className="membership-renewal-card glass-panel">
            <Bell size={20} className="text-accent" />
            <p>Your membership will renew on <strong>{formatDisplayDate(membership.renewalDate)}</strong></p>
            <span className="membership-renewal-amount">Annual Commitment: {membership.annualCommitment}</span>
            <span className="membership-renewal-amount">Contributed: {membership.contributedYtd}</span>
            <button type="button" className="dash-btn-gold full-width" onClick={onDonate}>
              <Lock size={16} /> Make a Payment
            </button>
            <small className="stripe-note"><ShieldCheck size={12} /> Secure payments by Stripe</small>
          </div>

          <div className="dash-rail-card glass-panel">
            <h3>Quick Actions</h3>
            <ul className="dash-actions-list">
              {[
                { label: 'View Contribution History', sub: 'See your past contributions and payments', icon: Clock, tab: 'contributions' },
                { label: 'View Financials', sub: 'Payments, pledges, and recurring billing', icon: Download, tab: 'financial' },
                { label: 'Manage Renewal Preferences', sub: 'Update your renewal and payment settings', icon: Settings, tab: 'recurring' },
              ].map(({ label, sub, icon: Icon, tab }) => (
                <li key={label}>
                  <button type="button" className="dash-action-btn stacked" onClick={() => onNavigate(tab)}>
                    <Icon size={16} />
                    <div>
                      <span>{label}</span>
                      <small>{sub}</small>
                    </div>
                    <ChevronRight size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </PortalPageLayout>
  );
}
