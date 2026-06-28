import React, { useState } from 'react';
import {
  Home, Users, User, Phone, Mail, MapPin, Lock,
} from 'lucide-react';
import PortalPageLayout from '../shared/PortalPageLayout';
import SectionTabs from '../shared/SectionTabs';
import ContactsTable from '../shared/ContactsTable';
import DataTable from '../shared/DataTable';
import {
  formatAddress,
  formatDisplayDate,
  getAccount,
  getContacts,
  getRelationships,
} from '../../utils/portalData';

const TABS = [
  { id: 'profile', label: 'Profile', icon: Home },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'relationships', label: 'Relationships', icon: User },
];

export default function HouseholdPage({ theme, sfData, onNavigate, onViewMember, onDonate }) {
  const [activeTab, setActiveTab] = useState('contacts');
  const account = getAccount(sfData);
  const contacts = getContacts(sfData);
  const relationships = getRelationships(sfData);
  const primaryContact = contacts.find((c) => c.isPrimary) || contacts[0];

  return (
    <PortalPageLayout
      theme={theme}
      title={account.name}
      subtitle="Household profile, contacts, and relationships."
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
            <span className="account-header-type">Account</span>
            <h2>{account.name}</h2>
            <div className="account-header-meta">
              {account.phone && <span><Phone size={14} /> {account.phone}</span>}
              {account.email && <span><Mail size={14} /> {account.email}</span>}
              <span><MapPin size={14} /> {formatAddress(account)}</span>
            </div>
          </div>
        </div>
        <div className="account-header-actions">
          <button type="button" className="dash-btn-gold" onClick={onDonate}>
            <Lock size={16} /> Quick Payment
          </button>
        </div>
      </div>

      <div className="section-card glass-panel">
        <SectionTabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

        <div className="section-panel section-panel--flush">
          {activeTab === 'profile' && (
            <div className="profile-tab-form-grid section-panel-inner">
              <div className="profile-field">
                <label className="profile-field-label">Account Name</label>
                <div className="profile-field-box">{account.name}</div>
              </div>
              <div className="profile-field">
                <label className="profile-field-label">Phone</label>
                <div className="profile-field-box">{account.phone || '—'}</div>
              </div>
              <div className="profile-field profile-field--full">
                <label className="profile-field-label">Shipping Address</label>
                <div className="profile-field-box">{formatAddress(account)}</div>
              </div>
              <div className="profile-field">
                <label className="profile-field-label">Primary Member</label>
                <div className="profile-field-box">{primaryContact?.name || sfData?.name || '—'}</div>
              </div>
              <div className="profile-field">
                <label className="profile-field-label">Member Since</label>
                <div className="profile-field-box">{formatDisplayDate(sfData?.membership?.memberSince || sfData?.joinedDate)}</div>
              </div>
              <div className="profile-field">
                <label className="profile-field-label">Household Members</label>
                <div className="profile-field-box">{contacts.length}</div>
              </div>
              <div className="profile-field">
                <label className="profile-field-label">Salesforce Contact ID</label>
                <div className="profile-field-box">{sfData?.contactId || '—'}</div>
              </div>
            </div>
          )}

          {activeTab === 'contacts' && (
            <ContactsTable contacts={contacts} onSelectContact={onViewMember} />
          )}

          {activeTab === 'relationships' && (
            <div className="section-panel-inner">
              <div className="section-panel-header">
                <h3>All Relationships</h3>
                <span className="section-count">{relationships.length} items</span>
              </div>
              <DataTable
                emptyMessage="No relationships found for this household."
                rows={relationships}
                columns={[
                  { key: 'person1', label: 'Related Person' },
                  { key: 'person2', label: 'Person (Contact)' },
                  { key: 'status', label: 'Status' },
                  { key: 'type', label: 'Type' },
                  { key: 'explanation', label: 'Relationship Explanation' },
                ]}
              />
            </div>
          )}
        </div>
      </div>
    </PortalPageLayout>
  );
}
