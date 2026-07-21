import React, { useMemo, useState } from 'react';
import { Search, Edit, User } from 'lucide-react';

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
                <th className="crm-col-email" style={{ minWidth: '180px' }}>Email</th>
                <th className="crm-col-role">Role</th>
                <th className="crm-col-actions" style={{ textAlign: 'center', width: '100px' }}>Action</th>
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
                  <td className="crm-col-email" style={{ color: 'var(--text-secondary)' }}>
                    {contact.email || '—'}
                  </td>
                  <td className="crm-col-role">{contact.role || '—'}</td>
                  <td className="crm-col-actions" style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      className="dash-btn-icon-only"
                      onClick={() => onSelectContact?.(contact)}
                      aria-label={`Edit ${contact.name}`}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-primary)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '6px',
                        borderRadius: '4px',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                    >
                      <Edit size={16} />
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
