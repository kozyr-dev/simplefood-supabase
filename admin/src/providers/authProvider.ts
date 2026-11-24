import type { AuthProvider } from 'react-admin';
import { currentUser, login, logout, refreshSession } from './http';

/** Resources only admins open; editors don't even see them in the menu. */
const ADMIN_ONLY = new Set(['users']);

/**
 * Sessions through /api/admin/auth. After a page reload the app knows
 * nothing: checkAuth() asks for a new access token with the cookie.
 */
export const authProvider: AuthProvider = {
  /** From LoginWithEmail (App.tsx): accounts log in by email only. */
  async login({ email, password }: { email: string; password: string }) {
    await login(email, password);
  },

  logout,

  async checkAuth() {
    if (!currentUser() && !(await refreshSession())) {
      throw new Error('Signed out');
    }
  },

  async checkError(error: { status?: number }) {
    // 403 is "not for your role", not "signed out": stay signed in.
    if (error?.status === 401) throw error;
  },

  async getIdentity() {
    const user = currentUser();
    if (!user) throw new Error('Signed out');
    return { id: user.id, fullName: user.name };
  },

  async getPermissions() {
    return currentUser()?.role;
  },

  /** Hides what the server would refuse anyway (it checks every call). */
  async canAccess({ resource, action }) {
    const role = currentUser()?.role;
    if (!role) return false;
    if (ADMIN_ONLY.has(resource)) return role === 'admin';
    if (resource === 'contact-messages' && action === 'delete') {
      return role === 'admin';
    }
    return true;
  },
};
