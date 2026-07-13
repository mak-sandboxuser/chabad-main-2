import React, { useEffect, useState } from 'react';
import {
  Calendar, Shield, MessageSquare, Mail, Phone, MapPin,
  Pencil, Home, ChevronRight, Trash2, User, ShieldCheck,
} from 'lucide-react';
import PortalPageLayout from '../shared/PortalPageLayout';
import { fetchPortalApi } from '../../utils/portalApi';
import { formatAddress, getInitials } from '../../utils/portalData';

export default function MemberDetailsPage({
  theme,
  member,
  sfData,
  getAuthToken,
  onNavigate,
  onSfDataUpdate,
}) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const contactId = member?.contactId || member?.id;

  useEffect(() => {
    if (!contactId?.startsWith('003')) {
      setDetails(null);
      return undefined;
    }

    let cancelled = false;

    const loadMemberDetails = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchPortalApi('/api/household/member-details', {
          getAuthToken,
          method: 'POST',
          body: { contactId },
        });
        if (!cancelled) {
          setDetails(data.member || null);
          if (data.sfData) {
            await onSfDataUpdate?.(data.sfData);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setDetails(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadMemberDetails();

    return () => {
      cancelled = true;
    };
  }, [contactId, getAuthToken]);

  const accountName = sfData?.account?.name || sfData?.profile?.accountName || 'Household';
  const source = details || member || {};
  const data = {
    name: source.name || 'Member',
    initials: getInitials(source.name),
    relationship: source.role || 'Member',
    role: source.isPrimary
      ? 'Primary Member'
      : source.isSecondary
        ? 'Secondary Member'
        : source.role || 'Member',
    roleDesc: source.isPrimary
      ? 'Primary household member with full portal access.'
      : 'Active household member linked to this account.',
    email: source.email || sfData?.email || '—',
    phone: source.phone || sfData?.profile?.phone || '—',
    address: formatAddress({
      street: source.street || sfData?.profile?.street,
      city: source.city || sfData?.profile?.city,
      state: source.state || sfData?.profile?.state,
      postalCode: source.postalCode || sfData?.profile?.postalCode,
      country: source.country || sfData?.profile?.country,
    }) || '—',
    since: sfData?.membership?.memberSince || sfData?.joinedDate || '—',
    contactId: source.contactId || contactId || '—',
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
      {loading && (
        <p className="section-panel-inner text-muted">Loading member details from Salesforce…</p>
      )}
      {error && (
        <p className="section-panel-inner text-danger">{error}</p>
      )}

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
