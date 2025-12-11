import { useState } from "react";
import { authAPI } from "@lib/apis/authApi";
import { FaSignOutAlt, FaUser, FaTrash } from "react-icons/fa";
import { toast } from "react-toastify";
import { clearDatabase } from "@lib/db/storage";

interface HeaderProps {
  onLogout?: () => void;
  onAccountDeleted?: () => void;
}

const Header = ({ onLogout, onAccountDeleted }: HeaderProps) => {
  const user = authAPI.getUser();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      // Clear local database first
      await clearDatabase();
      
      // Delete account on server
      await authAPI.deleteAccount();
      
      toast.success("Account deleted successfully");
      
      // Notify parent component
      if (onAccountDeleted) {
        onAccountDeleted();
      } else if (onLogout) {
        onLogout();
      }
    } catch (error) {
      console.error("Failed to delete account:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete account");
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
      <header className="bg-gray-50 border-b border-gray-400 top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">Video Recorder</h1>
              <p className="text-gray-400 text-sm mt-1">Record, manage, and upload your videos</p>
            </div>
            {user && (
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <FaUser className="text-gray-500" />
                    <span>{user.username || user.email}</span>
                  </div>
                  <div className="text-xs text-gray-500">{user.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 rounded-lg text-sm font-medium text-red-700 transition-colors"
                    title="Delete account"
                    disabled={isDeleting}
                  >
                    <FaTrash />
                    <span>Delete Account</span>
                  </button>
                  {onLogout && (
                    <button
                      onClick={onLogout}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
                      title="Sign out"
                    >
                      <FaSignOutAlt />
                      <span>Sign Out</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-gray-900/80 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Delete Account</h2>
            <p className="text-gray-700 mb-6">
              Are you sure you want to delete your account? This action cannot be undone and will permanently delete:
            </p>
            <ul className="list-disc list-inside text-gray-600 mb-6 space-y-1">
              <li>Your account and profile</li>
              <li>All your videos (local and cloud)</li>
              <li>All associated data</li>
            </ul>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <FaTrash />
                    <span>Delete Account</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Header;