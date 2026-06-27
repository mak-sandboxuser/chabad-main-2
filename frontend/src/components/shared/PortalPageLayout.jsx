import React from 'react';
import { Shield, ChevronRight } from 'lucide-react';
import BuildingSketch from './BuildingSketch';

export function PortalPageFooter() {
  return (
    <footer className="portal-page-footer">
      <span>© {new Date().getFullYear()} Chabad Bedford. All rights reserved.</span>
      <div className="portal-page-footer-links">
        <a href="#">Privacy Policy</a>
        <span>|</span>
        <a href="#">Terms of Service</a>
        <span>|</span>
        <a href="mailto:support@chabadbedford.com">Contact Support</a>
      </div>
    </footer>
  );
}

export default function PortalPageLayout({
  theme,
  title,
  subtitle,
  breadcrumbs = [],
  showSketch = true,
  children,
}) {
  return (
    <div className="portal-page-layout">
      {breadcrumbs.length > 0 && (
        <nav className="portal-breadcrumbs" aria-label="Breadcrumb">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.label} className="breadcrumb-item">
              {i > 0 && <ChevronRight size={14} className="breadcrumb-sep" />}
              {crumb.onClick ? (
                <button type="button" onClick={crumb.onClick} className="breadcrumb-link">
                  {crumb.label}
                </button>
              ) : (
                <span className={i === breadcrumbs.length - 1 ? 'breadcrumb-current' : ''}>
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      )}

      {(title || subtitle) && (
      <div className="portal-page-hero glass-panel">
        <div className="portal-page-hero-text">
          {title && <h2>{title}</h2>}
          {subtitle && <p>{subtitle}</p>}
        </div>
        {showSketch && <BuildingSketch theme={theme} className="portal-page-hero-sketch" />}
      </div>
      )}

      <div className="portal-page-meta-bar">
        <span className="portal-secure-badge">
          <Shield size={14} />
          Secure Member Portal
        </span>
        <span className="portal-meta-divider">|</span>
        <span className="portal-meta-text">Last sign-in: Today at 9:15 AM</span>
      </div>

      {children}
      <PortalPageFooter />
    </div>
  );
}
