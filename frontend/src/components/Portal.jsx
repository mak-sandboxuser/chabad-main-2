import React, { useEffect, useState } from 'react';
import { 
  Users, Calendar, DollarSign, 
  LogOut, Menu, X, Plus, Bell, Shield, Heart, Search, User,
  Moon, Sun, Mail, Phone, Headphones, Settings as SettingsIcon
} from 'lucide-react';
import PortalSidebar, { getPortalPageTitle } from './PortalSidebar';
import DashboardHome from './DashboardHome';
import MembershipPage from './pages/MembershipPage';
import HouseholdPage from './pages/HouseholdPage';
import MemberDetailsPage from './pages/MemberDetailsPage';
import FinancialOverviewPage from './pages/FinancialOverviewPage';
import ContributionsPage from './pages/ContributionsPage';
import { apiUrl } from '../config/api';

export default function Portal({ user, token, onLogout }) {
  const [stats, setStats] = useState(null);
  const [members, setMembers] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedMember, setSelectedMember] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light-theme');
    } else {
      root.classList.remove('light-theme');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  const handleNavigate = (tabId) => {
    setActiveTab(tabId);
    if (tabId !== 'member-details') setSelectedMember(null);
    setSidebarOpen(false);
  };

  const handleViewMember = (member) => {
    setSelectedMember(member);
    setActiveTab('member-details');
    setSidebarOpen(false);
  };
  
  const [sfData, setSfData] = useState(null);
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    street: '',
    city: '',
    state: '',
    postalCode: '',
    country: ''
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileAlert, setProfileAlert] = useState(null);
  
  // Stripe Donation flow states
  const [showDonateModal, setShowDonateModal] = useState(false);
  const [donateAmount, setDonateAmount] = useState('50');
  const [donationLoading, setDonationLoading] = useState(false);
  const [paymentAlert, setPaymentAlert] = useState(null);

  // Check URL search parameters for success/cancel redirects from Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      setPaymentAlert({ type: 'success', message: 'Thank you! Your donation was completed and is being verified.' });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('payment') === 'cancel') {
      setPaymentAlert({ type: 'cancel', message: 'Payment cancelled. No charges were made.' });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleDonateSubmit = async (e) => {
    e.preventDefault();
    if (!donateAmount || isNaN(donateAmount) || parseFloat(donateAmount) <= 0) {
      alert("Please enter a valid donation amount.");
      return;
    }

    setDonationLoading(true);
    try {
      const response = await fetch(apiUrl('/api/payments/create-checkout-session'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: user?.email,
          amount: parseFloat(donateAmount)
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to initialize Stripe checkout session.');
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      alert(`Donation checkout session failed: ${err.message}`);
    } finally {
      setDonationLoading(false);
    }
  };

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const response = await fetch(apiUrl('/api/portal/dashboard'), {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch dashboard data.');
        }

        setStats(data.stats);
        setMembers(data.members);
        setEvents(data.events);
        setSfData(data.sfData);

        if (data.sfData) {
          const names = (data.sfData.name || '').split(' ');
          const fName = names[0] || '';
          const lName = names.slice(1).join(' ') || '';
          
          setProfileForm({
            firstName: fName,
            lastName: lName,
            phone: data.sfData.profile?.phone || '',
            street: data.sfData.profile?.street || '',
            city: data.sfData.profile?.city || '',
            state: data.sfData.profile?.state || '',
            postalCode: data.sfData.profile?.postalCode || '',
            country: data.sfData.profile?.country || ''
          });
        }
      } catch (err) {
        setError(err.message);
        // If session expired, auto logout after a delay
        if (err.message.includes('expired') || err.message.includes('Authorization')) {
          setTimeout(onLogout, 3000);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [token, onLogout]);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileAlert(null);
    try {
      const response = await fetch(apiUrl('/api/portal/update-profile'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(profileForm)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update profile.');
      }

      setSfData(data.sfData);
      setProfileAlert({ type: 'success', message: 'Profile updated and synced with Salesforce successfully!' });
      setTimeout(() => setProfileAlert(null), 5000);
    } catch (err) {
      setProfileAlert({ type: 'error', message: err.message });
    } finally {
      setProfileSaving(false);
    }
  };

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  const getInitials = (email) => {
    if (!email) return 'U';
    return email.split('@')[0].substring(0, 2).toUpperCase();
  };

  const formatDateDay = (dateStr) => {
    const d = new Date(dateStr);
    return d.getDate();
  };

  const formatDateMonth = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleString('default', { month: 'short' });
  };

  if (loading) {
    return (
      <div className="verify-container">
        <div className="spinner"></div>
        <p style={{ color: 'var(--text-secondary)' }}>Loading your dashboard portal...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="verify-container">
        <div className="login-card glass-panel" style={{ textAlign: 'center' }}>
          <h2 style={{ color: 'var(--color-danger)', marginBottom: '16px' }}>Portal Access Error</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>{error}</p>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={onLogout}>
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-layout">
      <PortalSidebar
        activeTab={activeTab}
        onNavigate={handleNavigate}
        isOpen={sidebarOpen}
        theme={theme}
      />

      {/* Main Content */}
      <main className="portal-content">
        {/* Header */}
        <header className="portal-header">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button className="mobile-toggle" onClick={toggleSidebar}>
              {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <div className="header-title">
              <h1>{getPortalPageTitle(activeTab)}</h1>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              type="button"
              className="portal-header-bell"
              onClick={() => handleNavigate('notifications')}
              title="Notifications"
            >
              <Bell size={20} />
              <span className="header-notif-badge">3</span>
            </button>
            <button
              type="button"
              className="theme-toggle-btn portal-header-theme"
              onClick={toggleTheme}
              title="Toggle theme"
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <div className="user-profile">
              <div className="avatar">
                {getInitials(user?.email)}
              </div>
              <div className="user-info" style={{ display: 'flex' }}>
                <span className="user-email">{sfData?.name || user?.email}</span>
                <span className="user-role">{user?.role || 'Member'}</span>
              </div>
            </div>
            <button type="button" className="btn btn-secondary portal-signout" onClick={onLogout}>
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        </header>

        {/* Dashboard Grid */}
        <div className="dashboard-grid">
          
          {/* Payment Alert Banner */}
          {paymentAlert && (
            <div className="glass-panel" style={{
              padding: '16px 20px',
              background: paymentAlert.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: paymentAlert.type === 'success' ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
              color: paymentAlert.type === 'success' ? '#10b981' : '#ef4444',
              borderRadius: '12px',
              marginBottom: '20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
              zIndex: 1
            }}>
              <span style={{ fontSize: '14px', fontWeight: '500' }}>{paymentAlert.message}</span>
              <button 
                onClick={() => setPaymentAlert(null)} 
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '18px', fontWeight: 'bold' }}
              >
                ×
              </button>
            </div>
          )}

          {activeTab === 'dashboard' && (
            <>
              <DashboardHome
                theme={theme}
                user={user}
                sfData={sfData}
                onNavigate={handleNavigate}
                onDonate={() => setShowDonateModal(true)}
              />
              <footer className="portal-page-footer">
                <span>© {new Date().getFullYear()} Chabad Bedford. All rights reserved.</span>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <a href="#">Privacy Policy</a>
                  <a href="#">Terms of Service</a>
                </div>
              </footer>
            </>
          )}

          {activeTab === 'membership' && (
            <MembershipPage
              theme={theme}
              onNavigate={handleNavigate}
              onDonate={() => setShowDonateModal(true)}
            />
          )}

          {activeTab === 'household' && (
            <HouseholdPage
              theme={theme}
              sfData={sfData}
              onNavigate={handleNavigate}
              onViewMember={handleViewMember}
            />
          )}

          {activeTab === 'member-details' && (
            <MemberDetailsPage
              theme={theme}
              member={selectedMember}
              onNavigate={handleNavigate}
            />
          )}

          {activeTab === 'financial' && (
            <FinancialOverviewPage
              theme={theme}
              sfData={sfData}
              onNavigate={handleNavigate}
              onDonate={() => setShowDonateModal(true)}
            />
          )}

          {activeTab === 'contributions' && (
            <ContributionsPage
              theme={theme}
              sfData={sfData}
              onDonate={() => setShowDonateModal(true)}
            />
          )}

          {activeTab === 'payments' && (
            <div className="portal-page-shell">
              <div className="portal-page-intro glass-panel">
                <h2>Payments</h2>
                <p>View your payment history, methods, and transaction status.</p>
              </div>
              <div className="section-box glass-panel" style={{ padding: '24px' }}>
                <div className="table-wrapper">
                  <table className="members-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type / Purpose</th>
                        <th>Method</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sfData?.financials?.payments?.length > 0 ? (
                        sfData.financials.payments.map((p, idx) => (
                          <tr key={p.id || idx}>
                            <td style={{ color: 'var(--text-secondary)' }}>{p.date}</td>
                            <td style={{ fontWeight: 600 }}>{p.type}</td>
                            <td>{p.method}</td>
                            <td>
                              <span className="badge badge-active" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                                {p.status || 'Paid'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>{p.amount}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>
                            No payment logs found on file.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'recurring' && (
            <div className="portal-page-shell">
              <div className="portal-page-intro glass-panel">
                <h2>Recurring Contributions</h2>
                <p>Manage your recurring donations and monthly pledges.</p>
              </div>
              <div className="portal-empty-state glass-panel">
                <h3>No recurring contributions yet</h3>
                <p>Set up a recurring donation to support Chabad Bedford on an ongoing basis.</p>
                <button className="btn btn-primary" style={{ marginTop: '20px' }} onClick={() => setShowDonateModal(true)}>
                  <DollarSign size={16} /> Start Recurring Gift
                </button>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="portal-page-shell">
              <div className="portal-page-intro glass-panel">
                <h2>Notifications</h2>
                <p>Stay updated on membership, billing, and community announcements.</p>
              </div>
              <div className="notification-list">
                {[
                  { title: 'Membership renewal reminder', body: 'Your annual membership renewal is coming up next month.', time: '2 days ago', unread: true },
                  { title: 'Contribution receipt available', body: 'Your latest donation receipt has been added to your account.', time: '1 week ago', unread: true },
                  { title: 'Household profile updated', body: 'Your household contact information was successfully synced.', time: '2 weeks ago', unread: false },
                  { title: 'Welcome to Chabad Bedford Portal', body: 'Your secure member portal is now active.', time: '1 month ago', unread: false },
                ].map((n, i) => (
                  <div key={i} className={`notification-item ${n.unread ? 'unread' : ''}`}>
                    <Bell size={18} style={{ color: 'var(--color-accent)', flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ flex: 1 }}>
                      <h4>{n.title}</h4>
                      <p>{n.body}</p>
                    </div>
                    <time>{n.time}</time>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="portal-page-shell">
              <div className="portal-page-intro glass-panel">
                <h2>Settings</h2>
                <p>Manage your account preferences, notifications, and security options.</p>
              </div>
              <div className="glass-panel" style={{ padding: '28px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <SettingsIcon size={18} /> Account Preferences
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '14px', fontWeight: '500' }}>Email notifications</span>
                    <input type="checkbox" defaultChecked />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '14px', fontWeight: '500' }}>Billing reminders</span>
                    <input type="checkbox" defaultChecked />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0' }}>
                    <span style={{ fontSize: '14px', fontWeight: '500' }}>Community announcements</span>
                    <input type="checkbox" defaultChecked />
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'help' && (
            <div className="portal-page-shell">
              <div className="portal-page-intro glass-panel">
                <h2>Help & Support</h2>
                <p>Get assistance with your membership portal, billing, or household account.</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
                <div className="glass-panel" style={{ padding: '28px' }}>
                  <Mail size={22} style={{ color: 'var(--color-accent)', marginBottom: '12px' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>Email Support</h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.5 }}>Send us a message and we&apos;ll respond within one business day.</p>
                  <a href="mailto:support@chabadbedford.com" style={{ color: 'var(--color-accent)', fontWeight: 600, fontSize: '14px' }}>support@chabadbedford.com</a>
                </div>
                <div className="glass-panel" style={{ padding: '28px' }}>
                  <Phone size={22} style={{ color: 'var(--color-accent)', marginBottom: '12px' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>Phone Support</h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.5 }}>Call our office during business hours for immediate assistance.</p>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px' }}>(914) 555-0123</span>
                </div>
                <div className="glass-panel" style={{ padding: '28px' }}>
                  <Headphones size={22} style={{ color: 'var(--color-accent)', marginBottom: '12px' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>Contact Support</h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.5 }}>We&apos;re here to help you with any questions about your account.</p>
                  <a href="mailto:support@chabadbedford.com" className="btn btn-secondary" style={{ marginTop: '4px' }}>Get Help</a>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="profile-container" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Profile Edit Card */}
              <div className="glass-panel" style={{ padding: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
                  <User size={24} style={{ color: 'var(--color-primary)' }} />
                  <div>
                    <h2 style={{ fontSize: '20px', fontWeight: '600' }}>Edit Salesforce Profile</h2>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Update your contact information. Changes will sync directly to Salesforce.</p>
                  </div>
                </div>

                {profileAlert && (
                  <div style={{
                    padding: '12px 16px',
                    background: profileAlert.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    border: profileAlert.type === 'success' ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
                    color: profileAlert.type === 'success' ? '#10b981' : '#ef4444',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}>
                    {profileAlert.message}
                  </div>
                )}

                <form onSubmit={handleProfileSubmit}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '32px', marginBottom: '24px' }}>
                    {/* General info */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <h3 style={{ fontSize: '15px', color: 'var(--color-primary)', fontWeight: '600', marginBottom: '4px' }}>General Details</h3>
                      
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">First Name</label>
                        <input
                          type="text"
                          className="form-input"
                          style={{ paddingLeft: '16px' }}
                          value={profileForm.firstName}
                          onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })}
                          required
                        />
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Last Name</label>
                        <input
                          type="text"
                          className="form-input"
                          style={{ paddingLeft: '16px' }}
                          value={profileForm.lastName}
                          onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })}
                          required
                        />
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Email Address (Read-only)</label>
                        <input
                          type="email"
                          className="form-input"
                          style={{ paddingLeft: '16px', opacity: 0.6, cursor: 'not-allowed' }}
                          value={user?.email || ''}
                          readOnly
                        />
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Phone Number</label>
                        <input
                          type="text"
                          className="form-input"
                          style={{ paddingLeft: '16px' }}
                          placeholder="(555) 123-4567"
                          value={profileForm.phone}
                          onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                        />
                      </div>
                    </div>

                    {/* Address info */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <h3 style={{ fontSize: '15px', color: 'var(--color-primary)', fontWeight: '600', marginBottom: '4px' }}>Address Details</h3>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Street Address</label>
                        <input
                          type="text"
                          className="form-input"
                          style={{ paddingLeft: '16px' }}
                          value={profileForm.street}
                          onChange={(e) => setProfileForm({ ...profileForm, street: e.target.value })}
                        />
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">City</label>
                        <input
                          type="text"
                          className="form-input"
                          style={{ paddingLeft: '16px' }}
                          value={profileForm.city}
                          onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label">State</label>
                          <input
                            type="text"
                            className="form-input"
                            style={{ paddingLeft: '16px' }}
                            value={profileForm.state}
                            onChange={(e) => setProfileForm({ ...profileForm, state: e.target.value })}
                          />
                        </div>

                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label">Postal Code</label>
                          <input
                            type="text"
                            className="form-input"
                            style={{ paddingLeft: '16px' }}
                            value={profileForm.postalCode}
                            onChange={(e) => setProfileForm({ ...profileForm, postalCode: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Country</label>
                        <input
                          type="text"
                          className="form-input"
                          style={{ paddingLeft: '16px' }}
                          value={profileForm.country}
                          onChange={(e) => setProfileForm({ ...profileForm, country: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                    <button type="submit" className="btn btn-primary" style={{ minWidth: '150px' }} disabled={profileSaving}>
                      {profileSaving ? 'Saving Changes...' : 'Save Profile'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Household Metadata Cards */}
              {sfData && sfData.profile && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
                  {/* CRM Info */}
                  <div className="glass-panel" style={{ padding: '24px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: 'var(--color-accent)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Shield size={18} /> CRM Account & Roles
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '8px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Household Account</span>
                        <span style={{ fontSize: '13.5px', fontWeight: '500' }}>{sfData.profile.accountName}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '8px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Member Role</span>
                        <span style={{ fontSize: '13.5px', fontWeight: '500', color: 'var(--color-primary)' }}>{sfData.role || 'Member'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '4px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Total Giving (Household)</span>
                        <span style={{ fontSize: '13.5px', fontWeight: '600', color: 'var(--color-success)' }}>{sfData.profile.householdDonationTotal || '$0.00'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Spiritual Info */}
                  <div className="glass-panel" style={{ padding: '24px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: 'var(--color-accent)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Heart size={18} /> Spiritual Details
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '8px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Kosher Home</span>
                        <span style={{ fontSize: '13.5px', fontWeight: '500' }}>{sfData.profile.spiritual?.kosher || 'No'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '8px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Has Charity Box (Pushka)</span>
                        <span style={{ fontSize: '13.5px', fontWeight: '500' }}>{sfData.profile.spiritual?.hasPushka || 'No'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '4px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Pushka Last Emptied</span>
                        <span style={{ fontSize: '13.5px', fontWeight: '500' }}>{sfData.profile.spiritual?.datePushkaLastEmptied || 'Never'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Associated Household Contacts & Relationships */}
              {sfData && (sfData.contacts?.length > 0 || sfData.relationships?.length > 0) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
                  {sfData.contacts && sfData.contacts.length > 0 && (
                    <div className="glass-panel" style={{ padding: '24px' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: 'var(--color-primary)' }}>Household Contacts</h3>
                      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {sfData.contacts.map((contact, idx) => (
                          <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: idx < sfData.contacts.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', paddingBottom: '8px' }}>
                            <div>
                              <div style={{ fontSize: '14px', fontWeight: '500' }}>{contact.name}</div>
                              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{contact.role}</div>
                            </div>
                            {contact.isPrimary && <span className="badge badge-active" style={{ fontSize: '9px', padding: '2px 6px' }}>Primary</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {sfData.relationships && sfData.relationships.length > 0 && (
                    <div className="glass-panel" style={{ padding: '24px' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: 'var(--color-primary)' }}>Family Relationships</h3>
                      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {sfData.relationships.map((rel, idx) => (
                          <li key={idx} style={{ borderBottom: idx < sfData.relationships.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', paddingBottom: '8px' }}>
                            <div style={{ fontSize: '13.5px', fontWeight: '500' }}>{rel.explanation}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', gap: '8px', marginTop: '2px' }}>
                              <span>Type: {rel.type}</span>
                              <span>•</span>
                              <span>Status: {rel.status}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      {/* Donate Modal */}
      {showDonateModal && (
        <div className="verify-container" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(10, 15, 30, 0.85)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="login-card glass-panel" style={{ width: '400px', padding: '32px' }}>
            <h2 style={{ fontSize: '20px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DollarSign size={20} style={{ color: 'var(--color-primary)' }} /> Make a Donation
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px', marginBottom: '24px', lineHeight: '1.6' }}>
              Support Chabad Bedford. Select or enter an amount to proceed to secure checkout (Sandbox).
            </p>

            <form onSubmit={handleDonateSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
                {['10', '50', '100'].map(val => (
                  <button
                    key={val}
                    type="button"
                    className={`btn ${donateAmount === val ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '8px 0', fontSize: '14px', cursor: 'pointer' }}
                    onClick={() => setDonateAmount(val)}
                  >
                    ${val}
                  </button>
                ))}
              </div>

              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label className="form-label">Or enter custom amount ($)</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="50.00"
                  value={donateAmount}
                  onChange={(e) => setDonateAmount(e.target.value)}
                  min="1"
                  required
                  disabled={donationLoading}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: '50%', padding: '10px', cursor: 'pointer' }}
                  onClick={() => setShowDonateModal(false)}
                  disabled={donationLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '50%', padding: '10px', cursor: 'pointer' }}
                  disabled={donationLoading}
                >
                  {donationLoading ? 'Redirecting...' : 'Donate Now'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
