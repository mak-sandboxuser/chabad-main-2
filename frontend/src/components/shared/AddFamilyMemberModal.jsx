import React, { useEffect, useMemo, useState } from 'react';
import {
  Users, UserPlus, Search, X, ChevronLeft, Contact, Building2, Loader2,
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
import {
  getHouseholdParentCapacity,
  getMemberTypeAvailability,
  validateAddFamilyMemberRequest,
} from '../../utils/householdMemberRules';

const EMPTY_FORM = {
  salutation: '',
  firstName: '',
  lastName: '',
  gender: '',
  contactEmail: '',
  mobilePhone: '',
  memberType: 'child',
  groups: '',
};

const MIN_SEARCH_LENGTH = 3;

function shouldRunContactSearch(query = '') {
  const trimmed = query.trim();
  if (trimmed.length < MIN_SEARCH_LENGTH) return false;
  if (trimmed.includes('@')) return trimmed.length >= 5;
  return true;
}

export default function AddFamilyMemberModal({
  open,
  onClose,
  user,
  getAuthToken,
  sfData,
  onSuccess,
}) {
  const [step, setStep] = useState('choose');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [resolvedSearchQuery, setResolvedSearchQuery] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState([]);
  const [linkMemberType, setLinkMemberType] = useState('child');
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep('choose');
    setSearchQuery('');
    setSearchResults([]);
    setResolvedSearchQuery('');
    setSelectedContactIds([]);
    setLinkMemberType('child');
    setForm(EMPTY_FORM);
    setSubmitting(false);
    setSearchLoading(false);
  }, [open]);

  useEffect(() => {
    if (!open || step !== 'search') return undefined;

    const trimmedQuery = searchQuery.trim();
    if (!shouldRunContactSearch(trimmedQuery)) {
      setSearchLoading(false);
      setSearchResults([]);
      setResolvedSearchQuery('');
      return undefined;
    }

    setSearchLoading(true);

    const timer = window.setTimeout(async () => {
      try {
        const data = await fetchPortalApi('/api/household/search-contacts', {
          getAuthToken,
          method: 'POST',
          body: {
            email: user?.email,
            query: trimmedQuery,
            limit: 50,
          },
        });
        setSearchResults(data.contacts || []);
        setResolvedSearchQuery(trimmedQuery);
      } catch (err) {
        showToast({ message: err.message, type: 'error' });
        setSearchResults([]);
        setResolvedSearchQuery(trimmedQuery);
      } finally {
        setSearchLoading(false);
      }
    }, 400);

    return () => window.clearTimeout(timer);
  }, [open, step, searchQuery, getAuthToken, user?.email]);

  const canCreate = useMemo(
    () => form.firstName.trim().length > 0 && form.lastName.trim().length > 0,
    [form.firstName, form.lastName],
  );

  const household = useMemo(() => getHouseholdAccountContext(sfData), [sfData]);
  const accountName = household.accountName;
  const householdAccountId = household.householdAccountId;
  const householdContactIds = household.householdContactIds;
  const primaryContact = household.primaryContact;
  const secondaryContact = household.secondaryContact;
  const parentCapacity = useMemo(() => getHouseholdParentCapacity(household), [household]);
  const selectedContacts = useMemo(
    () => searchResults.filter((contact) => selectedContactIds.includes(contact.contactId)),
    [searchResults, selectedContactIds],
  );
  const linkTypeAvailability = useMemo(
    () => getMemberTypeAvailability(household, selectedContacts, accountName),
    [household, selectedContacts, accountName],
  );
  const createTypeAvailability = useMemo(
    () => getMemberTypeAvailability(household, [], accountName),
    [household, accountName],
  );

  useEffect(() => {
    if (!open || step !== 'search') return;
    if (!linkTypeAvailability[linkMemberType]?.enabled) {
      setLinkMemberType('child');
    }
  }, [open, step, linkMemberType, linkTypeAvailability]);

  useEffect(() => {
    if (!open || step !== 'create') return;
    if (!createTypeAvailability[form.memberType]?.enabled) {
      setForm((prev) => ({ ...prev, memberType: 'child' }));
    }
  }, [open, step, form.memberType, createTypeAvailability]);

  if (!open) return null;

  const openAddFlow = (nextStep) => {
    if (!householdAccountId?.startsWith('001')) {
      showToast({
        message: 'Household Account ID is missing. Log out, log in again, then use Add Family Members from the Account page.',
        type: 'error',
      });
      return;
    }
    setStep(nextStep);
  };

  const toggleContact = (contactId) => {
    setSelectedContactIds((prev) => (
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId]
    ));
  };

  const handleClose = () => {
    if (!submitting) onClose();
  };

  const refreshHousehold = async (data) => {
    if (data?.sfData && onSuccess) {
      await onSuccess(data.sfData);
    } else if (onSuccess) {
      await onSuccess();
    }
  };

  const handleLinkSubmit = async () => {
    if (!selectedContactIds.length) {
      showToast({ message: 'Select at least one contact.', type: 'error' });
      return;
    }

    const validation = validateAddFamilyMemberRequest({
      memberType: linkMemberType,
      household,
      contacts: selectedContacts,
      accountName,
    });
    if (!validation.ok) {
      showToast({ message: validation.message, type: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      const data = await fetchPortalApi('/api/household/add-family-member', {
        getAuthToken,
        method: 'POST',
        body: {
          email: user?.email,
          mode: 'link',
          contactIds: selectedContactIds,
          contactMeta: selectedContacts.map((contact) => ({
            contactId: contact.contactId,
            name: contact.name,
            currentFamily: contact.currentFamily,
          })),
          memberType: linkMemberType,
          householdAccountId,
          accountId: householdAccountId,
        },
      });

      showToast({ message: data.message || 'Family member added.', type: 'success' });
      await refreshHousehold(data);
      onClose();
    } catch (err) {
      showToast({ message: err.message, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateSubmit = async (event) => {
    event.preventDefault();
    if (!canCreate) {
      showToast({ message: 'First Name and Last Name are required.', type: 'error' });
      return;
    }

    const validation = validateAddFamilyMemberRequest({
      memberType: form.memberType,
      household,
      contacts: [],
      accountName,
    });
    if (!validation.ok) {
      showToast({ message: validation.message, type: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      const data = await fetchPortalApi('/api/household/add-family-member', {
        getAuthToken,
        method: 'POST',
        body: {
          email: user?.email,
          mode: 'create',
          householdAccountId,
          accountId: householdAccountId,
          salutation: form.salutation,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          gender: form.gender,
          contactEmail: form.contactEmail.trim(),
          mobilePhone: form.mobilePhone.trim(),
          memberType: form.memberType,
          groups: form.groups,
        },
      });

      showToast({ message: data.message || 'Family member created.', type: 'success' });
      await refreshHousehold(data);
      onClose();
    } catch (err) {
      showToast({ message: err.message, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const renderMemberTypeToggle = (value, onChange, availability) => (
    <div className="add-family-member-type-toggle">
      {MEMBER_TYPES.map((type) => {
        const option = availability?.[type.id] || { enabled: true, reason: '' };
        return (
          <button
            key={type.id}
            type="button"
            className={value === type.id ? 'active' : ''}
            disabled={!option.enabled}
            title={option.reason || type.label}
            onClick={() => option.enabled && onChange(type.id)}
          >
            {type.label}
          </button>
        );
      })}
    </div>
  );

  const renderParentRulesBanner = (availability) => (
    <div className="add-family-rules-banner">
      <p>
        <strong>Parent rules:</strong>
        {parentCapacity.parentsFull
          ? ' Both parent slots are already filled — add new members as Child only.'
          : !parentCapacity.canAddPrimary && parentCapacity.canAddSecondary
            ? ' Primary parent is already set — you can add Secondary or Child.'
            : parentCapacity.canAddPrimary && !parentCapacity.canAddSecondary
              ? ' Secondary parent is open — you can add Primary or Child.'
              : ' You can add Primary, Secondary, or Child.'}
      </p>
      {(availability.primary?.reason || availability.secondary?.reason) && (
        <p className="add-family-rules-note">
          {availability.primary?.reason || availability.secondary?.reason}
        </p>
      )}
    </div>
  );

  return (
    <div className="portal-modal-backdrop add-family-modal-backdrop" onClick={handleClose}>
      <div
        className="portal-modal glass-panel add-family-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-family-title"
      >
        {submitting && (
          <div className="add-family-loading-overlay" aria-live="polite">
            <Loader2 size={32} className="add-family-spinner" />
            <span>Saving to ChabadOne CRM...</span>
          </div>
        )}
        <div className="portal-modal-header">
          <h2 id="add-family-title">
            <Users size={20} /> Add Family Members
          </h2>
          <button type="button" className="portal-modal-close" onClick={handleClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="add-family-account-banner">
          <span className="add-family-account-label">Account</span>
          <strong>{accountName}</strong>

          {(primaryContact || secondaryContact) && (
            <div className="add-family-account-members">
              {primaryContact && <span>Primary: {primaryContact.name}</span>}
              {secondaryContact && <span>Secondary: {secondaryContact.name}</span>}
            </div>
          )}
        </div>

        {step === 'choose' && (
          <>
            <p className="portal-modal-copy">
              Add someone to the <strong>{accountName}</strong> household account by linking an existing ChabadOne contact or creating a new one.
            </p>
            <div className="add-family-choice-grid">
              <button type="button" className="add-family-choice-card" onClick={() => openAddFlow('search')}>
                <div className="add-family-choice-icon add-family-choice-icon--purple">
                  <Contact size={22} />
                </div>
                <h3>Select Existing Contacts</h3>
                <p>Search Salesforce and add contacts already in ChabadOne CRM.</p>
                <span className="add-family-choice-action">Select Existing Contacts</span>
              </button>
              <button type="button" className="add-family-choice-card" onClick={() => openAddFlow('create')}>
                <div className="add-family-choice-icon add-family-choice-icon--blue">
                  <Building2 size={22} />
                </div>
                <h3>Create New Contact</h3>
                <p>Create a new contact and add them to your household.</p>
                <span className="add-family-choice-action">Create New Contact</span>
              </button>
            </div>
          </>
        )}

        {step === 'search' && (
          <>
            <p className="portal-modal-copy">
              Search ChabadOne contacts and add them to the <strong>{accountName}</strong> account.
            </p>
            <div className="add-family-search-bar">
              <Search size={16} />
              <input
                type="search"
                placeholder="Search by name, email, or city..."
                value={searchQuery}
                onChange={(event) => {
                  const value = event.target.value;
                  setSearchQuery(value);
                  if (shouldRunContactSearch(value)) {
                    setSearchLoading(true);
                  } else {
                    setSearchLoading(false);
                    setSearchResults([]);
                    setResolvedSearchQuery('');
                  }
                }}
                autoFocus
              />
              {searchLoading && <Loader2 size={16} className="add-family-spinner add-family-search-spinner" />}
            </div>

            <div className={`add-family-search-table-wrap${searchLoading ? ' is-loading' : ''}`}>
              {searchLoading && (
                <div className="add-family-table-loading-panel">
                  <Loader2 size={28} className="add-family-spinner" />
                  <span>Searching contacts...</span>
                </div>
              )}
              {!searchLoading && searchResults.length === 0 ? (
                <div className="add-family-empty">
                  {!shouldRunContactSearch(searchQuery)
                    ? 'Type at least 3 characters (or a full email) to search.'
                    : resolvedSearchQuery === searchQuery.trim()
                      ? 'No contacts match your search.'
                      : 'Searching...'}
                </div>
              ) : !searchLoading ? (
                <table className="crm-table add-family-search-table">
                  <thead>
                    <tr>
                      <th className="add-family-col-check" aria-hidden="true" />
                      <th className="add-family-col-name">Name</th>
                      <th className="add-family-col-family">Current Family</th>
                      <th className="add-family-col-street">Primary Street</th>
                      <th className="add-family-col-city">Primary City</th>
                      <th className="add-family-col-phone">Phone</th>
                      <th className="add-family-col-email">Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.filter((contact) => contact.contactId || contact.name || contact.email).map((contact) => {
                      const id = contact.contactId || contact.name;
                      const alreadyOnAccount = householdContactIds.includes(contact.contactId);
                      const checked = selectedContactIds.includes(contact.contactId);
                      return (
                        <tr key={id} className={checked ? 'is-selected' : ''}>
                          <td className="add-family-col-check">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!contact.contactId || alreadyOnAccount}
                              onChange={() => contact.contactId && !alreadyOnAccount && toggleContact(contact.contactId)}
                              aria-label={`Select ${contact.name}`}
                            />
                          </td>
                          <td className="add-family-col-name">
                            <span className="add-family-cell-text">{contact.name || '—'}</span>
                            {alreadyOnAccount && <span className="add-family-on-account-tag">On account</span>}
                          </td>
                          <td className="add-family-col-family">
                            <span className="add-family-cell-text">{contact.currentFamily || '—'}</span>
                            {contact.currentFamily && contact.currentFamily !== accountName && (
                              <span className="add-family-other-household-tag">Other household</span>
                            )}
                          </td>
                          <td className="add-family-col-street"><span className="add-family-cell-text">{contact.street || '—'}</span></td>
                          <td className="add-family-col-city"><span className="add-family-cell-text">{contact.city || '—'}</span></td>
                          <td className="add-family-col-phone"><span className="add-family-cell-text">{contact.phone || '—'}</span></td>
                          <td className="add-family-col-email"><span className="add-family-cell-text">{contact.email || '—'}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : null}
            </div>

            <label className="profile-field-label">Relationship in household</label>
            {renderParentRulesBanner(linkTypeAvailability)}
            {renderMemberTypeToggle(linkMemberType, setLinkMemberType, linkTypeAvailability)}

            <div className="add-family-modal-footer">
              <button type="button" className="dash-btn-outline" onClick={() => setStep('choose')}>
                <ChevronLeft size={16} /> Back
              </button>
              <button
                type="button"
                className="dash-btn-gold"
                disabled={submitting || !selectedContactIds.length}
                onClick={handleLinkSubmit}
              >
                {submitting ? 'Adding...' : `Add ${selectedContactIds.length || ''} Contact${selectedContactIds.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </>
        )}

        {step === 'create' && (
          <>
            <div className="add-family-alert">
              This will create a new contact and add it to the <strong>{accountName}</strong> household account.
            </div>
            <form onSubmit={handleCreateSubmit}>
              <div className="add-family-form-grid">
                <div>
                  <label className="profile-field-label">Salutation</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <select
                      className="profile-field-input profile-field-select"
                      value={form.salutation}
                      onChange={(event) => setForm((prev) => ({ ...prev, salutation: event.target.value }))}
                    >
                      <option value="">-- Select --</option>
                      {SALUTATIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="profile-field-label">Gender</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <select
                      className="profile-field-input profile-field-select"
                      value={form.gender}
                      onChange={(event) => setForm((prev) => ({ ...prev, gender: event.target.value }))}
                    >
                      <option value="">--None--</option>
                      {GENDER_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="profile-field-label">First Name *</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <input
                      type="text"
                      className="profile-field-input"
                      value={form.firstName}
                      onChange={(event) => setForm((prev) => ({ ...prev, firstName: event.target.value }))}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="profile-field-label">Last Name *</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <input
                      type="text"
                      className="profile-field-input"
                      value={form.lastName}
                      onChange={(event) => setForm((prev) => ({ ...prev, lastName: event.target.value }))}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="profile-field-label">Email</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <input
                      type="email"
                      className="profile-field-input"
                      value={form.contactEmail}
                      onChange={(event) => setForm((prev) => ({ ...prev, contactEmail: event.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="profile-field-label">Mobile Phone</label>
                  <div className="profile-field-box profile-field-box--editable">
                    <input
                      type="tel"
                      className="profile-field-input"
                      value={form.mobilePhone}
                      onChange={(event) => setForm((prev) => ({ ...prev, mobilePhone: event.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <label className="profile-field-label">Relationship in household</label>
              {renderParentRulesBanner(createTypeAvailability)}
              {renderMemberTypeToggle(form.memberType, (memberType) => setForm((prev) => ({ ...prev, memberType })), createTypeAvailability)}

              <label className="profile-field-label">Select groups</label>
              <div className="profile-field-box profile-field-box--editable">
                <select
                  className="profile-field-input profile-field-select"
                  value={form.groups}
                  onChange={(event) => setForm((prev) => ({ ...prev, groups: event.target.value }))}
                >
                  <option value="">Select a value</option>
                  {HOUSEHOLD_GROUP_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>

              <div className="add-family-modal-footer">
                <button type="button" className="dash-btn-outline" onClick={() => setStep('choose')}>
                  <ChevronLeft size={16} /> Back
                </button>
                <button type="submit" className="dash-btn-gold" disabled={submitting || !canCreate}>
                  <UserPlus size={16} />
                  {submitting ? 'Saving...' : 'Save & Create Contact'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
