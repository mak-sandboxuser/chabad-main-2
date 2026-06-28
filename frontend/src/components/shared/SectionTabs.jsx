import React from 'react';

export default function SectionTabs({ tabs, activeTab, onChange }) {
  return (
    <div className="section-tabs" role="tablist">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={activeTab === id}
          className={`section-tab ${activeTab === id ? 'active' : ''}`}
          onClick={() => onChange(id)}
        >
          {Icon ? <Icon size={16} /> : null}
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
