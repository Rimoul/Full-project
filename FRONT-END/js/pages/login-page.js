
/* Seasonal Swaad login/signup/recovery UI wired to the cookie-session API. */
(() => {
  'use strict';
  const auth = window.SeasonalSwaadAuth;
  const $ = (id) => document.getElementById(id);
  const screen = document.querySelector('.ss-login-screen');
  const background = document.querySelector('.ss-login-background-image');
  const heading = $('ssLoginHeading');
  const subtitle = $('ssLoginSubtitle');
  const footer = $('ssLoginFooterText');
  const extras = $('ssLoginLoginExtras');
  const views = [...document.querySelectorAll('[data-ss-login-view]')];
  let pendingEmail = sessionStorage.getItem('ss_pending_verification_email') || '';
  let resetToken = new URLSearchParams(window.location.search).get('token') || '';
  let resendInterval = null;

  const copy = {
    login: ['Login', 'Welcome back! Login to continue to Seasonal Swaad.', `Don't have an account? <a href="#signup" id="ssLoginSignuplink">Sign Up</a>`],
    signup: ['Create your account', 'Join Seasonal Swaad to enjoy the taste of tradition.', `Already have an account? <a href="#login" id="ssLoginBackToLogin">Login</a>`],
    verify: ['Verify your email', 'One more step to protect your new account.', `Entered the wrong email? <a href="#signup" id="ssLoginBackToSignup">Go back</a>`],
    forgot: ['Forgot your password?', 'Enter your registered email address and we’ll send reset instructions.', `<a href="#login" id="ssLoginBackToLogin">← Back to Login</a>`],
    reset: ['Choose a new password', 'Create a new password for your Seasonal Swaad account.', `<a href="#login" id="ssLoginBackToLogin">← Back to Login</a>`]
  };

  function showMessage(id, text, kind = 'error') {
    const element = $(id);
    if (!element) return;
    element.textContent = text || '';
    if (kind === 'success') element.dataset.kind = 'success';
    else delete element.dataset.kind;
  }

  function setBusy(form, busy, busyText) {
    const button = form.querySelector('button[type="submit"]');
    if (!button) return;
    if (busy) {
      button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.textContent = busyText || 'Please wait…';
    } else {
      button.disabled = false;
      if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
  }

  function showView(name) {
    views.forEach((view) => { view.hidden = view.dataset.ssLoginView !== name; });
    heading.textContent = copy[name][0];
    subtitle.textContent = copy[name][1];
    footer.innerHTML = copy[name][2];
    extras.hidden = name !== 'login';
    document.title = `${copy[name][0]} | Seasonal Swaad`;
    document.querySelectorAll('.ss-login-message').forEach((element) => {
      element.textContent = '';
      delete element.dataset.kind;
    });
    const active = document.querySelector(`[data-ss-login-view="${name}"] input`);
    active?.focus({ preventScroll: true });
  }

  function goHome() {
    // The session credential is an HttpOnly cookie. Never store it in localStorage.
    window.location.assign('/index.html');
  }

  function startResendCooldown(seconds = 60) {
    const button = $('ssLoginResendverify');
    const timer = $('ssLoginResendTimer');
    if (resendInterval) clearInterval(resendInterval);
    let left = seconds;
    button.disabled = true;
    timer.hidden = false;
    const tick = () => {
      timer.textContent = `(${Math.floor(left / 60).toString().padStart(2, '0')}:${(left % 60).toString().padStart(2, '0')})`;
      if (left <= 0) {
        clearInterval(resendInterval);
        resendInterval = null;
        button.disabled = false;
        timer.hidden = true;
        timer.textContent = '';
        return;
      }
      left -= 1;
    };
    tick();
    resendInterval = setInterval(tick, 1000);
  }

  function isValidEmail(value) {
    const input = document.createElement('input');
    input.type = 'email';
    input.value = value;
    return input.checkValidity();
  }

  // Keep the background/card reveal behavior from the original design.
  const revealPage = () => {
    if (!screen) return;
    if (background && background.decode) background.decode().catch(() => {}).finally(() => screen.classList.add('ss-login-background-ready'));
    else screen.classList.add('ss-login-background-ready');
  };
  if (background && background.complete && background.naturalWidth > 0) revealPage();
  else if (background) {
    background.addEventListener('load', revealPage, { once: true });
    background.addEventListener('error', () => screen?.classList.add('ss-login-background-ready'), { once: true });
  } else screen?.classList.add('ss-login-background-ready');

  document.addEventListener('click', (event) => {
    const link = event.target.closest('#ssLoginSignuplink, #ssLoginForgotlink, #ssLoginBackToLogin, #ssLoginBackToSignup');
    if (!link) return;
    event.preventDefault();
    if (link.id === 'ssLoginSignuplink' || link.id === 'ssLoginBackToSignup') showView('signup');
    else if (link.id === 'ssLoginForgotlink') showView('forgot');
    else showView('login');
  });

  const password = $('ssLoginPassword');
  const showPassword = $('ssLoginShowpassword');
  const eyeOpen = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const eyeClosed = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path d="m3 3 18 18"/></svg>';
  showPassword?.addEventListener('click', () => {
    const reveal = password.type === 'password';
    password.type = reveal ? 'text' : 'password';
    showPassword.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
    showPassword.setAttribute('aria-pressed', String(reveal));
    showPassword.innerHTML = reveal ? eyeOpen : eyeClosed;
  });

  $('ssLoginLoginform').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = $('ssLoginIdentifier').value.trim().toLowerCase();
    const pass = password.value;
    if (!isValidEmail(email)) { showMessage('ssLoginMessage', 'Enter a valid email address.'); $('ssLoginIdentifier').focus(); return; }
    if (!pass) { showMessage('ssLoginMessage', 'Enter your password.'); password.focus(); return; }
    if (!auth) { showMessage('ssLoginMessage', 'Authentication client failed to load. Refresh the page and try again.'); return; }
    setBusy(form, true, 'Logging in…');
    try {
      await auth.login(email, pass);
      showMessage('ssLoginMessage', 'Login successful. Redirecting…', 'success');
      goHome();
    } catch (error) {
      showMessage('ssLoginMessage', error.message || 'Unable to log in. Please try again.');
    } finally { setBusy(form, false); }
  });

  $('ssLoginSignupform').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fullName = $('ssLoginFullname').value.trim().replace(/\s+/g, ' ');
    const email = $('ssLoginSignupIdentifier').value.trim().toLowerCase();
    const pass = $('ssLoginSignupPassword').value;
    const confirm = $('ssLoginSignupConfirmPassword').value;
    if (!fullName) { showMessage('ssLoginSignupMessage', 'Enter your full name.'); $('ssLoginFullname').focus(); return; }
    if (!isValidEmail(email)) { showMessage('ssLoginSignupMessage', 'Enter a valid email address.'); $('ssLoginSignupIdentifier').focus(); return; }
    if (pass !== confirm) { showMessage('ssLoginSignupMessage', 'The passwords do not match.'); $('ssLoginSignupConfirmPassword').focus(); return; }
    if (!auth) { showMessage('ssLoginSignupMessage', 'Authentication client failed to load. Refresh the page and try again.'); return; }
    const parts = fullName.split(' ');
    const first_name = parts.shift();
    const last_name = parts.join(' ') || null;
    setBusy(form, true, 'Creating account…');
    try {
      await auth.register({ first_name, last_name, email, password: pass });
      pendingEmail = email;
      sessionStorage.setItem('ss_pending_verification_email', email);
      sessionStorage.setItem('ss_pending_verification_view', '1');
      $('ssLoginVerifyEmailSummary').textContent = `Enter the 6-digit code sent to ${email}. The code expires in 10 minutes.`;
      showView('verify');
      startResendCooldown(60);
      showMessage('ssLoginVerifyMessage', 'Check your inbox, including the spam folder.', 'success');
    } catch (error) {
      if (error.status === 429 || (error.status === 503 && /account request was saved/i.test(error.message || ''))) {
        pendingEmail = email;
        sessionStorage.setItem('ss_pending_verification_email', email);
        sessionStorage.setItem('ss_pending_verification_view', '1');
        $('ssLoginVerifyEmailSummary').textContent = `Verification status for ${email}.`;
        showView('verify');
        startResendCooldown(60);
        showMessage('ssLoginVerifyMessage', error.message || 'Please wait, then try resending the verification code.');
      } else {
        showMessage('ssLoginSignupMessage', error.message || 'Could not create the account. Please try again.');
      }
    } finally { setBusy(form, false); }
  });

  $('ssLoginVerifyform').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const otp = $('ssLoginVerificationCode').value.trim();
    if (!pendingEmail) { showMessage('ssLoginVerifyMessage', 'Please return to Sign Up and enter your email again.'); return; }
    if (!/^\d{6}$/.test(otp)) { showMessage('ssLoginVerifyMessage', 'Enter the 6-digit code from your email.'); return; }
    setBusy(form, true, 'Verifying…');
    try {
      await auth.verifyEmail(pendingEmail, otp);
      sessionStorage.removeItem('ss_pending_verification_email');
      sessionStorage.removeItem('ss_pending_verification_view');
      showMessage('ssLoginVerifyMessage', 'Email verified. Redirecting…', 'success');
      if (resendInterval) clearInterval(resendInterval);
      goHome();
    } catch (error) {
      showMessage('ssLoginVerifyMessage', error.message || 'Could not verify this code.');
    } finally { setBusy(form, false); }
  });

  $('ssLoginResendverify').addEventListener('click', async () => {
    if (!pendingEmail) { showMessage('ssLoginVerifyMessage', 'Return to Sign Up and enter your email again.'); return; }
    $('ssLoginResendverify').disabled = true;
    try {
      await auth.resendVerification(pendingEmail);
      showMessage('ssLoginVerifyMessage', 'If eligible, a new verification code has been sent.', 'success');
      startResendCooldown(60);
    } catch (error) {
      showMessage('ssLoginVerifyMessage', error.message || 'Could not resend the code.');
      $('ssLoginResendverify').disabled = false;
    }
  });

  $('ssLoginForgotform').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = $('ssLoginRecoveryIdentifier').value.trim().toLowerCase();
    if (!isValidEmail(email)) { showMessage('ssLoginForgotMessage', 'Enter a valid email address.'); $('ssLoginRecoveryIdentifier').focus(); return; }
    setBusy(form, true, 'Sending…');
    try {
      const result = await auth.forgotPassword(email);
      showMessage('ssLoginForgotMessage', result.message || 'If an eligible account exists, reset instructions will be sent.', 'success');
    } catch (error) {
      showMessage('ssLoginForgotMessage', error.message || 'Could not submit the request. Please try again.');
    } finally { setBusy(form, false); }
  });

  $('ssLoginResetform').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const newPassword = $('ssLoginResetPassword').value;
    const confirmPassword = $('ssLoginResetConfirmPassword').value;
    if (!resetToken) { showMessage('ssLoginResetMessage', 'The reset link is missing its token. Request a new password reset.'); return; }
    if (newPassword !== confirmPassword) { showMessage('ssLoginResetMessage', 'The passwords do not match.'); $('ssLoginResetConfirmPassword').focus(); return; }
    setBusy(form, true, 'Updating…');
    try {
      const result = await auth.resetPassword(resetToken, newPassword);
      resetToken = '';
      showView('login');
      showMessage('ssLoginMessage', result.message || 'Password updated. Please log in.', 'success');
      history.replaceState({}, document.title, window.location.pathname);
    } catch (error) {
      showMessage('ssLoginResetMessage', error.message || 'Could not reset the password. Request a new link.');
    } finally { setBusy(form, false); }
  });

  document.querySelectorAll('[data-ss-login-provider]').forEach((button) => button.addEventListener('click', () => {
    const provider = button.dataset.ssLoginProvider;
    if (provider !== 'Google') {
      showMessage('ssLoginMessage', `${provider} sign-in is not configured yet.`);
      return;
    }
    const clientId = window.SEASONAL_SWAAD_GOOGLE_CLIENT_ID;
    if (!clientId || !window.google?.accounts?.id) {
      showMessage('ssLoginMessage', 'Google sign-in is not configured yet. Set the frontend Google client ID and backend GOOGLE_CLIENT_ID first.');
      return;
    }
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (credentialResponse) => {
        try {
          await auth.googleLogin(credentialResponse.credential);
          goHome();
        } catch (error) {
          showMessage('ssLoginMessage', error.message || 'Google sign-in failed.');
        }
      }
    });
    window.google.accounts.id.prompt();
  }));

  // Password-reset emails open this page with ?view=reset&token=... . Remove the token
  // from the visible URL/history once it has been captured in memory.
  const urlView = new URLSearchParams(window.location.search).get('view');
  if (urlView === 'reset') {
    history.replaceState({}, document.title, window.location.pathname);
    showView('reset');
    if (!resetToken) showMessage('ssLoginResetMessage', 'This reset link is incomplete. Request a new password reset.');
  } else if (pendingEmail && sessionStorage.getItem('ss_pending_verification_view') === '1') {
    $('ssLoginVerifyEmailSummary').textContent = `Enter the 6-digit code sent to ${pendingEmail}.`;
    showView('verify');
  } else {
    showView('login');
  }
})();
