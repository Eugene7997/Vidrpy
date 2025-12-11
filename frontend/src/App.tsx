import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import HomePage from "@pages/HomePage";
import { AuthForm } from "@components/AuthForm";
import { authAPI } from "@lib/apis/authApi";
import { clearDatabase } from "@lib/db/storage";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(authAPI.isAuthenticated());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const verifyAuth = async () => {
      if (authAPI.isAuthenticated()) {
        try {
          await authAPI.getCurrentUser();
          setIsAuthenticated(true);
        } catch (error) {
          console.error("Auth verification failed:", error);
          if (error instanceof Error && error.message === "Session expired") {
            // Token expired or invalid
            authAPI.clearAuth();
            setIsAuthenticated(false);
          } else {
            // Network error or server down - AP mode
            // If we have a user cached, we stay logged in
            if (authAPI.getUser()) {
              setIsAuthenticated(true);
            } else {
              // No cached user, can't really work offline
              authAPI.clearAuth();
              setIsAuthenticated(false);
            }
          }
        }
      }
      setIsLoading(false);
    };

    verifyAuth();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-900 dark:text-white">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthForm onSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage onLogout={async () => {
          await clearDatabase();
          authAPI.logout();
          setIsAuthenticated(false);
        }} />} />
      </Routes>
      <ToastContainer
        position="bottom-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
      />
    </BrowserRouter>
  );
}

export default App;
