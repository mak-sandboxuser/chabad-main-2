import React, { useEffect, useState } from 'react';
import { Wallet, Lock, ShieldCheck, RefreshCw } from 'lucide-react';
import PortalPageLayout from '../shared/PortalPageLayout';
import SectionTabs from '../shared/SectionTabs';
import DataTable, { StatusIcon } from '../shared/DataTable';
import {
  formatDisplayDate,
  getAccount,
  getPayments,
  getPledges,
  getRecurring,
} from '../../utils/portalData';

const TABS = [
  { id: 'payments', label: 'Payments', icon: Wallet },
  { id: 'pledges', label: 'Pledges', icon: Wallet },
  { id: 'recurring', label: 'Recurring Billing', icon: RefreshCw },
];

export default function FinancialsPage({ theme, sfData, onDonate, defaultTab = 'payments' }) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);
  const account = getAccount(sfData);
  const payments = getPayments(sfData);
  const pledges = getPledges(sfData);
  const recurring = getRecurring(sfData);

  const counts = {
    payments: payments.length,
    pledges: pledges.length,
    recurring: recurring.length,
  };

  return (
    <PortalPageLayout
      theme={theme}
      title="Financials"
      subtitle="Payments, pledges, and recurring billing for your account."
      showSketch={false}
    >
      <div className="account-header-card glass-panel">
        <div className="account-header-main">
          <div className="account-header-icon"><Wallet size={24} /></div>
          <div>
            <span className="account-header-type">Financials</span>
            <h2>{account.name}</h2>
            <p className="account-header-subcopy">Synced from ChabadOne CRM financial records.</p>
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

        <div className="section-panel">
          <div className="section-panel-header">
            <h3>
              {activeTab === 'payments' && 'All Payments'}
              {activeTab === 'pledges' && 'All Pledges'}
              {activeTab === 'recurring' && 'Recurring Billing'}
            </h3>
            <span className="section-count">{counts[activeTab]} items</span>
          </div>

          {activeTab === 'payments' && (
            <DataTable
              emptyMessage="No payments found."
              rows={payments}
              columns={[
                { key: 'status', label: '', render: (row) => <StatusIcon status={row.status} /> },
                { key: 'amount', label: 'Amount' },
                { key: 'total', label: 'Total', render: (row) => row.total || row.amount },
                { key: 'date', label: 'Payment Date', render: (row) => formatDisplayDate(row.date) },
                { key: 'outstanding', label: 'Outstanding', render: (row) => row.outstanding || '$0.00' },
                { key: 'payer', label: 'Payer / Parent' },
                { key: 'type', label: 'Type' },
                { key: 'subType', label: 'Sub-Type' },
                { key: 'method', label: 'Payment Method' },
              ]}
            />
          )}

          {activeTab === 'pledges' && (
            <DataTable
              emptyMessage="No pledges found."
              rows={pledges}
              columns={[
                { key: 'status', label: '', render: (row) => <StatusIcon status={row.status} /> },
                { key: 'amount', label: 'Amount' },
                { key: 'outstanding', label: 'Outstanding' },
                { key: 'total', label: 'Total' },
                { key: 'paid', label: 'Paid' },
                { key: 'name', label: 'Pledge' },
                { key: 'parent', label: 'Parent Account' },
                { key: 'type', label: 'Type' },
                { key: 'subType', label: 'Sub-Type' },
                { key: 'date', label: 'Date', render: (row) => formatDisplayDate(row.date) },
              ]}
            />
          )}

          {activeTab === 'recurring' && (
            <DataTable
              emptyMessage="No recurring billing profiles found."
              rows={recurring}
              columns={[
                { key: 'status', label: 'Status', render: (row) => <span className="badge badge-active">{row.status}</span> },
                { key: 'amount', label: 'Amount' },
                { key: 'frequency', label: 'Frequency' },
                { key: 'nextDate', label: 'Next Charge', render: (row) => formatDisplayDate(row.nextDate) },
                { key: 'type', label: 'Type' },
                { key: 'method', label: 'Payment Method' },
                { key: 'cardExpiry', label: 'Expires' },
              ]}
            />
          )}
        </div>
      </div>

      <div className="financial-note glass-panel">
        <ShieldCheck size={16} />
        <span>Secure payments processed by Stripe. Salesforce records update through Make.com after successful payment.</span>
      </div>
    </PortalPageLayout>
  );
}
