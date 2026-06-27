import React from 'react';
import { SignUp } from '@clerk/clerk-react';

export default function SignUpPage() {
  return (
    <div className="login-container">
      <div className="bg-glow"></div>
      <div className="bg-glow-2"></div>

      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', minHeight: '100vh', zIndex: 1 }}>
        <SignUp 
          signInUrl="/"
          appearance={{
            variables: {
              colorPrimary: '#6366f1',
              colorBackground: '#141b2d',
              colorText: '#ffffff',
              colorTextSecondary: '#9ca3af',
              colorInputBackground: '#1e293b',
              colorInputText: '#ffffff',
              colorBorder: 'rgba(255, 255, 255, 0.1)'
            },
            elements: {
              card: {
                background: 'rgba(20, 27, 45, 0.65)',
                backdropFilter: 'blur(16px) saturate(180%)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
                borderRadius: '16px'
              },
              headerTitle: {
                color: '#ffffff',
                fontFamily: 'inherit'
              },
              headerSubtitle: {
                color: '#9ca3af',
                fontFamily: 'inherit'
              },
              socialButtonsBlockButton: {
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#ffffff',
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.1)'
                }
              },
              formButtonPrimary: {
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)'
                }
              },
              footerActionLink: {
                color: '#818cf8',
                '&:hover': {
                  color: '#6366f1'
                }
              },
              dividerText: {
                color: '#9ca3af'
              },
              formFieldLabel: {
                color: '#ffffff'
              },
              identityPreviewText: {
                color: '#ffffff'
              },
              identityPreviewEditButtonIcon: {
                color: '#818cf8'
              }
            }
          }}
        />
      </div>
    </div>
  );
}
