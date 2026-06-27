import React from 'react';
import {
  Calendar, Shield, MessageSquare, Mail, Phone, MapPin,
  Pencil, Home, ChevronRight, Trash2, User, ShieldCheck,
} from 'lucide-react';
import PortalPageLayout from '../shared/PortalPageLayout';

const MEMBER_DATA = {
  sarah: {
    name: 'Sarah Doe',
    initials: 'SD',
    relationship: 'Spouse',
    role: 'Member',
    roleDesc: 'Active household member with full access to member benefits.',
    dob: 'August 24, 1982',
    contact: 'Email',
    email: 'sarah.doe@example.com',
    phone: '(914) 555-1234',
    address: '123 Bedford Road, Bedford, NY 10506, United States',
    since: 'Jan 15, 2024',
    months: '16 months',
  },
};

export default function MemberDetailsPage({ theme, member, onNavigate }) {
  const data = MEMBER_DATA[member?.id] || MEMBER_DATA.sarah;

  return (
    <PortalPageLayout
      theme={theme}
      title=""
      subtitle=""
      showSketch={false}
      breadcrumbs={[
        { label: 'Household', onClick: () => onNavigate('household') },
        { label: 'Doe Family', onClick: () => onNavigate('household') },
        { label: 'Member Details' },
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
          <p className="member-since"><Calendar size={14} /> Member since {data.since} • {data.months}</p>
        </div>
        <button type="button" className="dash-btn-outline"><Pencil size={16} /> Edit Member</button>
      </div>

      <div className="member-household-link glass-panel">
        <div className="member-household-link-icon"><Home size={18} /></div>
        <div>
          <strong>Doe Family Household</strong>
          <p className="text-success">4 Members • Active Household</p>
        </div>
        <button type="button" className="portal-text-link" onClick={() => onNavigate('household')}>
          View Household <ChevronRight size={14} />
        </button>
      </div>

      <div className="member-details-card glass-panel">
        <h3>Member Details</h3>
        {[
          { icon: User, label: 'Relationship', value: data.relationship },
          { icon: Shield, label: 'Household Role', value: data.role, badge: true, sub: data.roleDesc },
          { icon: Calendar, label: 'Date of Birth', value: data.dob },
          { icon: MessageSquare, label: 'Preferred Contact Method', value: data.contact },
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
          <p>This will remove {data.name} from the Doe Family household.</p>
        </div>
        <button type="button" className="btn-danger-outline">Remove Member</button>
      </div>
    </PortalPageLayout>
  );
}
