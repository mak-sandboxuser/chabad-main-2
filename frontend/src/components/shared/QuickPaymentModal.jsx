import React, { useState } from 'react';
import { DollarSign, Lock, RefreshCw, X } from 'lucide-react';
import { fetchPortalApi } from '../../utils/portalApi';
import { PAYMENT_SUBTYPES, PAYMENT_TYPES } from '../../constants/paymentOptions';

function todayIsoDate() {
  return new Date().toISOString().split('T')[0];
}

export default function QuickPaymentModal({
  open,
  onClose,
  user,
  getAuthToken,
  sfData,
  purpose = 'Chabad Bedford Payment',
}) {
  const [billingMode, setBillingMode] = useState('regular');
  const [paymentType, setPaymentType] = useState('Donation');
  const [subType, setSubType] = useState('General');
  const [memo, setMemo] = useState('');
  const [pledgeAmount, setPledgeAmount] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayIsoDate());
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const isRecurring = billingMode === 'recurring';
  const parsedPledge = parseFloat(pledgeAmount) || 0;
  const parsedPayment = parseFloat(paymentAmount) || 0;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (parsedPledge <= 0 && parsedPayment <= 0) {
      alert('Enter a Pledge Amount and/or Payment Amount.');
      return;
    }

    setLoading(true);
    try {
      const data = await fetchPortalApi('/api/payments/quick-payment', {
        getAuthToken,
        method: 'POST',
        body: {
          email: user?.email,
          contactId: sfData?.contactId || '',
          accountId: sfData?.accountId || sfData?.account?.id || '',
          purpose,
          paymentType,
          subType,
          memo,
          pledgeAmount: parsedPledge,
          paymentAmount: parsedPayment,
          billingMode,
          paymentDate,
        },
      });

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      if (data.success) {
        alert(data.message || 'Saved to ChabadOne CRM successfully.');
        onClose();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="portal-modal-backdrop">
      <div className="portal-modal glass-panel quick-payment-modal">
        <div className="portal-modal-header">
          <h2><DollarSign size={20} /> Quick Payment</h2>
          <button type="button" className="portal-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="portal-modal-copy">
          Same as ChabadOne CRM — pledge amount creates a pledge, payment amount charges Stripe, payment plan creates recurring billing.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="quick-pay-mode-toggle">
            <button
              type="button"
              className={billingMode === 'regular' ? 'active' : ''}
              onClick={() => setBillingMode('regular')}
            >
              Regular
            </button>
            <button
              type="button"
              className={billingMode === 'recurring' ? 'active' : ''}
              onClick={() => setBillingMode('recurring')}
            >
              <RefreshCw size={14} /> Payment Plan
            </button>
          </div>

          <div className="quick-pay-grid">
            <div>
              <label className="profile-field-label">Type</label>
              <div className="profile-field-box profile-field-box--editable">
                <select className="profile-field-input" value={paymentType} onChange={(e) => setPaymentType(e.target.value)} required>
                  {PAYMENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="profile-field-label">Sub-Type</label>
              <div className="profile-field-box profile-field-box--editable">
                <select className="profile-field-input" value={subType} onChange={(e) => setSubType(e.target.value)} required>
                  {PAYMENT_SUBTYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
            </div>
          </div>

          <label className="profile-field-label">Memo</label>
          <div className="profile-field-box profile-field-box--editable">
            <input type="text" className="profile-field-input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Optional note" />
          </div>

          <div className="quick-pay-grid">
            <div>
              <label className="profile-field-label">Pledge Amount (USD)</label>
              <div className="profile-field-box profile-field-box--editable">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="profile-field-input"
                  value={pledgeAmount}
                  onChange={(e) => setPledgeAmount(e.target.value)}
                  placeholder="Commitment / aim"
                />
              </div>
            </div>
            <div>
              <label className="profile-field-label">Payment Amount (USD)</label>
              <div className="profile-field-box profile-field-box--editable">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="profile-field-input"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder={isRecurring ? 'Recurring amount' : 'Pay now via Stripe'}
                />
              </div>
            </div>
          </div>

          <label className="profile-field-label">Payment Date</label>
          <div className="profile-field-box profile-field-box--editable">
            <input type="date" className="profile-field-input" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required />
          </div>

          <button type="submit" className="dash-btn-gold full-width" disabled={loading}>
            <Lock size={16} />
            {loading
              ? 'Processing...'
              : parsedPayment > 0
                ? 'Continue to Secure Checkout'
                : isRecurring
                  ? 'Create Recurring Billing'
                  : 'Save Pledge to CRM'}
          </button>
        </form>
      </div>
    </div>
  );
}
