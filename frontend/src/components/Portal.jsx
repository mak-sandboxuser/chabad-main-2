import React, { useEffect, useState } from 'react';
import { 
  Users, Calendar, 
  LogOut, Menu, X, Plus, Bell, Shield, Heart, Search, User,
  Moon, Sun, Mail, Phone, Headphones, Settings as SettingsIcon
} from 'lucide-react';
import PortalSidebar, { getPortalPageTitle } from './PortalSidebar';
import DashboardHome from './DashboardHome';
import MembershipPage from './pages/MembershipPage';
import HouseholdPage from './pages/HouseholdPage';
import MemberDetailsPage from './pages/MemberDetailsPage';
import FinancialOverviewPage from './pages/FinancialOverviewPage';
import FinancialsPage from './pages/FinancialsPage';
import ContributionsPage from './pages/ContributionsPage';
import ProfilePage from './pages/ProfilePage';
import QuickPaymentModal from './shared/QuickPaymentModal';
import { showToast } from '../utils/toast';
import { fetchPortalApi } from '../utils/portalApi';

const PENDING_CHECKOUT_SESSION_KEY = 'pending_checkout_session_id';
const syncingCheckoutSessions = new Set();

async function syncCheckoutSession(sessionId, getAuthToken) {
  if (!sessionId || syncingCheckoutSessions.has(sessionId)) return false;
  syncingCheckoutSessions.add(sessionId);
  try {
    await fetchPortalApi('/api/payments/confirm-checkout', {
      getAuthToken,
      method: 'POST',
      body: { sessionId },
    });
    sessionStorage.removeItem(PENDING_CHECKOUT_SESSION_KEY);
    return true;
  } finally {
    syncingCheckoutSessions.delete(sessionId);
  }
}

export default function Portal({ user, getAuthToken, onLogout }) {
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
  const [showDonateModal, setShowDonateModal] = useState(false);
  const [paymentAlert, setPaymentAlert] = useState(null);

  const fetchDashboardData = async () => {
    try {
      const data = await fetchPortalApi('/api/portal/dashboard', { getAuthToken });
      setError('');
      setStats(data.stats);
      setMembers(data.members);
      setEvents(data.events);
      setSfData(data.sfData);
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    }
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      await fetchDashboardData();
      if (!cancelled) setLoading(false);
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [getAuthToken]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const isPaymentSuccess = params.get('payment') === 'success';
    const isPaymentCancel = params.get('payment') === 'cancel';

    if (isPaymentSuccess && sessionId) {
      sessionStorage.setItem(PENDING_CHECKOUT_SESSION_KEY, sessionId);
    }

    const handlePaymentReturn = async () => {
      if (isPaymentSuccess) {
        showToast({ message: 'Payment successful! Your records will update shortly.', type: 'success' });
        setPaymentAlert({ type: 'success', message: 'Thank you! Your payment was completed and is being verified.' });

        const checkoutSessionId = sessionId || sessionStorage.getItem(PENDING_CHECKOUT_SESSION_KEY);
        if (checkoutSessionId) {
          try {
            await syncCheckoutSession(checkoutSessionId, getAuthToken);
            showToast({ message: 'Payment synced to ChabadOne CRM.', type: 'success' });
            setPaymentAlert({ type: 'success', message: 'Payment synced to ChabadOne CRM. Records will update shortly.' });
          } catch (err) {
            console.error('Payment sync error:', err);
            setPaymentAlert({
              type: 'success',
              message: 'Payment received. Retrying CRM sync — refresh in a moment if records do not appear.',
            });
          }
        }

        await fetchDashboardData();
        window.setTimeout(() => { fetchDashboardData(); }, 4000);
        window.setTimeout(() => { fetchDashboardData(); }, 12000);
        window.history.replaceState({}, '', window.location.pathname);
      } else if (isPaymentCancel) {
        showToast({ message: 'Payment cancelled. No charges were made.', type: 'error' });
        setPaymentAlert({ type: 'cancel', message: 'Payment cancelled. No charges were made.' });
        sessionStorage.removeItem(PENDING_CHECKOUT_SESSION_KEY);
        window.history.replaceState({}, '', window.location.pathname);
      }
    };

    handlePaymentReturn();
  }, [getAuthToken]);

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
              sfData={sfData}
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
              onDonate={() => setShowDonateModal(true)}
            />
          )}

          {activeTab === 'member-details' && (
            <MemberDetailsPage
              theme={theme}
              member={selectedMember}
              sfData={sfData}
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
            <FinancialsPage
              theme={theme}
              sfData={sfData}
              defaultTab="payments"
              onDonate={() => setShowDonateModal(true)}
            />
          )}

          {activeTab === 'recurring' && (
            <FinancialsPage
              theme={theme}
              sfData={sfData}
              defaultTab="recurring"
              onDonate={() => setShowDonateModal(true)}
            />
          )}

          {activeTab === 'notifications' && (
            <div className="portal-page-shell">
              <div className="portal-page-intro glass-panel">
                <h2>Notifications</h2>
                <p>Stay updated on membership, billing, and community announcements.</p>
              </div>
              <div className="portal-empty-state glass-panel">
                <h3>No notifications</h3>
                <p>Notifications from Salesforce and billing will appear here when available.</p>
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
            <ProfilePage
              user={user}
              getAuthToken={getAuthToken}
              sfData={sfData}
              onProfileUpdated={setSfData}
            />
          )}

        </div>
      </main>

      <QuickPaymentModal
        open={showDonateModal}
        onClose={() => setShowDonateModal(false)}
        user={user}
        getAuthToken={getAuthToken}
        sfData={sfData}
        onSuccess={fetchDashboardData}
      />
    </div>
  );
}
