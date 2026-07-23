import React, { useEffect, useState } from 'react';
import {
  Calendar, Shield, MessageSquare, Mail, Phone, MapPin,
  Pencil, Home, ChevronRight, Trash2, User, ShieldCheck, Heart
} from 'lucide-react';
import PortalPageLayout from '../shared/PortalPageLayout';
import EditFamilyMemberModal from '../shared/EditFamilyMemberModal';
import { fetchPortalApi } from '../../utils/portalApi';
import { formatAddress, getInitials } from '../../utils/portalData';
import {
  displayValue,
  formatProfileDisplayValue,
  sfDataToProfileForm
} from '../../utils/profileForm';

export default function MemberDetailsPage({
  theme,
  member,
  user,
  sfData,
  getAuthToken,
  onNavigate,
  onSfDataUpdate,
}) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);

  const contactId = member?.contactId || member?.id;

  const loadMemberDetails = async (isCancelled) => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchPortalApi('/api/household/member-details', {
        getAuthToken,
        method: 'POST',
        body: { contactId },
      });
      if (!isCancelled()) {
        setDetails(data.member || null);
        if (data.sfData) {
          await onSfDataUpdate?.(data.sfData);
        }
      }
    } catch (err) {
      if (!isCancelled()) {
        setError(err.message);
        setDetails(null);
      }
    } finally {
      if (!isCancelled()) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!contactId?.startsWith('003')) {
      setDetails(null);
      return undefined;
    }

    let cancelled = false;
    const isCancelled = () => cancelled;

    loadMemberDetails(isCancelled);

    return () => {
      cancelled = true;
    };
  }, [contactId, getAuthToken]);

  const handleRefresh = async () => {
    if (contactId?.startsWith('003')) {
      await loadMemberDetails(() => false);
    }
  };

  const accountName = sfData?.account?.name || sfData?.profile?.accountName || 'Household';
  const source = details || member || {};
  const memberForm = sfDataToProfileForm(details || member, member?.email);

  const data = {
    name: source.name || [memberForm.firstName, memberForm.lastName].filter(Boolean).join(' ') || 'Member',
    initials: getInitials(source.name || [memberForm.firstName, memberForm.lastName].filter(Boolean).join(' ')),
    relationship: source.role || 'Member',
    role: source.isPrimary
      ? 'Primary Member'
      : source.isSecondary
        ? 'Secondary Member'
        : source.role || 'Member',
    roleDesc: source.isPrimary
      ? 'Primary household member with full portal access.'
      : 'Active household member linked to this account.',
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
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" className="dash-btn-outline" onClick={() => setShowEditModal(true)}>
            <Pencil size={16} /> Edit Details
          </button>
          {contactId === sfData?.contactId && (
            <button type="button" className="dash-btn-outline" onClick={() => onNavigate('profile')}>
              <User size={16} /> View My Profile
            </button>
          )}
        </div>
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

      {/* Section 1: General Details */}
      <div className="member-details-card glass-panel" style={{ marginBottom: '24px', padding: '24px' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', fontSize: '18px', color: 'var(--color-primary)' }}>
          <User size={20} /> General Details
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
          {[
            { label: 'Salutation', value: memberForm.title },
            { label: 'First Name', value: memberForm.firstName },
            { label: 'Last Name', value: memberForm.lastName },
            { label: 'Nickname', value: memberForm.nickname },
            { label: 'Role in Household', value: data.relationship },
            { label: 'Household Role', value: data.role, badge: true, sub: data.roleDesc },
            { label: 'Salesforce Contact ID', value: data.contactId },
            { label: 'Gender', value: memberForm.gender },
          ].map((row) => (
            <div key={row.label} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '500' }}>{row.label}</span>
              {row.badge ? (
                <div>
                  <span className="badge badge-active" style={{ display: 'inline-block', marginBottom: '4px' }}>{row.value}</span>
                  {row.sub && <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, lineHeight: '1.3' }}>{row.sub}</p>}
                </div>
              ) : (
                <strong style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: '600' }}>{displayValue(row.value)}</strong>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Section 2: Contact & Address Details */}
      <div className="member-details-card glass-panel" style={{ marginBottom: '24px', padding: '24px' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', fontSize: '18px', color: 'var(--color-primary)' }}>
          <MapPin size={20} /> Contact & Address Details
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
          {[
            { label: 'Email Address', value: memberForm.email },
            { label: 'Mobile Number', value: memberForm.phone },
            { label: 'Home Phone', value: memberForm.homePhone },
            { label: 'Street Address', value: memberForm.street },
            { label: 'City', value: memberForm.city },
            { label: 'State', value: memberForm.state },
            { label: 'Postal Code', value: memberForm.postalCode },
            { label: 'Country', value: memberForm.country },
          ].map((row) => (
            <div key={row.label} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '500' }}>{row.label}</span>
              <strong style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: '600' }}>{displayValue(row.value)}</strong>
            </div>
          ))}
        </div>
      </div>

      {/* Section 3: Personal & Hebrew Details */}
      <div className="member-details-card glass-panel" style={{ marginBottom: '24px', padding: '24px' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', fontSize: '18px', color: 'var(--color-primary)' }}>
          <Heart size={20} /> Personal Information
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
          {[
            { label: 'Hebrew Name', value: memberForm.hebrewName },
            { label: "Father's Hebrew Name", value: memberForm.fathersHebrewName },
            { label: "Mother's Hebrew Name", value: memberForm.mothersHebrewName },
            { label: 'Jewish', value: memberForm.jewish },
            { label: 'Birthdate (Civil)', value: formatProfileDisplayValue('birthdate', memberForm.birthdate) },
            { label: 'Birthdate (Hebrew)', value: memberForm.hebrewBirthdate },
            { label: 'Civil Date of Next Hebrew Birthday', value: formatProfileDisplayValue('nextHebrewBirthday', memberForm.nextHebrewBirthday) },
            { label: 'Age', value: memberForm.age },
            { label: 'Wedding Date', value: formatProfileDisplayValue('weddingDate', memberForm.weddingDate) },
            { label: 'Status', value: memberForm.lifecycleStatus },
          ].map((row) => (
            <div key={row.label} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '500' }}>{row.label}</span>
              <strong style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: '600' }}>{displayValue(row.value)}</strong>
            </div>
          ))}
        </div>
      </div>

      <EditFamilyMemberModal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        member={details || member}
        user={user}
        getAuthToken={getAuthToken}
        sfData={sfData}
        onSuccess={async (nextSfData) => {
          if (nextSfData) {
            await onSfDataUpdate?.(nextSfData);
          }
          await handleRefresh();
        }}
      />
    </PortalPageLayout>
  );
}
