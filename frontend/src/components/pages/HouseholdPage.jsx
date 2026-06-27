import React from 'react';
import {
  Home, Users, ShieldCheck, Calendar, RefreshCw,
  Plus, Pencil, CreditCard, Crown, ChevronRight, MapPin, User, Phone, Mail,
} from 'lucide-react';
import PortalPageLayout from '../shared/PortalPageLayout';

const MEMBERS = [
  { id: 'john', name: 'John Doe', initials: 'JD', role: 'Primary Member', tagClass: 'owner', icon: Crown },
  { id: 'sarah', name: 'Sarah Doe', initials: 'SD', role: 'Spouse', tagClass: 'relation' },
  { id: 'levi', name: 'Levi Doe', initials: 'LD', role: 'Child', tagClass: 'relation' },
  { id: 'miriam', name: 'Miriam Doe', initials: 'MD', role: 'Child', tagClass: 'relation' },
];

export default function HouseholdPage({ theme, sfData, onNavigate, onViewMember }) {
  const householdName = sfData?.profile?.accountName || 'Doe Family Household';
  const primaryName = sfData?.name || 'John Doe';

  return (
    <PortalPageLayout
      theme={theme}
      title="Household Overview"
      subtitle="Manage your household and members."
      showSketch={false}
    >
      <div className="household-summary-banner glass-panel">
        <div className="household-summary-left">
          <div className="household-summary-icon"><Home size={28} /></div>
          <div>
            <h3>{householdName}</h3>
            <span className="badge badge-active">Active Household</span>
            <div className="household-summary-meta">
              <span><Users size={14} /> 4 Members</span>
              <span>Member Since Jan 15, 2024</span>
              <span>Primary Member: {primaryName}</span>
            </div>
          </div>
        </div>
        <div className="household-summary-actions">
          <button type="button" className="dash-btn-gold"><Plus size={16} /> Add Family Member</button>
          <button type="button" className="dash-btn-outline"><Pencil size={16} /> Edit Household</button>
          <button type="button" className="dash-btn-outline" onClick={() => onNavigate('membership')}>
            <CreditCard size={16} /> View Membership
          </button>
        </div>
      </div>

      <div className="dash-stat-row household-metrics">
        {[
          { label: 'Total Members', value: '4', sub: '2 Adults • 2 Children', icon: Users },
          { label: 'Household Status', value: 'Active', sub: 'In good standing', icon: ShieldCheck, valueClass: 'text-success' },
          { label: 'Member Since', value: 'Jan 15, 2024', sub: '16 months', icon: Calendar },
          { label: 'Next Renewal', value: 'Jan 1, 2026', sub: '152 days remaining', icon: RefreshCw, subClass: 'text-warn' },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="dash-stat-card glass-panel static">
              <Icon size={18} className="membership-stat-icon" />
              <span className="dash-stat-label">{s.label}</span>
              <strong className={s.valueClass}>{s.value}</strong>
              <small className={s.subClass}>{s.sub}</small>
            </div>
          );
        })}
      </div>

      <div className="dash-panel glass-panel">
        <div className="dash-panel-header">
          <div>
            <h3>Household Members</h3>
            <p className="panel-subtitle">The people in your household.</p>
          </div>
        </div>
        <ul className="household-member-list">
          {MEMBERS.map((m) => (
            <li key={m.id}>
              <button type="button" className="household-member-row" onClick={() => onViewMember(m)}>
                <div className="dash-household-avatar">{m.initials}</div>
                <span className="household-member-name">{m.name}</span>
                <span className={`dash-role-tag ${m.tagClass}`}>
                  {m.icon && <Crown size={12} />} {m.role}
                </span>
                <ChevronRight size={18} className="row-chevron" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="dash-panel glass-panel">
        <h3>Household Information</h3>
        <div className="household-info-grid">
          <div className="household-info-item">
            <MapPin size={18} />
            <div>
              <span className="info-label">Address</span>
              <p>{sfData?.profile?.street || '123 Bedford Road'}, {sfData?.profile?.city || 'Bedford'}, {sfData?.profile?.state || 'NY'} {sfData?.profile?.postalCode || '10506'}, {sfData?.profile?.country || 'United States'}</p>
            </div>
          </div>
          <div className="household-info-item">
            <User size={18} />
            <div>
              <span className="info-label">Primary Member</span>
              <p>{primaryName}</p>
              <p className="info-sub">{userEmail(sfData, 'john.doe@example.com')}</p>
              <p className="info-sub">{sfData?.profile?.phone || '(914) 555-1234'}</p>
            </div>
          </div>
          <div className="household-info-item">
            <Calendar size={18} />
            <div>
              <span className="info-label">Member Since</span>
              <p>January 15, 2024</p>
              <p className="info-sub">16 months</p>
            </div>
          </div>
        </div>
      </div>
    </PortalPageLayout>
  );
}

function userEmail(sfData, fallback) {
  return sfData?.profile?.email || fallback;
}
