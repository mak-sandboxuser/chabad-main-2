import React, { useState } from 'react';
import { DollarSign, Lock, X } from 'lucide-react';
import { fetchPortalApi } from '../../utils/portalApi';

export default function QuickPaymentModal({
  open,
  onClose,
  user,
  getAuthToken,
  sfData,
  defaultAmount = '50',
  purpose = 'Chabad Bedford Payment',
}) {
  const [amount, setAmount] = useState(defaultAmount);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) return;

    setLoading(true);
    try {
      const data = await fetchPortalApi('/api/payments/create-checkout-session', {
        getAuthToken,
        method: 'POST',
        body: {
          email: user?.email,
          amount: parsed,
          contactId: sfData?.contactId || '',
          purpose,
        },
      });
      if (data.url) window.location.href = data.url;
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="portal-modal-backdrop">
      <div className="portal-modal glass-panel">
        <div className="portal-modal-header">
          <h2><DollarSign size={20} /> Quick Payment</h2>
          <button type="button" className="portal-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="portal-modal-copy">
          Pay membership, pledges, or contributions securely through Stripe.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="quick-pay-presets">
            {['25', '50', '100', '150'].map((value) => (
              <button
                key={value}
                type="button"
                className={`quick-pay-preset ${amount === value ? 'active' : ''}`}
                onClick={() => setAmount(value)}
              >
                ${value}
              </button>
            ))}
          </div>
          <label className="profile-field-label">Amount (USD)</label>
          <div className="profile-field-box profile-field-box--editable">
            <input
              type="number"
              min="1"
              step="0.01"
              className="profile-field-input"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </div>
          <button type="submit" className="dash-btn-gold full-width" disabled={loading}>
            <Lock size={16} /> {loading ? 'Redirecting...' : 'Continue to Secure Checkout'}
          </button>
        </form>
      </div>
    </div>
  );
}
