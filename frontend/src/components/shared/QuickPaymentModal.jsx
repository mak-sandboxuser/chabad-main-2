import React, { useEffect, useState, useRef } from 'react';
import {
  X, Heart, Calendar, Gift, RefreshCw, Lock, Shield
} from 'lucide-react';
import { fetchPortalApi } from '../../utils/portalApi';
import { showToast } from '../../utils/toast';

const CONTRIBUTION_TYPES = [
  { id: 'General Donation', label: 'General Donation' },
  { id: 'Holiday Contribution', label: 'Holiday Contribution' },
  { id: 'Sponsorship', label: 'Sponsorship' },
];

const DEDICATION_TYPES = [
  { id: 'In Honor Of', label: 'In Honor Of' },
  { id: 'In Memory Of', label: 'In Memory Of' },
  { id: 'None', label: 'None (No Dedication)' },
];

const FREQUENCIES = [
  { id: 'Monthly', label: 'Monthly' },
  { id: 'Weekly', label: 'Weekly' },
  { id: 'Annually', label: 'Annually' },
];

function todayIsoDate() {
  return new Date().toISOString().split('T')[0];
}

export default function QuickPaymentModal({
  open,
  onClose,
  user,
  getAuthToken,
  sfData,
  onSuccess,
}) {
  const [billingMode, setBillingMode] = useState('one-time'); // 'one-time' or 'recurring'
  const [contributionType, setContributionType] = useState('General Donation');
  const [amount, setAmount] = useState('100.00');
  const [frequency, setFrequency] = useState('Monthly');
  const [startDate, setStartDate] = useState(todayIsoDate());
  const [dedicationType, setDedicationType] = useState('In Honor Of');
  const [dedicationName, setDedicationName] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const amountInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setBillingMode('one-time');
    setContributionType('General Donation');
    setAmount('100.00');
    setFrequency('Monthly');
    setStartDate(todayIsoDate());
    setDedicationType('In Honor Of');
    setDedicationName('');
    setNote('');
    setLoading(false);
  }, [open]);

  if (!open) return null;

  const handleAmountPillClick = (val) => {
    if (val === 'Other') {
      setAmount('');
      if (amountInputRef.current) {
        amountInputRef.current.focus();
      }
    } else {
      setAmount(Number(val).toFixed(2));
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const parsedAmount = parseFloat(amount) || 0;
    if (parsedAmount <= 0) {
      showToast({ message: 'Please enter a valid amount greater than 0.', type: 'error' });
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
          purpose: contributionType,
          paymentType: 'Donation',
          subType: 'General',
          memo: note || dedicationName ? `${dedicationType}: ${dedicationName}. Note: ${note}` : '',
          pledgeAmount: 0,
          paymentAmount: parsedAmount,
          billingMode: billingMode === 'recurring' ? 'recurring' : 'regular',
          frequency: frequency,
          paymentDate: startDate,
        },
      });

      if (data.url) {
        showToast({ message: 'Redirecting to secure Stripe checkout...', type: 'success', duration: 2500 });
        window.location.href = data.url;
        return;
      }

      if (data.success) {
        showToast({
          message: data.message || 'Saved to ChabadOne CRM successfully.',
          type: 'success',
        });
        if (onSuccess) {
          await onSuccess();
        }
        onClose();
      }
    } catch (err) {
      showToast({ message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const displayAmount = parseFloat(amount) || 0;
  const formattedBtnAmount = displayAmount > 0 ? `$${displayAmount.toFixed(2)}` : '';

  return (
    <div className="qc-modal-backdrop" onClick={onClose}>
      <style>{`
        .qc-modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1100;
          backdrop-filter: blur(8px);
          padding: 12px;
        }
        .qc-modal-card {
          width: 100%;
          max-width: 410px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          box-shadow: var(--glass-shadow);
          overflow: hidden;
          color: var(--text-primary);
          font-family: var(--font-body), sans-serif;
          position: relative;
          display: flex;
          flex-direction: column;
        }
        .qc-modal-header {
          padding: 14px 20px 6px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border-color);
        }
        .qc-header-info {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .qc-icon-wrapper {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: var(--color-primary-light);
          color: var(--color-primary);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .qc-header-text h2 {
          font-size: 15.5px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }
        .qc-close-btn {
          background: none;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          padding: 4px;
          border-radius: 50%;
          transition: background 0.2s;
        }
        .qc-close-btn:hover {
          background: var(--border-color);
          color: var(--text-primary);
        }
        .qc-form-body {
          padding: 14px 20px;
          max-height: 85vh;
          overflow-y: auto;
        }
        .qc-toggle-group {
          display: grid;
          grid-template-columns: 1fr 1fr;
          background: var(--bg-main);
          padding: 3px;
          border-radius: 10px;
          margin-bottom: 12px;
          border: 1px solid var(--border-color);
        }
        .qc-toggle-btn {
          border: none;
          background: none;
          padding: 7px;
          font-size: 12.5px;
          font-weight: 600;
          color: var(--text-secondary);
          border-radius: 7px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.2s;
        }
        .qc-toggle-btn.active {
          background: var(--color-primary);
          color: #ffffff;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
        }
        .qc-field {
          margin-bottom: 10px;
        }
        .qc-label {
          display: block;
          font-size: 11.5px;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 4px;
        }
        .qc-input-box {
          position: relative;
          display: flex;
          align-items: center;
          background: var(--bg-main);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          transition: border-color 0.2s;
        }
        .qc-input-box:focus-within {
          border-color: var(--border-focus);
        }
        .qc-input-icon {
          position: absolute;
          left: 10px;
          color: var(--text-secondary);
        }
        .qc-select {
          width: 100%;
          padding: 8px 10px 8px 30px;
          border: none;
          background: transparent;
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary);
          outline: none;
          cursor: pointer;
          -webkit-appearance: none;
          appearance: none;
        }
        /* Style standard options to render correctly in dark/light mode */
        .qc-select option {
          background-color: var(--bg-main);
          color: var(--text-primary);
        }
        .qc-select-arrow {
          position: absolute;
          right: 10px;
          pointer-events: none;
          color: var(--text-secondary);
          font-size: 9px;
        }
        .qc-amount-input-box {
          display: flex;
          align-items: center;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--bg-main);
          padding: 0 10px;
          transition: border-color 0.2s;
        }
        .qc-amount-input-box:focus-within {
          border-color: var(--border-focus);
        }
        .qc-amount-symbol {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-secondary);
          margin-right: 6px;
        }
        .qc-amount-input {
          width: 100%;
          border: none;
          background: transparent;
          padding: 8px 0;
          font-size: 14.5px;
          font-weight: 700;
          color: var(--text-primary);
          outline: none;
        }
        .qc-pills-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
          margin-top: 6px;
        }
        .qc-pill {
          border: 1px solid var(--border-color);
          background: var(--bg-main);
          padding: 6px;
          font-size: 11.5px;
          font-weight: 600;
          color: var(--text-secondary);
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: center;
        }
        .qc-pill:hover {
          background: var(--bg-card-hover);
          border-color: var(--text-secondary);
        }
        .qc-pill.active {
          background: var(--color-primary-light);
          border-color: var(--color-primary);
          color: var(--color-primary);
        }
        .qc-text-input {
          width: 100%;
          padding: 8px 10px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary);
          outline: none;
          background: var(--bg-main);
          transition: border-color 0.2s;
        }
        .qc-text-input:focus {
          border-color: var(--border-focus);
        }
        .qc-textarea {
          width: 100%;
          padding: 8px 10px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary);
          outline: none;
          background: var(--bg-main);
          resize: none;
          height: 48px;
          transition: border-color 0.2s;
        }
        .qc-textarea:focus {
          border-color: var(--border-focus);
        }
        .qc-char-counter {
          text-align: right;
          font-size: 9.5px;
          color: var(--text-muted);
          margin-top: 1px;
        }
        .qc-pay-btn {
          width: 100%;
          background: var(--color-primary);
          border: none;
          padding: 11px;
          border-radius: 8px;
          color: #ffffff;
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          margin-top: 12px;
          transition: background 0.2s;
        }
        .qc-pay-btn:hover {
          background: var(--color-primary-hover);
        }
        .qc-pay-btn:disabled {
          background: var(--border-color);
          color: var(--text-muted);
          cursor: not-allowed;
        }
        .qc-footer-text {
          text-align: center;
          font-size: 11px;
          color: var(--text-secondary);
          margin-top: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
        }
        .qc-bottom-banner {
          background: var(--bg-main);
          padding: 10px 20px;
          border-top: 1px solid var(--border-color);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .qc-bb-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .qc-bb-icon {
          color: var(--color-primary);
        }
        .qc-bb-text h4 {
          font-size: 11px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }
        .qc-bb-text p {
          font-size: 9px;
          color: var(--text-secondary);
          margin: 1px 0 0;
        }
        .qc-bb-badges {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 9px;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
        }
      `}</style>

      <div className="qc-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="qc-modal-header">
          <div className="qc-header-info">
            <div className="qc-icon-wrapper">
              <Gift size={16} />
            </div>
            <div className="qc-header-text">
              <h2>Quick Contribution</h2>
            </div>
          </div>
          <button type="button" className="qc-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="qc-form-body">
          <div className="qc-toggle-group">
            <button
              type="button"
              className={`qc-toggle-btn ${billingMode === 'one-time' ? 'active' : ''}`}
              onClick={() => setBillingMode('one-time')}
            >
              <Heart size={13} /> One-Time
            </button>
            <button
              type="button"
              className={`qc-toggle-btn ${billingMode === 'recurring' ? 'active' : ''}`}
              onClick={() => setBillingMode('recurring')}
            >
              <Calendar size={13} /> Recurring
            </button>
          </div>

          <div className="qc-field">
            <label className="qc-label">Contribution Type</label>
            <div className="qc-input-box">
              <Gift size={15} className="qc-input-icon" />
              <select
                className="qc-select"
                value={contributionType}
                onChange={(e) => setContributionType(e.target.value)}
              >
                {CONTRIBUTION_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
              <span className="qc-select-arrow">▼</span>
            </div>
          </div>

          <div className="qc-field" style={{ marginTop: '10px' }}>
            <label className="qc-label">Amount (USD)</label>
            <div className="qc-amount-input-box">
              <span className="qc-amount-symbol">$</span>
              <input
                ref={amountInputRef}
                type="number"
                min="1"
                step="0.01"
                className="qc-amount-input"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <div className="qc-pills-row">
              {['50', '100', '250'].map((val) => (
                <button
                  key={val}
                  type="button"
                  className={`qc-pill ${parseFloat(amount) === Number(val) ? 'active' : ''}`}
                  onClick={() => handleAmountPillClick(val)}
                >
                  ${val}
                </button>
              ))}
              <button
                type="button"
                className={`qc-pill ${!['50', '100', '250'].includes(parseFloat(amount).toString()) ? 'active' : ''}`}
                onClick={() => handleAmountPillClick('Other')}
              >
                Other
              </button>
            </div>
          </div>

          {billingMode === 'recurring' && (
            <>
              <div className="qc-field">
                <label className="qc-label">Frequency</label>
                <div className="qc-input-box">
                  <RefreshCw size={14} className="qc-input-icon" />
                  <select
                    className="qc-select"
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value)}
                  >
                    {FREQUENCIES.map((f) => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>
                  <span className="qc-select-arrow">▼</span>
                </div>
              </div>

              <div className="qc-field" style={{ marginTop: '10px' }}>
                <label className="qc-label">Start Date</label>
                <div className="qc-input-box">
                  <Calendar size={14} className="qc-input-icon" />
                  <input
                    type="date"
                    className="qc-select"
                    style={{ paddingLeft: '30px' }}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>
              </div>
            </>
          )}

          <div className="qc-field" style={{ marginTop: '10px' }}>
            <label className="qc-label">Dedication (Optional)</label>
            <div className="qc-input-box">
              <Gift size={14} className="qc-input-icon" />
              <select
                className="qc-select"
                value={dedicationType}
                onChange={(e) => setDedicationType(e.target.value)}
              >
                {DEDICATION_TYPES.map((d) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
              <span className="qc-select-arrow">▼</span>
            </div>
          </div>

          {dedicationType !== 'None' && (
            <>
              <div className="qc-field" style={{ marginTop: '10px' }}>
                <label className="qc-label">Dedication Name</label>
                <input
                  type="text"
                  className="qc-text-input"
                  value={dedicationName}
                  onChange={(e) => setDedicationName(e.target.value)}
                  placeholder="Someone's Name"
                />
              </div>

              <div style={{ marginTop: '10px', marginBottom: '10px' }}>
                <textarea
                  className="qc-textarea"
                  maxLength={150}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a note (optional)"
                />
                <div className="qc-char-counter">{note.length}/150</div>
              </div>
            </>
          )}

          <button type="submit" className="qc-pay-btn" disabled={loading}>
            <Lock size={14} />
            {loading ? (
              'Processing...'
            ) : billingMode === 'one-time' ? (
              `Pay ${formattedBtnAmount} Now`
            ) : (
              'Start Monthly Giving'
            )}
          </button>

          <div className="qc-footer-text">
            {billingMode === 'one-time' ? (
              <>
                <Lock size={11} /> Secure payment powered by Stripe
              </>
            ) : (
              <>
                <RefreshCw size={11} /> You can cancel or update anytime.
              </>
            )}
          </div>
        </form>

        <div className="qc-bottom-banner">
          <div className="qc-bb-left">
            <Shield size={16} className="qc-bb-icon" />
            <div className="qc-bb-text">
              <h4>Secure & Trusted</h4>
              <p>All payments are encrypted and securely processed by Stripe.</p>
            </div>
          </div>
          <div className="qc-bb-badges">
            <span>stripe</span>
            <Lock size={11} style={{ color: '#94a3b8' }} />
            <span style={{ fontSize: '8.5px', border: '1px solid var(--border-color)', padding: '0px 2px', borderRadius: '2px' }}>PCI</span>
          </div>
        </div>
      </div>
    </div>
  );
}
