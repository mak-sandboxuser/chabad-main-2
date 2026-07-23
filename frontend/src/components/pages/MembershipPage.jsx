import React, { useEffect } from 'react';
import {
  ShieldCheck, Calendar, CircleDollarSign, Gem,
  FileText, Users,
} from 'lucide-react';
import PortalPageLayout from '../shared/PortalPageLayout';
import { fetchPortalApi } from '../../utils/portalApi';
import { formatDisplayDate, getFinancialSummary, getMembership, getContacts } from '../../utils/portalData';

export default function MembershipPage({ theme, sfData, getAuthToken, onHouseholdUpdated, onNavigate, onDonate }) {
  const membership = getMembership(sfData);
  const summary = getFinancialSummary(sfData);
  const contacts = getContacts(sfData);

  useEffect(() => {
    if (!getAuthToken) return;
    let cancelled = false;

    const loadHouseholdData = async () => {
      try {
        const data = await fetchPortalApi('/api/household/data', {
          getAuthToken,
          method: 'POST',
        });
        if (!cancelled && data.sfData) {
          await onHouseholdUpdated?.(data.sfData);
        }
      } catch (err) {
        // ignore background fetch errors
      }
    };

    loadHouseholdData();

    return () => {
      cancelled = true;
    };
  }, [getAuthToken, onHouseholdUpdated]);

  const getDatesFromTier = (tierStr) => {
    const raw = String(tierStr || '');
    const match = raw.match(/(\d{2})[-/](\d{2})/);
    if (match) {
      const startYear = 2000 + parseInt(match[1], 10);
      const endYear = 2000 + parseInt(match[2], 10);
      return {
        startDate: `1 September ${startYear}`,
        endDate: `31 August ${endYear}`,
      };
    }
    return {
      startDate: membership.startDate ? formatDisplayDate(membership.startDate) : '1 September 2025',
      endDate: membership.endDate ? formatDisplayDate(membership.endDate) : '31 August 2026',
    };
  };

  const dates = getDatesFromTier(membership.tier);

  const stats = [
    { label: 'Group', value: membership.tier || '—', sub: membership.status || '—', icon: Gem, badge: membership.tier || '—', badgeClass: 'blue' },
    { label: 'Status', value: membership.status, sub: 'In good standing', icon: ShieldCheck, valueClass: 'text-success' },
    { label: 'Start Date', value: dates.startDate, sub: '1 September', icon: Calendar },
    { label: 'End Date', value: dates.endDate, sub: '31 August', icon: Calendar },
  ];


  const details = [
    {
      icon: Calendar,
      label: 'Start Date',
      value: dates.startDate,
      sub: null,
      action: null,
    },
    {
      icon: Calendar,
      label: 'End Date',
      value: dates.endDate,
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
      title={membership.tier?.toLowerCase().includes('membership') ? membership.tier : `${membership.tier} Membership`}
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

          <div className="membership-details-card glass-panel" style={{ marginTop: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <Users size={20} className="text-accent" />
              <h3 style={{ margin: 0 }}>Household Members</h3>
            </div>
            <div className="table-wrapper">
              <table className="members-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th style={{ textAlign: 'center', width: '120px' }}>Edit Profile</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.length > 0 ? (
                    contacts.map((contact) => {
                      const displayRole = contact.isPrimary || contact.isSecondary ? 'Parent' : (contact.role || 'Member');
                      return (
                        <tr key={contact.id || contact.contactId || contact.name}>
                          <td style={{ fontWeight: '500' }}>{contact.name}</td>
                          <td style={{ color: 'var(--text-secondary)' }}>{contact.email || '—'}</td>
                          <td>{displayRole}</td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="dash-btn-icon-only"
                              onClick={() => setEditingMember(contact)}
                              aria-label={`Edit ${contact.name}`}
                              title="Edit Profile"
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--color-primary)',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '6px',
                                borderRadius: '4px',
                                transition: 'background 0.2s',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                            >
                              <Edit size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className="portal-empty-table">
                        No household contacts found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </PortalPageLayout>
  );
}
