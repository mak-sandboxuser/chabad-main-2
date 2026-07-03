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
} from 'lucide-react';
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
  sumPaymentsTotal,
} from '../utils/portalData';

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

  return (
    <div className="member-dashboard">
      <div className="member-dashboard-main">
        <div className="dash-welcome-card glass-panel">
          <div className="dash-welcome-text">
            <h2>Welcome back, {firstName}!</h2>
            <p>Here&apos;s an overview of your membership and financial activity.</p>
          </div>
          <BuildingSketch theme={theme} className="dash-welcome-sketch" />
        </div>

        <div className="dash-stat-row">
          <button type="button" className="dash-stat-card glass-panel" onClick={() => onNavigate('membership')}>
            <div>
              <span className="dash-stat-label">Membership Tier</span>
              <strong>{membership.tier || '—'}</strong>
              <small>{membership.notes || '—'}</small>
            </div>
            <div className="dash-stat-icon gold"><Crown size={20} /></div>
            <ChevronRight size={16} className="dash-stat-chevron" />
          </button>
          <button type="button" className="dash-stat-card glass-panel" onClick={() => onNavigate('membership')}>
            <div>
              <span className="dash-stat-label">Membership Status</span>
              <strong className="text-success">{membership.status || '—'}</strong>
              <small>
                {membership.memberSince
                  ? `Member since ${formatDisplayDate(membership.memberSince)}`
                  : 'Member since —'}
              </small>
            </div>
            <div className="dash-stat-icon green"><ShieldCheck size={20} /></div>
            <ChevronRight size={16} className="dash-stat-chevron" />
          </button>
          <button type="button" className="dash-stat-card glass-panel" onClick={() => onNavigate('financial')}>
            <div>
              <span className="dash-stat-label">Total Contributions</span>
              <strong>{totalContributed}</strong>
              <small>{summary.paymentCount ? `${summary.paymentCount} payments on file` : 'No payments yet'}</small>
            </div>
            <div className="dash-stat-icon blue"><FileText size={20} /></div>
            <ChevronRight size={16} className="dash-stat-chevron" />
          </button>
          <button type="button" className="dash-stat-card glass-panel" onClick={() => onNavigate('household')}>
            <div>
              <span className="dash-stat-label">Household</span>
              <strong>{account.name || '—'}</strong>
              <small>{contacts.length ? `${contacts.length} Members` : 'No members on file'}</small>
            </div>
            <div className="dash-stat-icon purple"><Users size={20} /></div>
            <ChevronRight size={16} className="dash-stat-chevron" />
          </button>
        </div>

        <div className="dash-contribution-card glass-panel">
          <div className="dash-contribution-col">
            <span className="dash-stat-label">Total Contributed (YTD)</span>
            <strong className="dash-contribution-amount text-success">
              {summary.contributedYtd || totalContributed || '$0.00'}
            </strong>
            <small>{summary.paymentCount ? `${summary.paymentCount} cash payments synced from CRM` : 'of $0.00 commitment'}</small>
            <div className="dash-progress-track">
              <div className="dash-progress-fill" style={{ width: `${summary.progressPct}%` }} />
            </div>
            <span className="dash-progress-label">
              {summary.progressPct > 0 ? `${summary.progressPct}% of annual commitment` : 'No contribution data yet'}
            </span>
          </div>
          <div className="dash-contribution-col">
            <span className="dash-stat-label">Outstanding Balance</span>
            <strong className="dash-contribution-amount text-danger">
              {formatMoney(summary.outstanding)}
            </strong>
            <small>{membership.annualCommitment !== '$0.00' ? `of ${membership.annualCommitment || '$0.00'} commitment` : 'No outstanding balance'}</small>
            <button type="button" className="dash-btn-gold" onClick={onDonate}>
              Make Payment
            </button>
          </div>
          <div className="dash-contribution-col">
            <span className="dash-stat-label">Next Scheduled Contribution</span>
            <strong className="dash-contribution-amount">{activeRecurring?.amount || '—'}</strong>
            <small>{activeRecurring?.nextDate ? formatDisplayDate(activeRecurring.nextDate) : 'No scheduled billing'}</small>
            {activeRecurring?.frequency && (
              <span className="dash-schedule-badge">{activeRecurring.frequency}</span>
            )}
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

      <aside className="member-dashboard-rail">
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
      </aside>
    </div>
  );
}
