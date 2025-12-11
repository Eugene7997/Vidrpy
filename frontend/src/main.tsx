import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import './globals.css';
import App from './App.tsx';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// Configuration error component
function ConfigurationError() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full">
        <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 p-6 border border-yellow-200 dark:border-yellow-800">
          <h1 className="text-xl font-bold text-yellow-800 dark:text-yellow-200 mb-3">
            Configuration Error
          </h1>
          <div className="text-sm text-yellow-800 dark:text-yellow-200 space-y-2">
            <p>
              <strong>Google Client ID is not configured.</strong>
            </p>
            <p>
              Please add <code className="bg-yellow-100 dark:bg-yellow-800 px-1 rounded">VITE_GOOGLE_CLIENT_ID</code> to your <code className="bg-yellow-100 dark:bg-yellow-800 px-1 rounded">.env</code> file in the <code className="bg-yellow-100 dark:bg-yellow-800 px-1 rounded">frontend/</code> directory.
            </p>
            <p className="mt-4 pt-4 border-t border-yellow-200 dark:border-yellow-700">
              Get your Client ID from{' '}
              <a 
                href="https://console.cloud.google.com/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-yellow-900 dark:text-yellow-100 underline hover:text-yellow-700 dark:hover:text-yellow-300"
              >
                Google Cloud Console
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Only initialize GoogleOAuthProvider if client ID is configured
const AppWrapper = () => {
  if (!GOOGLE_CLIENT_ID) {
    return <ConfigurationError />;
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppWrapper />
  </StrictMode>,
);
