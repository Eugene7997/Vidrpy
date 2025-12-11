import { authAPI } from "@lib/apis/authApi";
import { FaSignOutAlt, FaUser } from "react-icons/fa";

interface HeaderProps {
  onLogout?: () => void;
}

const Header = ({ onLogout }: HeaderProps) => {
  const user = authAPI.getUser();

  return (
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
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;