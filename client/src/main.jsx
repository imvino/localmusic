import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import { ClerkProvider } from '@clerk/clerk-react'
import { AuthProvider } from './components/AuthGate.jsx'
import { installGlobalErrorHandlers } from './utils/errorReporter'
import './index.css'
import App from './App.jsx'

installGlobalErrorHandlers()

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HelmetProvider>
      {clerkKey ? (
        <ClerkProvider publishableKey={clerkKey}>
          <AuthProvider><App /></AuthProvider>
        </ClerkProvider>
      ) : (
        <AuthProvider><App /></AuthProvider>
      )}
    </HelmetProvider>
  </StrictMode>,
)