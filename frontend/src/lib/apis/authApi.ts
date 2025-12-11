import type { User, UserCreate, UserLogin, TokenResponse } from "@lib/types/auth";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

class AuthAPI {
  private baseUrl = `${API_BASE_URL}/api/v1/auth`;
  private tokenKey = "auth_token";
  private userKey = "auth_user";

  // Get stored token
  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  // Get stored user
  getUser(): User | null {
    const userStr = localStorage.getItem(this.userKey);
    return userStr ? JSON.parse(userStr) : null;
  }

  // Store token and user
  private storeAuth(tokenResponse: TokenResponse): void {
    localStorage.setItem(this.tokenKey, tokenResponse.access_token);
    localStorage.setItem(this.userKey, JSON.stringify(tokenResponse.user));
  }

  // Clear auth data
  clearAuth(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return !!this.getToken();
  }


  // Login user with Google OAuth
  async loginWithGoogle(token: string): Promise<TokenResponse> {
    const response = await fetch(`${this.baseUrl}/google`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(error.detail || "Google authentication failed");
    }

    const tokenResponse: TokenResponse = await response.json();
    this.storeAuth(tokenResponse);
    return tokenResponse;
  }

  // Logout user
  logout(): void {
    this.clearAuth();
  }

  // Get current user info from server
  async getCurrentUser(): Promise<User> {
    const token = this.getToken();
    if (!token) {
      throw new Error("Not authenticated");
    }

    const response = await fetch(`${this.baseUrl}/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        this.clearAuth();
        throw new Error("Session expired");
      }
      throw new Error(`Failed to fetch user: ${response.statusText}`);
    }

    const user: User = await response.json();
    localStorage.setItem(this.userKey, JSON.stringify(user));
    return user;
  }

  // Get auth headers for API requests
  getAuthHeaders(): HeadersInit {
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}

export const authAPI = new AuthAPI();
