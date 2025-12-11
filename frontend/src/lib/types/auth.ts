export interface User {
  user_id: string;
  email: string;
  username?: string;
  created_at: string;
  last_modified: string;
  last_login?: string;
}


export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}
