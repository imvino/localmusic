import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.jsx'

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HelmetProvider>
      {clerkKey ? (
        <ClerkProvider publishableKey={clerkKey}>
          <App />
        </ClerkProvider>
      ) : (
        <App />
      )}
    </HelmetProvider>
  </StrictMode>,
)