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
  Calendar,
  DollarSign,
  Megaphone,
  Gift,
} from 'lucide-react';
import BuildingSketch from './shared/BuildingSketch';
import {
  formatDisplayDate,
  formatMoney,
  getFinancialSummary,
  getMembership,
  getPayments,
  getRecurring,
} from '../utils/portalData';

const QUICK_ACTIONS = [
  { label: 'Make Payment', icon: CreditCard, tab: 'payments' },

  { label: 'Update Profile', icon: User, tab: 'profile' },
  { label: 'View Household', icon: Home, tab: 'household' },
  { label: 'View Membership Details', icon: ShieldCheck, tab: 'membership' },
];

const PROGRESS_RING_RADIUS = 52;
const PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RING_RADIUS;

const ANNOUNCEMENT = {
  title: 'High Holidays are approaching',
  body: "We're preparing for a meaningful High Holidays together. Stay tuned for updates and special programs.",
  tab: 'membership',
};

// Static placeholder, not sourced from CRM data — update the date/label each season.
const UPCOMING_CAMPAIGN = {
  id: 'campaign',
  icon: Gift,
  date: '2026-09-01',
  label: 'High Holidays Campaign',
  badge: 'Upcoming',
  badgeClass: 'purple',
};

function getTimeOfDayGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

function getTransactionIcon(row) {
  const label = `${row.subType || ''} ${row.type || ''} ${row.method || ''}`.toLowerCase();
  if (label.includes('building') || label.includes('bank')) return Landmark;
  if (label.includes('monthly') || label.includes('recurring')) return Calendar;
  return DollarSign;
}

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

  const membership = getMembership(sfData);
  const summary = getFinancialSummary(sfData);
  const payments = getPayments(sfData);
  const recentPayments = payments.slice(0, 4);
  const activeRecurring = getRecurring(sfData).find(
    (item) => ['active', 'finished', 'open'].includes((item.status || '').toLowerCase()),
  ) || getRecurring(sfData)[0];

  const upcomingItems = [];
  if (activeRecurring?.nextDate) {
    upcomingItems.push({
      id: 'next-payment',
      icon: CreditCard,
      date: activeRecurring.nextDate,
      label: 'Next Scheduled Contribution',
      badge: activeRecurring.frequency || 'Scheduled',
      badgeClass: 'blue',
    });
  }
  if (membership.renewalDate) {
    upcomingItems.push({
      id: 'renewal',
      icon: Calendar,
      date: membership.renewalDate,
      label: 'Membership Renewal',
      badge: membership.status || 'Active',
      badgeClass: 'green',
    });
  }
  upcomingItems.push(UPCOMING_CAMPAIGN);

  return (
    <div className="member-dashboard">
      <div className="member-dashboard-main">
        <div className="dash-welcome-card glass-panel">
          <div className="dash-welcome-text">
            <h2>{getTimeOfDayGreeting()}, {firstName}!</h2>
            <p>Here&apos;s what&apos;s important with your membership today.</p>
            <div className="dash-status-badge">
              <ShieldCheck size={16} className="text-success" />
              <span>
                Membership is <strong className="text-success">{membership.status || 'Active'}</strong>
              </span>
            </div>
            {membership.memberSince && (
              <small className="dash-status-since">
                Member since {formatDisplayDate(membership.memberSince)}
              </small>
            )}
          </div>
          <BuildingSketch theme={theme} className="dash-welcome-sketch" />
        </div>

        <div className="dash-balance-row">
          <div className="dash-balance-card glass-panel">
            <div className="dash-balance-icon red"><DollarSign size={20} /></div>
            <span className="dash-stat-label">Outstanding Balance</span>
            <strong className="dash-balance-amount text-danger">{formatMoney(summary.outstanding)}</strong>
            <small>{activeRecurring?.nextDate ? `Due on ${formatDisplayDate(activeRecurring.nextDate)}` : 'No due date scheduled'}</small>
            <button type="button" className="dash-btn-gold" onClick={onDonate}>
              Make a Payment
            </button>
          </div>
          <div className="dash-balance-card glass-panel">
            <div className="dash-balance-icon blue"><Calendar size={20} /></div>
            <span className="dash-stat-label">Next Payment</span>
            <strong className="dash-balance-amount">{activeRecurring?.amount || '—'}</strong>
            <small>{activeRecurring?.nextDate ? `Due on ${formatDisplayDate(activeRecurring.nextDate)}` : 'No scheduled billing'}</small>
            {activeRecurring?.frequency && (
              <span className="dash-schedule-badge blue">{activeRecurring.frequency}</span>
            )}
          </div>
        </div>

        <div className="dash-panel glass-panel">
          <div className="dash-panel-header">
            <h3>Annual Commitment Progress</h3>
          </div>
          <div className="dash-progress-ring-row">
            <div className="dash-progress-ring-wrap">
              <svg viewBox="0 0 120 120" className="dash-progress-ring">
                <circle cx="60" cy="60" r={PROGRESS_RING_RADIUS} className="dash-progress-ring-track" />
                <circle
                  cx="60"
                  cy="60"
                  r={PROGRESS_RING_RADIUS}
                  className="dash-progress-ring-fill"
                  style={{
                    strokeDasharray: PROGRESS_RING_CIRCUMFERENCE,
                    strokeDashoffset: PROGRESS_RING_CIRCUMFERENCE * (1 - summary.progressPct / 100),
                  }}
                />
              </svg>
              <div className="dash-progress-ring-label">
                <strong>{summary.progressPct}%</strong>
                <span>Complete</span>
              </div>
            </div>
            <div className="dash-progress-ring-stats">
              <div className="dash-progress-ring-stat">
                <strong>{formatMoney(summary.contributed)}</strong>
                <span>Paid</span>
              </div>
              <div className="dash-progress-ring-divider" />
              <div className="dash-progress-ring-stat">
                <strong>{formatMoney(summary.annual)}</strong>
                <span>Annual Commitment</span>
              </div>
            </div>
          </div>
          <div className="dash-progress-track">
            <div className="dash-progress-fill" style={{ width: `${summary.progressPct}%` }} />
          </div>
          <div className="dash-progress-footer">
            <span>{formatMoney(summary.outstanding)} remaining</span>
            <span>{summary.progressPct > 0 ? `${summary.progressPct}% of annual commitment` : 'No contribution data yet'}</span>
          </div>
        </div>

        <div className="dash-split-row">
          <div className="dash-panel glass-panel">
            <div className="dash-panel-header">
              <h3>Upcoming</h3>
            </div>
            {upcomingItems.length ? (
              <ul className="dash-upcoming-list">
                {upcomingItems.map((item) => (
                  <li key={item.id} className="dash-upcoming-item">
                    <div className={`dash-upcoming-icon ${item.badgeClass || 'blue'}`}>
                      <item.icon size={16} />
                    </div>
                    <div className="dash-upcoming-info">
                      <strong>{formatDisplayDate(item.date)}</strong>
                      <span>{item.label}</span>
                    </div>
                    <span className={`dash-schedule-badge ${item.badgeClass || 'blue'}`}>{item.badge}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="portal-empty-table">Nothing upcoming.</div>
            )}
            <button type="button" className="dash-view-all" onClick={() => onNavigate('payments')}>
              View all upcoming
            </button>
          </div>

          <div className="dash-panel glass-panel">
            <div className="dash-panel-header">
              <h3>Recent Transactions</h3>
            </div>
            {recentPayments.length ? (
              <ul className="dash-transaction-list">
                {recentPayments.map((row, i) => {
                  const Icon = getTransactionIcon(row);
                  return (
                    <li key={row.id || i} className="dash-transaction-item">
                      <div className="dash-transaction-icon">
                        <Icon size={16} />
                      </div>
                      <div className="dash-transaction-info">
                        <strong>{row.subType || row.type || 'Contribution'}</strong>
                        <span>{formatDisplayDate(row.date)}{row.method ? ` • ${row.method}` : ''}</span>
                      </div>
                      <div className="dash-transaction-amount-col">
                        <strong>{row.amount || '—'}</strong>
                        <span className="badge badge-active">{row.status || 'Paid'}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="portal-empty-table">No payments on file.</div>
            )}
            <button type="button" className="dash-view-all" onClick={() => onNavigate('payments')}>
              View all transactions
            </button>
          </div>
        </div>

        <div className="dash-banner glass-panel">
          <div className="dash-banner-icon"><Megaphone size={22} /></div>
          <div className="dash-banner-text">
            <strong>{ANNOUNCEMENT.title}</strong>
            <p>{ANNOUNCEMENT.body}</p>
          </div>
          <button type="button" className="dash-btn-outline" onClick={() => onNavigate(ANNOUNCEMENT.tab)}>
            Learn More
          </button>
        </div>
      </div>

      {/* <aside className="member-dashboard-rail">
        <div className="dash-rail-card glass-panel">
          <div className="dash-panel-header">
            <h3>Notifications</h3>
            <Bell size={16} />
          </div>
          <div className="portal-empty-table">No notifications yet.</div>
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
      </aside> */}
    </div>
  );
}