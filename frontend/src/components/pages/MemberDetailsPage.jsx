import React from 'react';
import {
  Calendar, Shield, MessageSquare, Mail, Phone, MapPin,
  Pencil, Home, ChevronRight, Trash2, User, ShieldCheck,
} from 'lucide-react';
import PortalPageLayout from '../shared/PortalPageLayout';
import { getInitials } from '../../utils/portalData';

export default function MemberDetailsPage({ theme, member, sfData, onNavigate }) {
  const accountName = sfData?.account?.name || sfData?.profile?.accountName || 'Household';
  const data = {
    name: member?.name || 'Member',
    initials: getInitials(member?.name),
    relationship: member?.role || 'Member',
    role: member?.isPrimary ? 'Primary Member' : member?.isSecondary ? 'Secondary Member' : member?.role || 'Member',
    roleDesc: member?.isPrimary
      ? 'Primary household member with full portal access.'
      : 'Active household member linked to this account.',
    email: member?.email || sfData?.email || '—',
    phone: member?.phone || sfData?.profile?.phone || '—',
    address: [
      sfData?.profile?.street,
      [sfData?.profile?.city, sfData?.profile?.state, sfData?.profile?.postalCode].filter(Boolean).join(', '),
      sfData?.profile?.country,
    ].filter(Boolean).join(', ') || '—',
    since: sfData?.membership?.memberSince || sfData?.joinedDate || '—',
    contactId: member?.contactId || '—',
  };

  return (
    <PortalPageLayout
      theme={theme}
      title=""
      subtitle=""
      showSketch={false}
      breadcrumbs={[
        { label: 'Household', onClick: () => onNavigate('household') },
        { label: accountName, onClick: () => onNavigate('household') },
        { label: data.name },
      ]}
    >
      <div className="member-profile-card glass-panel">
        <div className="member-profile-avatar lg">{data.initials}</div>
        <div className="member-profile-info">
          <h2>{data.name}</h2>
          <div className="member-badges">
            <span className="role-badge blue"><User size={12} /> {data.relationship}</span>
            <span className="badge badge-active"><ShieldCheck size={12} /> Active Member</span>
          </div>
          <p className="member-since"><Calendar size={14} /> Member since {data.since}</p>
        </div>
        <button type="button" className="dash-btn-outline" onClick={() => onNavigate('profile')}>
          <Pencil size={16} /> View Profile
        </button>
      </div>

      <div className="member-household-link glass-panel">
        <div className="member-household-link-icon"><Home size={18} /></div>
        <div>
          <strong>{accountName}</strong>
          <p className="text-success">{sfData?.contacts?.length || 1} Members • Active Household</p>
        </div>
        <button type="button" className="portal-text-link" onClick={() => onNavigate('household')}>
          View Household <ChevronRight size={14} />
        </button>
      </div>

      <div className="member-details-card glass-panel">
        <h3>Member Details</h3>
        {[
          { icon: User, label: 'Role', value: data.relationship },
          { icon: Shield, label: 'Household Role', value: data.role, badge: true, sub: data.roleDesc },
          { icon: MessageSquare, label: 'Salesforce Contact ID', value: data.contactId },
          { icon: Mail, label: 'Email Address', value: data.email },
          { icon: Phone, label: 'Mobile Number', value: data.phone },
          { icon: MapPin, label: 'Mailing Address', value: data.address },
        ].map((row) => {
          const Icon = row.icon;
          return (
            <div key={row.label} className="member-detail-row">
              <Icon size={18} />
              <div className="member-detail-body">
                <span>{row.label}</span>
                {row.badge ? (
                  <>
                    <span className="badge badge-active">{row.value}</span>
                    {row.sub && <small>{row.sub}</small>}
                  </>
                ) : (
                  <strong>{row.value}</strong>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="member-danger-card glass-panel">
        <div className="member-danger-icon"><Trash2 size={20} /></div>
        <div>
          <strong className="text-danger">Remove from Household</strong>
          <p>This will remove {data.name} from the {accountName} household.</p>
        </div>
        <button type="button" className="btn-danger-outline">Remove Member</button>
      </div>
    </PortalPageLayout>
  );
}
