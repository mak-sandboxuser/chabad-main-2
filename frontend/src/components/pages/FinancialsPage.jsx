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
  getPortalFiscalYearLabel,
} from '../../utils/portalData';

const TABS = [
  { id: 'payments', label: 'Payments', icon: Wallet },
  { id: 'pledges', label: 'Outstanding Amount', icon: Wallet },
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
      showSketch={false}
    >
      <div className="account-header-card glass-panel">
        <div className="account-header-main">
          <div className="account-header-icon"><Wallet size={24} /></div>
          <div>
            <span className="account-header-type">Financials</span>
            <h2>{account.name}</h2>
          </div>
        </div>
        <div className="account-header-actions">
          <button type="button" className="dash-btn-gold" onClick={() => onDonate()}>
            <Lock size={16} /> General Payment
          </button>
        </div>
      </div>

      <div className="section-card glass-panel">
        <SectionTabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

        <div className="section-panel">
          <div className="section-panel-header">
            <div>
              <h3>
                {activeTab === 'payments' && 'All Payments'}
                {activeTab === 'pledges' && 'Outstanding Amount'}
                {activeTab === 'recurring' && 'Recurring Billing'}
              </h3>
              {activeTab === 'payments' && (
                <p className="section-panel-subcopy">
                  Showing payments for {getPortalFiscalYearLabel()}. Older records reset each September 1.
                </p>
              )}
            </div>
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
              ]}
            />
          )}

          {activeTab === 'pledges' && (
            <DataTable
              emptyMessage="No outstanding amount records found."
              rows={pledges}
              columns={[
                { key: 'status', label: '', render: (row) => <StatusIcon status={row.status} /> },
                { key: 'amount', label: 'Amount' },
                { key: 'outstanding', label: 'Outstanding' },
                { key: 'total', label: 'Total' },
                { key: 'paid', label: 'Paid' },
                { key: 'name', label: 'Pledge' },
                { key: 'date', label: 'Date', render: (row) => formatDisplayDate(row.date) },
                {
                  key: 'action',
                  label: 'Action',
                  render: (row) => {
                    const outstandingVal = parseFloat(String(row.outstanding || '').replace(/[^0-9.-]/g, '')) || 0;
                    if (outstandingVal <= 0) {
                      return (
                        <button
                          type="button"
                          className="dash-btn-gold"
                          disabled
                          style={{
                            padding: '4px 10px',
                            fontSize: '12px',
                            minHeight: 'auto',
                            opacity: 0.6,
                            cursor: 'not-allowed',
                          }}
                        >
                          Completed
                        </button>
                      );
                    }

                    const detectPaymentTypeAndSubType = (pledgeName = '') => {
                      const name = pledgeName.trim().toLowerCase();
                      if (name.includes('tuition')) {
                        return { type: 'Payment', subType: 'Hebrew School Tuition' };
                      }
                      if (name.includes('event')) {
                        return { type: 'Payment', subType: 'Event Registration' };
                      }
                      if (name.includes('camp')) {
                        return { type: 'Payment', subType: 'Camp Bedford' };
                      }
                      if (name.includes('membership')) {
                        return { type: 'Pledge', subType: 'Annual Membership' };
                      }
                      if (name.includes('building')) {
                        return { type: 'Pledge', subType: 'Building Campaign' };
                      }
                      if (name.includes('capital')) {
                        return { type: 'Pledge', subType: 'Capital Campaign' };
                      }
                      if (name.includes('holiday')) {
                        return { type: 'Donation', subType: 'Holiday Contribution' };
                      }
                      if (name.includes('yizkor')) {
                        return { type: 'Donation', subType: 'Yizkor' };
                      }
                      if (name.includes('chai')) {
                        return { type: 'Donation', subType: 'Chai Club' };
                      }
                      return { type: 'Donation', subType: 'General Donation' };
                    };

                    const matched = detectPaymentTypeAndSubType(row.name);

                    return (
                      <button
                        type="button"
                        className="dash-btn-gold"
                        style={{ padding: '4px 10px', fontSize: '12px', minHeight: 'auto' }}
                        onClick={() => onDonate({
                          amount: outstandingVal.toFixed(2),
                          type: matched.type,
                          subType: matched.subType,
                        })}
                      >
                        Pay Now
                      </button>
                    );
                  }
                }
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
