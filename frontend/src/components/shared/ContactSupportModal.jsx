import React, { useState } from 'react';
import { X, Headphones, Lock, Send } from 'lucide-react';
import { showToast } from '../../utils/toast';

const SUBJECTS = [
  'Account Access Issue',
  'Payment or Donation Question',
  'Membership Information',
  'Event & Calendar Question',
  'Update Personal Details',
  'Technical Issue',
  'Other',
];

export default function ContactSupportModal({ open, onClose, user, sfData }) {
  const [name, setName] = useState(user?.name || sfData?.firstName ? `${sfData?.firstName || ''} ${sfData?.lastName || ''}`.trim() : '');
  const [email, setEmail] = useState(user?.email || '');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !subject || !message.trim()) {
      showToast({ message: 'Please fill in all required fields.', type: 'error' });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`https://hook.us2.make.com/emc539ndg790is34fhglo42zaanodm2y`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'contact_support',
          name,
          email,
          subject,
          message,
        }),
      });
      if (res.ok) {
        showToast({ message: 'Your message has been sent! We\'ll get back to you soon.', type: 'success', duration: 4000 });
        setMessage('');
        setSubject('');
        onClose();
      } else {
        throw new Error('Failed to send message.');
      }
    } catch (err) {
      showToast({ message: err.message || 'Something went wrong. Please try again.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cs-backdrop" onClick={onClose}>
      <style>{`
        .cs-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1200;
          padding: 16px;
        }
        .cs-modal {
          width: 100%;
          max-width: 600px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 18px;
          box-shadow: var(--glass-shadow);
          font-family: var(--font-body), sans-serif;
          color: var(--text-primary);
          overflow: hidden;
        }
        .cs-header {
          padding: 18px 24px 14px;
          border-bottom: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .cs-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .cs-icon-wrap {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: var(--color-primary-light);
          color: var(--color-primary);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .cs-header h2 {
          font-size: 16px;
          font-weight: 700;
          margin: 0;
          color: var(--text-primary);
        }
        .cs-header p {
          font-size: 12px;
          color: var(--text-secondary);
          margin: 2px 0 0;
        }
        .cs-close {
          background: none;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          padding: 4px;
          border-radius: 50%;
          transition: background 0.2s;
        }
        .cs-close:hover {
          background: var(--border-color);
          color: var(--text-primary);
        }
        .cs-body {
          padding: 20px 24px 24px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .cs-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .cs-field {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .cs-label {
          font-size: 11.5px;
          font-weight: 600;
          color: var(--text-secondary);
        }
        .cs-label span {
          color: var(--color-danger, #ef4444);
          margin-left: 2px;
        }
        .cs-input, .cs-select, .cs-textarea {
          width: 100%;
          padding: 9px 12px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--bg-main);
          color: var(--text-primary);
          font-size: 13px;
          font-family: var(--font-body), sans-serif;
          outline: none;
          transition: border-color 0.2s;
          box-sizing: border-box;
        }
        .cs-input:focus, .cs-select:focus, .cs-textarea:focus {
          border-color: var(--border-focus);
        }
        .cs-select option {
          background: var(--bg-main);
          color: var(--text-primary);
        }
        .cs-textarea {
          resize: vertical;
          min-height: 130px;
        }
        .cs-footer {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 4px;
        }
        .cs-submit {
          background: var(--color-primary);
          border: none;
          padding: 10px 22px;
          border-radius: 8px;
          color: #fff;
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 7px;
          transition: background 0.2s;
          white-space: nowrap;
        }
        .cs-submit:hover {
          background: var(--color-primary-hover);
        }
        .cs-submit:disabled {
          background: var(--border-color);
          cursor: not-allowed;
        }
        .cs-secure-note {
          font-size: 11px;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          gap: 5px;
        }
      `}</style>

      <div className="cs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cs-header">
          <div className="cs-header-left">
            <div className="cs-icon-wrap">
              <Headphones size={18} />
            </div>
            <div>
              <h2>Contact Support</h2>
              <p>We're here to help you with any questions about your account.</p>
            </div>
          </div>
          <button type="button" className="cs-close" onClick={onClose}><X size={18} /></button>
        </div>

        <form className="cs-body" onSubmit={handleSubmit}>
          <div className="cs-row">
            <div className="cs-field">
              <label className="cs-label">Full Name<span>*</span></label>
              <input
                type="text"
                className="cs-input"
                placeholder="Enter your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="cs-field">
              <label className="cs-label">Email Address<span>*</span></label>
              <input
                type="email"
                className="cs-input"
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="cs-field">
            <label className="cs-label">Subject<span>*</span></label>
            <select
              className="cs-select"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            >
              <option value="">Select a subject</option>
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="cs-field">
            <label className="cs-label">Your Message<span>*</span></label>
            <textarea
              className="cs-textarea"
              placeholder="How can we help you?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
          </div>

          <div className="cs-footer">
            <button type="submit" className="cs-submit" disabled={loading}>
              <Send size={14} />
              {loading ? 'Sending...' : 'Send Message'}
            </button>
            <span className="cs-secure-note">
              <Lock size={11} /> Your message is secure and private.
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
