import React from 'react';
import {
  ShieldCheck, Calendar, CircleDollarSign, Gem,
  CreditCard, CheckCircle2, FileText, StickyNote, Heart,
  Bell, Lock, Clock, Download, Settings, ChevronRight,
} from 'lucide-react';
import PortalPageLayout from '../shared/PortalPageLayout';

export default function MembershipPage({ theme, onNavigate, onDonate }) {
  return (
    <PortalPageLayout
      theme={theme}
      title="Chai Society Membership"
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
            <span className="badge badge-active">Active Member</span>
          </div>

          <div className="membership-stats-row">
            {[
              { label: 'Membership Tier', value: 'Chai Society', sub: 'Premium', icon: Gem, badge: 'Premium', badgeClass: 'blue' },
              { label: 'Status', value: 'Active', sub: 'In good standing', icon: ShieldCheck, valueClass: 'text-success' },
              { label: 'Member Since', value: 'Jan 1, 2024', sub: '16 months', icon: Calendar },
              { label: 'Renewal Date', value: 'Jan 1, 2026', sub: '152 days remaining', icon: Calendar, subClass: 'text-warn' },
              { label: 'Annual Commitment', value: '$1,800.00', sub: 'Per year', icon: CircleDollarSign },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="membership-stat-card glass-panel">
                  <Icon size={18} className="membership-stat-icon" />
                  <span className="dash-stat-label">{s.label}</span>
                  <strong className={s.valueClass}>{s.value}</strong>
                  {s.badge ? <span className={`role-badge ${s.badgeClass}`}>{s.badge}</span> : null}
                  <small className={s.subClass}>{s.sub}</small>
                </div>
              );
            })}
          </div>

          <div className="membership-details-card glass-panel">
            <h3>Membership Details</h3>
            {[
              { icon: CreditCard, label: 'Payment Method', value: 'Visa ending in 4242', sub: 'Expires 04/27', action: null },
              { icon: CheckCircle2, label: 'Auto-Renewal', value: 'Enabled', sub: 'Your membership will renew automatically.', action: 'Manage', valueClass: 'text-success' },
              { icon: StickyNote, label: 'Membership Notes', value: 'Thank you for being a valued member of our Chai Society.', sub: null, action: 'Edit' },
              { icon: FileText, label: 'Receipts & Statements', value: 'View and download your membership receipts.', sub: null, action: 'View All' },
            ].map((row) => {
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
                    <button type="button" className="portal-text-link">{row.action}</button>
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
            <p>Your membership will renew on <strong>January 1, 2026</strong></p>
            <span className="membership-renewal-amount">Annual Commitment: $1,800.00</span>
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
                { label: 'Download Membership Summary', sub: 'Get a summary of your membership', icon: Download, tab: 'membership' },
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
