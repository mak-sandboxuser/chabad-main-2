import React, { useEffect, useState } from 'react';
import { User, Pencil, X, Save, MapPin, Heart, Calendar } from 'lucide-react';
import { showToast } from '../../utils/toast';
import { fetchPortalApi } from '../../utils/portalApi';
import {
  ADDITIONAL_FIELD_KEYS,
  ADDITIONAL_FIELD_LABELS,
  displayValue,
  formatProfileDisplayValue,
  LIFECYCLE_FIELD_KEYS,
  LIFECYCLE_FIELD_LABELS,
  profileFormToPayload,
  sfDataToProfileForm,
} from '../../utils/profileForm';

const PROFILE_TABS = [
  { id: 'general', label: 'General Details', icon: User },
  { id: 'address', label: 'Address Details', icon: MapPin },
  { id: 'lifecycle', label: 'Lifecycle & Status', icon: Heart },
  { id: 'additional', label: 'Additional Information', icon: Calendar },
];

const TAB_FIELD_KEYS = {
  general: ['firstName', 'lastName', 'title', 'nickname', 'phone', 'homePhone'],
  address: ['street', 'city', 'state', 'postalCode', 'country'],
  lifecycle: LIFECYCLE_FIELD_KEYS,
  additional: ADDITIONAL_FIELD_KEYS,
};

function FieldRow({ label, value, fieldKey, editing, fullWidth, children }) {
  return (
    <div className={`profile-field${fullWidth ? ' profile-field--full' : ''}`}>
      <label className="profile-field-label">{label}</label>
      {editing ? (
        <div className="profile-field-box profile-field-box--editable">{children}</div>
      ) : (
        <div className="profile-field-box">
          {fieldKey ? formatProfileDisplayValue(fieldKey, value) : displayValue(value)}
        </div>
      )}
    </div>
  );
}

export default function ProfilePage({
  user,
  getAuthToken,
  sfData,
  onProfileUpdated,
}) {
  const [activeTab, setActiveTab] = useState('general');
  const [editingTab, setEditingTab] = useState(null);
  const [form, setForm] = useState(() => sfDataToProfileForm(sfData, user?.email));
  const [draft, setDraft] = useState(form);
  const [saving, setSaving] = useState(false);

  const isEditing = editingTab === activeTab;

  useEffect(() => {
    const next = sfDataToProfileForm(sfData, user?.email);
    setForm(next);
    if (!editingTab) setDraft(next);
  }, [sfData, user?.email, editingTab]);

  const updateDraft = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const resetTabDraft = (tabId) => {
    const keys = TAB_FIELD_KEYS[tabId] || [];
    setDraft((prev) => {
      const next = { ...prev };
      keys.forEach((key) => {
        next[key] = form[key];
      });
      return next;
    });
  };

  const startEdit = () => {
    resetTabDraft(activeTab);
    setEditingTab(activeTab);
  };

  const cancelEdit = () => {
    resetTabDraft(activeTab);
    setEditingTab(null);
  };

  const switchTab = (tabId) => {
    if (editingTab && editingTab !== tabId) {
      resetTabDraft(editingTab);
      setEditingTab(null);
    }
    setActiveTab(tabId);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const data = await fetchPortalApi('/api/portal/update-profile', {
        getAuthToken,
        method: 'POST',
        body: profileFormToPayload(draft),
      });

      const updated = sfDataToProfileForm(data.sfData, user?.email);
      setForm(updated);
      setDraft(updated);
      setEditingTab(null);
      onProfileUpdated?.(data.sfData);
      showToast({ message: 'Profile saved and synced to Salesforce.', type: 'success' });
    } catch (err) {
      showToast({ message: err.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const inputProps = (key, { required = false, placeholder = '', type = 'text' } = {}) => ({
    type,
    className: 'profile-field-input',
    value: draft[key] || '',
    onChange: (e) => updateDraft(key, e.target.value),
    required,
    placeholder,
  });

  const selectProps = (key) => ({
    className: 'profile-field-input profile-field-select',
    value: draft[key] || '',
    onChange: (e) => updateDraft(key, e.target.value),
  });

  const renderLifecycleField = (key) => (
    <FieldRow key={key} label={LIFECYCLE_FIELD_LABELS[key]} fieldKey={key} value={form[key]} editing={isEditing}>
      {key === 'jewish' ? (
        <select {...selectProps('jewish')}>
          <option value="">Select...</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
          <option value="Jewish">Jewish</option>
          {!['', 'Yes', 'No', 'Jewish'].includes(draft.jewish || '') && draft.jewish ? (
            <option value={draft.jewish}>{draft.jewish}</option>
          ) : null}
        </select>
      ) : (
        <input
          {...inputProps(
            key,
            key === 'nextHebrewBirthday' || key === 'weddingDate' ? { type: 'date' } : {},
          )}
        />
      )}
    </FieldRow>
  );

  const renderAdditionalField = (key) => (
    <FieldRow key={key} label={ADDITIONAL_FIELD_LABELS[key]} fieldKey={key} value={form[key]} editing={isEditing}>
      {key === 'gender' ? (
        <select {...selectProps('gender')}>
          <option value="">Select...</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select>
      ) : (
        <input
          {...inputProps(
            key,
            key === 'birthdate' ? { type: 'date' } : key === 'age' ? { type: 'number' } : {},
          )}
          min={key === 'age' ? '0' : undefined}
        />
      )}
    </FieldRow>
  );

  const tabContent = {
    general: (
      <>
        <FieldRow label="First Name" fieldKey="firstName" value={form.firstName} editing={isEditing}>
          <input {...inputProps('firstName', { required: true })} />
        </FieldRow>
        <FieldRow label="Last Name" fieldKey="lastName" value={form.lastName} editing={isEditing}>
          <input {...inputProps('lastName', { required: true })} />
        </FieldRow>
        <FieldRow label="Email Address" value={user?.email} editing={false} />
        <FieldRow label="Title" fieldKey="title" value={form.title} editing={isEditing}>
          <input {...inputProps('title')} />
        </FieldRow>
        <FieldRow label="Nickname" fieldKey="nickname" value={form.nickname} editing={isEditing}>
          <input {...inputProps('nickname')} />
        </FieldRow>
        <FieldRow label="Mobile Phone" fieldKey="phone" value={form.phone} editing={isEditing}>
          <input {...inputProps('phone', { placeholder: '(555) 123-4567' })} />
        </FieldRow>
        <FieldRow label="Home Phone" fieldKey="homePhone" value={form.homePhone} editing={isEditing}>
          <input {...inputProps('homePhone', { placeholder: '(555) 987-6543' })} />
        </FieldRow>
      </>
    ),
    address: (
      <>
        <FieldRow label="Street Address" fieldKey="street" value={form.street} editing={isEditing} fullWidth>
          <input {...inputProps('street')} />
        </FieldRow>
        <FieldRow label="City" fieldKey="city" value={form.city} editing={isEditing}>
          <input {...inputProps('city')} />
        </FieldRow>
        <FieldRow label="State" fieldKey="state" value={form.state} editing={isEditing}>
          <input {...inputProps('state')} />
        </FieldRow>
        <FieldRow label="Postal Code" fieldKey="postalCode" value={form.postalCode} editing={isEditing}>
          <input {...inputProps('postalCode')} />
        </FieldRow>
        <FieldRow label="Country" fieldKey="country" value={form.country} editing={isEditing}>
          <input {...inputProps('country')} />
        </FieldRow>
      </>
    ),
    lifecycle: LIFECYCLE_FIELD_KEYS.map(renderLifecycleField),
    additional: ADDITIONAL_FIELD_KEYS.map(renderAdditionalField),
  };

  const currentTab = PROFILE_TABS.find((tab) => tab.id === activeTab);
  const TabIcon = currentTab?.icon || User;

  return (
    <div className="profile-container">
      <div className="glass-panel profile-card">
        <div className="profile-card-header">
          <div className="profile-card-title">
            <User size={24} className="profile-card-title-icon" />
            <div>
              <h2>My Profile</h2>
              <p>Manage your contact information by section.</p>
            </div>
          </div>
        </div>

        <div className="profile-tabs" role="tablist">
          {PROFILE_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              className={`profile-tab ${activeTab === id ? 'active' : ''}`}
              onClick={() => switchTab(id)}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <form id="profile-form" onSubmit={handleSave}>
          <div className="profile-tab-panel" role="tabpanel">
            <div className="profile-tab-panel-header">
              <h3 className="profile-section-title">
                <TabIcon size={16} />
                {currentTab?.label}
              </h3>

              {!isEditing ? (
                <button type="button" className="btn btn-primary profile-tab-edit-btn" onClick={startEdit}>
                  <Pencil size={16} />
                  Edit
                </button>
              ) : (
                <div className="profile-tab-actions">
                  <button type="button" className="btn btn-secondary" onClick={cancelEdit} disabled={saving}>
                    <X size={16} />
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    <Save size={16} />
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
            </div>

            <div className="profile-tab-form-grid">
              {tabContent[activeTab]}
            </div>
          </div>

          {sfData?.contactId && (
            <div className="profile-contact-id">
              Salesforce Contact ID: <code>{sfData.contactId}</code>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
