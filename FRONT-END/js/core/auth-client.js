/* Shared client for the cookie-based FastAPI auth API.
   No bearer/session token is placed in localStorage; the browser manages the HttpOnly cookie. */
(() => {
  'use strict';

  const API_BASE_URL = (window.SEASONAL_SWAAD_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      credentials: 'include',
      cache: 'no-store'
    });

    let data = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await response.json().catch(() => null);
    } else {
      data = await response.text().catch(() => '');
    }

    if (!response.ok) {
      const detail = data && typeof data === 'object' ? data.detail || data.message : null;
      const message = Array.isArray(detail)
        ? detail.map(item => item.msg || 'Invalid input').join(' ')
        : (detail || `Request failed (${response.status}).`);
      const error = new Error(message);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  const auth = {
    apiBaseUrl: API_BASE_URL,
    login: (email, password) => request('/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password })
    }),
    register: (payload) => request('/auth/register', {
      method: 'POST', body: JSON.stringify(payload)
    }),
    verifyEmail: (email, otp_code) => request('/auth/verify-email', {
      method: 'POST', body: JSON.stringify({ email, otp_code })
    }),
    resendVerification: (email) => request('/auth/resend-verification', {
      method: 'POST', body: JSON.stringify({ email })
    }),
    forgotPassword: (email) => request('/auth/forgot-password', {
      method: 'POST', body: JSON.stringify({ email })
    }),
    resetPassword: (token, new_password) => request('/auth/reset-password', {
      method: 'POST', body: JSON.stringify({ token, new_password })
    }),
    me: () => request('/auth/me', { method: 'GET' }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    googleLogin: (credential) => request('/auth/google', {
      method: 'POST', body: JSON.stringify({ credential })
    })
  };

  window.SeasonalSwaadAuth = Object.freeze(auth);
})();