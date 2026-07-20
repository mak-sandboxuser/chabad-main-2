import React, { useEffect, useMemo, useState } from 'react';
import {
  Users, X, Loader2, Save, User, MapPin, Heart
} from 'lucide-react';
import { fetchPortalApi } from '../../utils/portalApi';
import { showToast } from '../../utils/toast';
import {
  GENDER_OPTIONS,
  HOUSEHOLD_GROUP_OPTIONS,
  MEMBER_TYPES,
  SALUTATIONS,
} from '../../constants/householdMembers';
import { getHouseholdAccountContext } from '../../utils/portalData';
import { getHouseholdParentCapacity } from '../../utils/householdMemberRules';
import {
  EMPTY_PROFILE_FORM,
  sfDataToProfileForm,
  profileFormToPayload,
} from '../../utils/profileForm';

const TABS = [
  { id: 'general', label: 'General Details', icon: User },
  { id: 'address', label: 'Address Details', icon: MapPin },
  { id: 'personal', label: 'Personal Information', icon: Heart },
];

export default function EditFamilyMemberModal({
  open,
  onClose,
  member,
  user,
  getAuthToken,
  sfData,
  onSuccess,
}) {
  const [activeTab, setActiveTab] = useState('general');
  const [form, setForm] = useState({
    ...EMPTY_PROFILE_FORM,
    email: '',
    memberType: 'child',
    groups: '',
  });

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !member) return;

    const profileForm = sfDataToProfileForm(member, member.email);
    const mType = member.isPrimary ? 'primary' : member.isSecondary ? 'secondary' : 'child';

    setForm({
      ...profileForm,
      memberType: mType,
      groups: member.groups || member.group || '',
    });
    setActiveTab('general');
    setSubmitting(false);
  }, [open, member]);

  const household = useMemo(() => getHouseholdAccountContext(sfData), [sfData]);
  const accountName = household.accountName;
  const householdAccountId = household.householdAccountId;

  const parentCapacity = useMemo(() => getHouseholdParentCapacity(household), [household]);

  // Compute member type availability based on current role slot usage, but ignore the member being edited
  const currentRole = member?.isPrimary ? 'primary' : member?.isSecondary ? 'secondary' : 'child';
  const roleAvailability = useMemo(() => {
    return {
      primary: {
        enabled: currentRole === 'primary' || parentCapacity.canAddPrimary,
        reason: !parentCapacity.canAddPrimary && currentRole !== 'primary'
          ? 'Primary parent is already set on this account.'
          : '',
      },
      secondary: {
        enabled: currentRole === 'secondary' || parentCapacity.canAddSecondary,
        reason: !parentCapacity.canAddSecondary && currentRole !== 'secondary'
          ? 'Secondary parent is already set on this account.'
          : '',
      },
      child: {
        enabled: true,
        reason: '',
      },
    };
  }, [parentCapacity, currentRole]);

  if (!open || !member) return null;

  const handleClose = () => {
    if (!submitting) onClose();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) {
      showToast({ message: 'First Name and Last Name are required.', type: 'error' });
      return;
    }

    // Role validation
    if (form.memberType === 'primary' && !roleAvailability.primary.enabled) {
      showToast({ message: roleAvailability.primary.reason, type: 'error' });
      return;
    }
    if (form.memberType === 'secondary' && !roleAvailability.secondary.enabled) {
      showToast({ message: roleAvailability.secondary.reason, type: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      const contactId = member.contactId || member.id;
      const data = await fetchPortalApi('/api/household/update-member', {
        getAuthToken,
        method: 'POST',
        body: {
          contactId,
          memberType: form.memberType,
          groups: form.groups,
          email: form.email?.trim() || '',
          ...profileFormToPayload(form),
        },
      });

      showToast({ message: data.message || 'Household member details updated.', type: 'success' });
      if (onSuccess) {
        await onSuccess(data.sfData);
      }
      onClose();
    } catch (err) {
      showToast({ message: err.message, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const inputProps = (key, { required = false, placeholder = '', type = 'text' } = {}) => ({
    type,
    className: 'profile-field-input',
    value: form[key] || '',
    onChange: (e) => setForm((prev) => ({ ...prev, [key]: e.target.value })),
    required,
    placeholder,
  });

  const selectProps = (key) => ({
    className: 'profile-field-input profile-field-select',
    value: form[key] || '',
    onChange: (e) => setForm((prev) => ({ ...prev, [key]: e.target.value })),
  });

  const renderMemberTypeToggle = () => (
    <div className="add-family-member-type-toggle" style={{ marginTop: '8px' }}>
      {MEMBER_TYPES.map((type) => {
        const option = roleAvailability[type.id];
        return (
          <button
            key={type.id}
            type="button"
            className={form.memberType === type.id ? 'active' : ''}
            disabled={!option.enabled}
            title={option.reason || type.label}
            onClick={() => option.enabled && setForm((prev) => ({ ...prev, memberType: type.id }))}
          >
            {type.label}
          </button>
        );
      })}
    </div>
  );

  const renderParentRulesBanner = () => (
    <div className="add-family-rules-banner" style={{ marginTop: '8px' }}>
      <p>
        <strong>Parent rules:</strong>
        {parentCapacity.parentsFull && currentRole === 'child'
          ? ' Both parent slots are already filled — cannot elevate role.'
          : !parentCapacity.canAddPrimary && parentCapacity.canAddSecondary && currentRole === 'child'
            ? ' Primary parent slot is filled — you can set Secondary parent.'
            : parentCapacity.canAddPrimary && !parentCapacity.canAddSecondary && currentRole === 'child'
              ? ' Secondary parent slot is filled — you can set Primary parent.'
              : ' You can set Primary, Secondary, or Child.'}
      </p>
    </div>
  );

  return (
    <div className="portal-modal-backdrop add-family-modal-backdrop" onClick={handleClose}>
      <div
        className="portal-modal glass-panel add-family-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-member-title"
        style={{ maxWidth: '750px', width: '90%' }}
      >
        {submitting && (
          <div className="add-family-loading-overlay" aria-live="polite">
            <Loader2 size={32} className="add-family-spinner" />
            <span>Updating Salesforce CRM...</span>
          </div>
        )}
        <div className="portal-modal-header">
          <h2 id="edit-member-title">
            <Users size={20} /> Edit Household Member
          </h2>
          <button type="button" className="portal-modal-close" onClick={handleClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="add-family-account-banner">
          <span className="add-family-account-label">Account</span>
          <strong>{accountName}</strong>
          <span className="add-family-account-id">{householdAccountId || 'Account ID unavailable'}</span>
        </div>

        <div className="profile-tabs" role="tablist" style={{ marginBottom: '20px', borderBottom: '1px solid var(--border-color)' }}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              className={`profile-tab ${activeTab === id ? 'active' : ''}`}
              onClick={() => setActiveTab(id)}
              style={{ padding: '12px 16px', background: 'none', border: 'none', borderBottom: activeTab === id ? '2px solid var(--color-accent)' : 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', color: activeTab === id ? 'var(--color-accent)' : 'var(--text-secondary)' }}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="add-family-form-grid" style={{ maxHeight: '55vh', overflowY: 'auto', paddingRight: '8px' }}>
            {activeTab === 'general' && (
              <>
                <div className="profile-field">
                  <label className="profile-field-label">Salutation</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <select className="profile-field-input profile-field-select" {...selectProps('title')}>
                      <option value="">-- Select --</option>
                      {SALUTATIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </div>
                </div>
                <div className="profile-field">
                  <label className="profile-field-label">Gender</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <select className="profile-field-input profile-field-select" {...selectProps('gender')}>
                      <option value="">--None--</option>
                      {GENDER_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </div>
                </div>
                <div className="profile-field">
                  <label className="profile-field-label">First Name *</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <input {...inputProps('firstName', { required: true })} />
                  </div>
                </div>
                <div className="profile-field">
                  <label className="profile-field-label">Last Name *</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <input {...inputProps('lastName', { required: true })} />
                  </div>
                </div>
                <div className="profile-field">
                  <label className="profile-field-label">Nickname</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <input {...inputProps('nickname')} />
                  </div>
                </div>
                <div className="profile-field">
                  <label className="profile-field-label">Email</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <input {...inputProps('email', { type: 'email' })} />
                  </div>
                </div>
                <div className="profile-field">
                  <label className="profile-field-label">Mobile Phone</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <input {...inputProps('phone', { type: 'tel' })} />
                  </div>
                </div>
                <div className="profile-field">
                  <label className="profile-field-label">Home Phone</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <input {...inputProps('homePhone', { type: 'tel' })} />
                  </div>
                </div>

                <div style={{ gridColumn: 'span 2', padding: '8px 0' }}>
                  <label className="profile-field-label">Relationship in household</label>
                  {renderParentRulesBanner()}
                  {renderMemberTypeToggle()}
                </div>

                <div className="profile-field" style={{ gridColumn: 'span 2' }}>
                  <label className="profile-field-label">Select groups</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <select className="profile-field-input profile-field-select" {...selectProps('groups')}>
                      <option value="">Select a value</option>
                      {HOUSEHOLD_GROUP_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'address' && (
              <>
                <div className="profile-field" style={{ gridColumn: 'span 2' }}>
                  <label className="profile-field-label">Street Address</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <input {...inputProps('street')} />
                  </div>
                </div>
                <div className="profile-field">
                  <label className="profile-field-label">City</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <input {...inputProps('city')} />
                  </div>
                </div>
                <div className="profile-field">
                  <label className="profile-field-label">State</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <input {...inputProps('state')} />
                  </div>
                </div>
                <div className="profile-field">
                  <label className="profile-field-label">Postal Code</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <input {...inputProps('postalCode')} />
                  </div>
                </div>
                <div className="profile-field">
                  <label className="profile-field-label">Country</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <input {...inputProps('country')} />
                  </div>
                </div>
              </>
            )}

            {activeTab === 'personal' && (
              <>
                <div className="profile-field">
                  <label className="profile-field-label">Hebrew Name</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <input {...inputProps('hebrewName')} />
                  </div>
                </div>
                <div className="profile-field">
                  <label className="profile-field-label">Father's Hebrew Name</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <input {...inputProps('fathersHebrewName')} />
                  </div>
                </div>
                <div className="profile-field">
                  <label className="profile-field-label">Mother's Hebrew Name</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <input {...inputProps('mothersHebrewName')} />
                  </div>
                </div>
                <div className="profile-field">
                  <label className="profile-field-label">Jewish</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <select {...selectProps('jewish')}>
                      <option value="">Select...</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                      <option value="Jewish">Jewish</option>
                    </select>
                  </div>
                </div>
                <div className="profile-field">
                  <label className="profile-field-label">Birthdate (Civil)</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <input {...inputProps('birthdate', { type: 'date' })} />
                  </div>
                </div>
                <div className="profile-field">
                  <label className="profile-field-label">Birthdate (Hebrew)</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <input {...inputProps('hebrewBirthdate')} />
                  </div>
                </div>
                <div className="profile-field">
                  <label className="profile-field-label">Next Hebrew Birthday (Civil Date)</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <input {...inputProps('nextHebrewBirthday', { type: 'date' })} />
                  </div>
                </div>
                <div className="profile-field">
                  <label className="profile-field-label">Age</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <input {...inputProps('age', { type: 'number' })} min="0" />
                  </div>
                </div>
                <div className="profile-field">
                  <label className="profile-field-label">Wedding Date</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <input {...inputProps('weddingDate', { type: 'date' })} />
                  </div>
                </div>
                <div className="profile-field">
                  <label className="profile-field-label">Lifecycle Status</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <input {...inputProps('lifecycleStatus')} />
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="add-family-modal-footer">
            <button type="button" className="dash-btn-outline" onClick={handleClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="dash-btn-gold" disabled={submitting}>
              <Save size={16} />
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
