import React from 'react';
import {
  Crown,
  ShieldCheck,
  FileText,
  Users,
  ChevronRight,
  CreditCard,
  User,
  Home,
  Landmark,
  Bell,
  CheckCircle2,
  CalendarClock,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import BuildingSketch from './shared/BuildingSketch';

const RECENT_PAYMENTS = [
  { date: 'Apr 15, 2025', desc: 'Monthly Contribution', amount: '$300.00', status: 'Paid' },
  { date: 'Mar 15, 2025', desc: 'Monthly Contribution', amount: '$300.00', status: 'Paid' },
  { date: 'Feb 15, 2025', desc: 'Monthly Contribution', amount: '$300.00', status: 'Paid' },
  { date: 'Jan 15, 2025', desc: 'Annual Membership', amount: '$750.00', status: 'Paid' },
];

const HOUSEHOLD = [
  { name: 'John Doe', role: 'Primary Member', initials: 'JD', tag: 'Owner', tagClass: 'owner' },
  { name: 'Sarah Doe', role: 'Spouse', initials: 'SD', tag: 'Member', tagClass: 'member' },
  { name: 'Levi Doe', role: 'Child', initials: 'LD', tag: 'Member', tagClass: 'member' },
  { name: 'Miriam Doe', role: 'Child', initials: 'MD', tag: 'Member', tagClass: 'member' },
];

const FEED = [
  { icon: CheckCircle2, tone: 'green', title: 'Payment Successful', body: 'Your $300 contribution was processed.', time: '2h ago' },
  { icon: CalendarClock, tone: 'blue', title: 'Upcoming Contribution', body: '$300 scheduled for May 15, 2025.', time: '1d ago' },
  { icon: AlertTriangle, tone: 'amber', title: 'Payment Method Expiring', body: 'Your card ending in 4242 expires soon.', time: '3d ago' },
  { icon: Sparkles, tone: 'purple', title: 'Membership Update', body: 'Your premium membership is active.', time: '1w ago' },
];

const QUICK_ACTIONS = [
  { label: 'Make Payment', icon: CreditCard, tab: 'payments' },
  { label: 'Manage Billing', icon: Landmark, tab: 'recurring' },
  { label: 'Update Profile', icon: User, tab: 'profile' },
  { label: 'View Household', icon: Home, tab: 'household' },
  { label: 'View Membership Details', icon: ShieldCheck, tab: 'membership' },
];

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

  const householdName = sfData?.profile?.accountName || 'Your Household';
  const memberCount = sfData?.contacts?.length || HOUSEHOLD.length;
  const annualCommitment = 3600;
  const contributedYtd = 1950;
  const outstanding = annualCommitment - contributedYtd;
  const progressPct = Math.round((contributedYtd / annualCommitment) * 100);

  return (
    <div className="member-dashboard">
      <div className="member-dashboard-main">
        <div className="dash-welcome-card glass-panel">
          <div className="dash-welcome-text">
            <h2>Welcome back, {firstName}! 👋</h2>
            <p>Here&apos;s an overview of your membership and financial activity.</p>
          </div>
          <BuildingSketch theme={theme} className="dash-welcome-sketch" />
        </div>

        <div className="dash-stat-row">
          <button type="button" className="dash-stat-card glass-panel" onClick={() => onNavigate('membership')}>
            <div>
              <span className="dash-stat-label">Membership Tier</span>
              <strong>Premium</strong>
              <small>Annual Membership</small>
            </div>
            <div className="dash-stat-icon gold"><Crown size={20} /></div>
            <ChevronRight size={16} className="dash-stat-chevron" />
          </button>
          <button type="button" className="dash-stat-card glass-panel" onClick={() => onNavigate('membership')}>
            <div>
              <span className="dash-stat-label">Membership Status</span>
              <strong className="text-success">Active</strong>
              <small>Member since Jan 15, 2024</small>
            </div>
            <div className="dash-stat-icon green"><ShieldCheck size={20} /></div>
            <ChevronRight size={16} className="dash-stat-chevron" />
          </button>
          <button type="button" className="dash-stat-card glass-panel" onClick={() => onNavigate('financial')}>
            <div>
              <span className="dash-stat-label">Annual Commitment</span>
              <strong>${annualCommitment.toLocaleString()}.00</strong>
              <small>Billed Annually</small>
            </div>
            <div className="dash-stat-icon blue"><FileText size={20} /></div>
            <ChevronRight size={16} className="dash-stat-chevron" />
          </button>
          <button type="button" className="dash-stat-card glass-panel" onClick={() => onNavigate('household')}>
            <div>
              <span className="dash-stat-label">Household</span>
              <strong>{householdName}</strong>
              <small>{memberCount} Members</small>
            </div>
            <div className="dash-stat-icon purple"><Users size={20} /></div>
            <ChevronRight size={16} className="dash-stat-chevron" />
          </button>
        </div>

        <div className="dash-contribution-card glass-panel">
          <div className="dash-contribution-col">
            <span className="dash-stat-label">Total Contributed (YTD)</span>
            <strong className="dash-contribution-amount text-success">
              ${contributedYtd.toLocaleString()}.00
            </strong>
            <small>of ${annualCommitment.toLocaleString()}.00 commitment</small>
            <div className="dash-progress-track">
              <div className="dash-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="dash-progress-label">{progressPct}% of annual commitment</span>
          </div>
          <div className="dash-contribution-col">
            <span className="dash-stat-label">Outstanding Balance</span>
            <strong className="dash-contribution-amount text-danger">
              ${outstanding.toLocaleString()}.00
            </strong>
            <small>Due by Dec 31, 2025</small>
            <button type="button" className="dash-btn-gold" onClick={onDonate}>
              Make Payment
            </button>
          </div>
          <div className="dash-contribution-col">
            <span className="dash-stat-label">Next Scheduled Contribution</span>
            <strong className="dash-contribution-amount">$300.00</strong>
            <small>May 15, 2025</small>
            <span className="dash-schedule-badge">In 12 days</span>
            <button type="button" className="dash-btn-outline" onClick={() => onNavigate('recurring')}>
              Manage Billing
            </button>
          </div>
        </div>

        <div className="dash-split-row">
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
                  {(sfData?.financials?.payments?.length
                    ? sfData.financials.payments.slice(0, 4).map((p) => ({
                        date: p.date,
                        desc: p.type,
                        amount: p.amount,
                        status: p.status || 'Paid',
                      }))
                    : RECENT_PAYMENTS
                  ).map((row, i) => (
                    <tr key={i}>
                      <td>{row.date}</td>
                      <td>{row.desc}</td>
                      <td>{row.amount}</td>
                      <td><span className="badge badge-active">{row.status}</span></td>
                    </tr>
                  ))}
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
            <ul className="dash-household-list">
              {(sfData?.contacts?.length
                ? sfData.contacts.map((c) => ({
                    name: c.name,
                    role: c.role,
                    initials: c.name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase(),
                    tag: c.isPrimary ? 'Owner' : 'Member',
                    tagClass: c.isPrimary ? 'owner' : 'member',
                  }))
                : HOUSEHOLD
              ).map((person) => (
                <li key={person.name} className="dash-household-item">
                  <div className="dash-household-avatar">{person.initials}</div>
                  <div className="dash-household-info">
                    <strong>{person.name}</strong>
                    <span>{person.role}</span>
                  </div>
                  <span className={`dash-role-tag ${person.tagClass}`}>{person.tag}</span>
                </li>
              ))}
            </ul>
            <button type="button" className="dash-view-all" onClick={() => onNavigate('household')}>
              View all members
            </button>
          </div>
        </div>
      </div>

      <aside className="member-dashboard-rail">
        <div className="dash-rail-card glass-panel">
          <div className="dash-panel-header">
            <h3>Notifications</h3>
            <Bell size={16} />
          </div>
          <ul className="dash-feed-list">
            {FEED.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.title} className={`dash-feed-item tone-${item.tone}`}>
                  <div className="dash-feed-icon"><Icon size={16} /></div>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.body}</p>
                    <time>{item.time}</time>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="dash-rail-card glass-panel">
          <div className="dash-panel-header">
            <h3>Quick Actions</h3>
          </div>
          <ul className="dash-actions-list">
            {QUICK_ACTIONS.map(({ label, icon: Icon, tab }) => (
              <li key={label}>
                <button type="button" className="dash-action-btn" onClick={() => onNavigate(tab)}>
                  <Icon size={16} />
                  <span>{label}</span>
                  <ChevronRight size={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
