import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.jsx'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Publishable Key")
}

const allowedRedirectOrigins = [
  'http://localhost:5174',
  ...(import.meta.env.VITE_APP_URL
    ? [String(import.meta.env.VITE_APP_URL).replace(/\/$/, '')]
    : []),
];

createRoot(document.getElementById('root')).render(
  <ClerkProvider
    publishableKey={PUBLISHABLE_KEY}
    afterSignInUrl="/"
    afterSignUpUrl="/"
    signInForceRedirectUrl="/"
    signUpForceRedirectUrl="/"
    allowedRedirectOrigins={allowedRedirectOrigins}
  >
    <App />
  </ClerkProvider>,
)
