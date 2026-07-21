import React, { useEffect, useState } from 'react';
import {
  Home, Users, Phone, Mail, MapPin, Lock, UserPlus,
} from 'lucide-react';
import PortalPageLayout from '../shared/PortalPageLayout';
import SectionTabs from '../shared/SectionTabs';
import ContactsTable from '../shared/ContactsTable';
import AddFamilyMemberModal from '../shared/AddFamilyMemberModal';
import EditFamilyMemberModal from '../shared/EditFamilyMemberModal';
import { fetchPortalApi } from '../../utils/portalApi';
import {
  formatAddress,
  getAccount,
  getContacts,
  getHouseholdAccountContext,
} from '../../utils/portalData';

const TABS = [
  { id: 'profile', label: 'Household Profile', icon: Home },
  { id: 'contacts', label: 'Household Members', icon: Users },
];

export default function HouseholdPage({
  theme,
  sfData,
  user,
  getAuthToken,
  onNavigate,
  onViewMember,
  onDonate,
  onHouseholdUpdated,
}) {
  const [activeTab, setActiveTab] = useState('contacts');
  const [showAddFamilyModal, setShowAddFamilyModal] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [householdLoading, setHouseholdLoading] = useState(false);
  const [householdError, setHouseholdError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadHouseholdData = async () => {
      setHouseholdLoading(true);
      setHouseholdError('');
      try {
        const data = await fetchPortalApi('/api/household/data', {
          getAuthToken,
          method: 'POST',
        });
        if (!cancelled && data.sfData) {
          await onHouseholdUpdated?.(data.sfData);
        }
      } catch (err) {
        if (!cancelled) {
          setHouseholdError(err.message);
        }
      } finally {
        if (!cancelled) {
          setHouseholdLoading(false);
        }
      }
    };

    loadHouseholdData();

    return () => {
      cancelled = true;
    };
  }, [getAuthToken]);

  const account = getAccount(sfData);
  const contacts = getContacts(sfData);
  const household = getHouseholdAccountContext(sfData);
  const { primaryContact, secondaryContact, memberCount } = household;

  return (
    <PortalPageLayout
      theme={theme}
      breadcrumbs={[
        { label: 'Dashboard', onClick: () => onNavigate('dashboard') },
        { label: 'Household' },
      ]}
      showSketch={false}
    >
      <div className="account-header-card glass-panel">
        <div className="account-header-main">
          <div className="account-header-icon"><Home size={24} /></div>
          <div>
            <span className="account-header-type">Household Account</span>
            <h2>{account.name}</h2>
            <div className="account-header-meta">
              {account.phone && <span><Phone size={14} /> {account.phone}</span>}
              {account.email && <span><Mail size={14} /> {account.email}</span>}
              <span><MapPin size={14} /> {formatAddress(account)}</span>
            </div>
          </div>
        </div>
        <div className="account-header-actions">
          <button type="button" className="dash-btn-outline" onClick={() => setShowAddFamilyModal(true)}>
            <UserPlus size={16} /> Add Family Members
          </button>
          <button type="button" className="dash-btn-gold" onClick={onDonate}>
            <Lock size={16} /> General Payment
          </button>
        </div>
      </div>

      <div className="section-card glass-panel">
        <SectionTabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

        {householdLoading && (
          <p className="section-panel-inner text-muted">Loading household contacts from Salesforce…</p>
        )}
        {householdError && (
          <p className="section-panel-inner text-danger">{householdError}</p>
        )}

        <div className="section-panel section-panel--flush">
          {activeTab === 'profile' && (
            <div className="profile-tab-form-grid section-panel-inner">
              <div className="profile-field">
                <label className="profile-field-label">Account Name</label>
                <div className="profile-field-box">{account.name}</div>
              </div>
              <div className="profile-field">
                <label className="profile-field-label">Household Total Members</label>
                <div className="profile-field-box">{memberCount}</div>
              </div>
              <div className="profile-field profile-field--full">
                <label className="profile-field-label">Address</label>
                <div className="profile-field-box">{formatAddress(account)}</div>
              </div>
            </div>
          )}

          {activeTab === 'contacts' && (
            <ContactsTable contacts={contacts} onSelectContact={(member) => setEditingMember(member)} />
          )}
        </div>
      </div>

      <AddFamilyMemberModal
        open={showAddFamilyModal}
        onClose={() => setShowAddFamilyModal(false)}
        user={user}
        getAuthToken={getAuthToken}
        sfData={sfData}
        onSuccess={async (nextSfData) => {
          if (nextSfData) {
            await onHouseholdUpdated?.(nextSfData);
          } else {
            await onHouseholdUpdated?.();
          }
        }}
      />

      {editingMember && (
        <EditFamilyMemberModal
          open={Boolean(editingMember)}
          onClose={() => setEditingMember(null)}
          member={editingMember}
          user={user}
          getAuthToken={getAuthToken}
          sfData={sfData}
          onSuccess={async (nextSfData) => {
            if (nextSfData) {
              await onHouseholdUpdated?.(nextSfData);
            } else {
              await onHouseholdUpdated?.();
            }
          }}
        />
      )}
    </PortalPageLayout>
  );
}
