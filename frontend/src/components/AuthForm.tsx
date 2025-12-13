import { useState } from "react";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { authAPI } from "@lib/apis/authApi";

interface AuthFormProps {
  onSuccess: () => void;
}

export function AuthForm({ onSuccess }: AuthFormProps) {
  const [error, setError] = useState("");
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    setError("");
    
    if (!credentialResponse.credential) {
      setError("No credential received from Google");
      return;
    }
    
    try {
      await authAPI.loginWithGoogle(credentialResponse.credential);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google authentication failed");
    }
  };

  const handleGoogleError = () => {
    if (!GOOGLE_CLIENT_ID) {
      setError("Google Client ID is not configured. Please set VITE_GOOGLE_CLIENT_ID in your .env file.");
    } else {
      setError("Google authentication failed. Please check that your origin is authorized in Google Cloud Console.");
    }
  };

  if (!GOOGLE_CLIENT_ID) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="max-w-md w-full space-y-8">
          <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 p-4">
            <div className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>Configuration Error:</strong> Google Client ID is not set. 
              Please add <code className="bg-yellow-100 dark:bg-yellow-800 px-1 rounded">VITE_GOOGLE_CLIENT_ID</code> to your <code className="bg-yellow-100 dark:bg-yellow-800 px-1 rounded">.env</code> file.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h1 className="mt-6 text-center text-3xl font-bold text-gray-900 dark:text-white">
            Sign in to your account
          </h1>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Use your Google account to continue
          </p>
        </div>
        
        <div className="mt-8 space-y-6">
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
              <div className="text-sm text-red-800 dark:text-red-200">{error}</div>
            </div>
          )}

          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={handleGoogleError}
              useOneTap
            />
          </div>
        </div>
      </div>
    </div>
  );
}
