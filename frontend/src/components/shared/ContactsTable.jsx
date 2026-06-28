import React, { useMemo, useState } from 'react';
import { Search, RefreshCw, SlidersHorizontal, ChevronDown, Check, User } from 'lucide-react';

function MemberFlag({ active }) {
  return (
    <div className="crm-member-flag">
      {active ? (
        <span className="crm-member-flag-yes" aria-label="Yes">
          <Check size={14} strokeWidth={3} />
        </span>
      ) : null}
    </div>
  );
}

export default function ContactsTable({ contacts = [], onSelectContact }) {
  const [search, setSearch] = useState('');

  const filteredContacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter((contact) => {
      const haystack = [contact.name, contact.role, contact.email, contact.phone]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [contacts, search]);

  return (
    <div className="crm-list-view">
      <div className="crm-list-view-toolbar">
        <div className="crm-list-view-title">
          <User size={16} />
          <h3>All Contacts</h3>
          <span className="crm-list-view-count">{filteredContacts.length} items</span>
        </div>
        <div className="crm-list-view-actions">
          <div className="crm-list-search">
            <Search size={16} />
            <input
              type="search"
              placeholder="Search contacts..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <button type="button" className="crm-icon-btn" title="Refresh" onClick={() => setSearch('')}>
            <RefreshCw size={16} />
          </button>
          <button type="button" className="crm-icon-btn" title="Filters">
            <SlidersHorizontal size={16} />
          </button>
        </div>
      </div>

      {filteredContacts.length === 0 ? (
        <div className="crm-list-empty">
          {contacts.length === 0
            ? 'No household contacts found. Data will appear here once synced from Salesforce.'
            : 'No contacts match your search.'}
        </div>
      ) : (
        <div className="crm-table-wrap">
          <table className="crm-table contacts-table">
            <thead>
              <tr>
                <th className="crm-col-name">Related Person (Contact)</th>
                <th className="crm-col-flag">Primary Member</th>
                <th className="crm-col-flag">Secondary Member</th>
                <th className="crm-col-role">Role</th>
                <th className="crm-col-actions" aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {filteredContacts.map((contact) => (
                <tr key={contact.id || contact.contactId || contact.name}>
                  <td className="crm-col-name">
                    <button
                      type="button"
                      className="crm-contact-link"
                      onClick={() => onSelectContact?.(contact)}
                    >
                      {contact.name}
                    </button>
                  </td>
                  <td className="crm-col-flag">
                    <MemberFlag active={Boolean(contact.isPrimary)} />
                  </td>
                  <td className="crm-col-flag">
                    <MemberFlag active={Boolean(contact.isSecondary)} />
                  </td>
                  <td className="crm-col-role">{contact.role || '—'}</td>
                  <td className="crm-col-actions">
                    <button
                      type="button"
                      className="crm-row-menu"
                      onClick={() => onSelectContact?.(contact)}
                      aria-label={`View ${contact.name}`}
                    >
                      <ChevronDown size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
