import React, { useMemo, useState } from 'react';
import { Search, RefreshCw, SlidersHorizontal, ChevronDown, User } from 'lucide-react';
import { StatusIcon } from './DataTable';

export default function RelationshipsTable({ relationships = [] }) {
  const [search, setSearch] = useState('');

  const filteredRelationships = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return relationships;
    return relationships.filter((relationship) => {
      const haystack = [
        relationship.person1,
        relationship.person2,
        relationship.type,
        relationship.status,
        relationship.explanation,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [relationships, search]);

  return (
    <div className="crm-list-view">
      <div className="crm-list-view-toolbar">
        <div className="crm-list-view-title">
          <User size={16} />
          <h3>All Relationships</h3>
          <span className="crm-list-view-count">{filteredRelationships.length} items</span>
        </div>
        <div className="crm-list-view-actions">
          <div className="crm-list-search">
            <Search size={14} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search relationships..."
              aria-label="Search relationships"
            />
          </div>
          <button type="button" className="crm-icon-btn" aria-label="Refresh list">
            <RefreshCw size={14} />
          </button>
          <button type="button" className="crm-icon-btn" aria-label="Filter list">
            <SlidersHorizontal size={14} />
          </button>
          <button type="button" className="crm-icon-btn" aria-label="More options">
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      <div className="crm-list-view-table-wrap">
        {filteredRelationships.length ? (
          <table className="crm-table">
            <thead>
              <tr>
                <th>Person (Contact)</th>
                <th>Full Name</th>
                <th>Status</th>
                <th>Type</th>
                <th>Relationship Explanation</th>
              </tr>
            </thead>
            <tbody>
              {filteredRelationships.map((relationship) => (
                <tr key={relationship.id}>
                  <td>
                    <span className="crm-contact-link">{relationship.person1 || '—'}</span>
                  </td>
                  <td>{relationship.person2 || '—'}</td>
                  <td>
                    <span className="crm-status-cell">
                      <StatusIcon status={relationship.status} />
                      {relationship.status || '—'}
                    </span>
                  </td>
                  <td>{relationship.type || '—'}</td>
                  <td>{relationship.explanation || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="crm-list-empty">
            <p>No relationships found in Salesforce for this household.</p>
          </div>
        )}
      </div>
    </div>
  );
}
