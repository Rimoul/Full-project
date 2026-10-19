// Login page UI and view switching. Authentication is intentionally left for the backend integration.
(() => {
  const screen = document.querySelector('.ss-login-screen');
  const background = document.querySelector('.ss-login-background-image');
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

  const heading = document.getElementById('ssLoginHeading');
  const subtitle = document.getElementById('ssLoginSubtitle');
  const footer = document.getElementById('ssLoginFooterText');
  const extras = document.getElementById('ssLoginLoginExtras');
  const views = [...document.querySelectorAll('[data-ss-login-view]')];
  const copy = {
    login: ['Login', 'Welcome back! Login to continue to Seasonal Swaad.', `Don't have an account? <a href="#signup" id="ssLoginSignuplink">Sign Up</a>`],
    signup: ['Create your account', 'Join Seasonal Swaad to enjoy the taste of tradition.', `Already have an account? <a href="#login" id="ssLoginBackToLogin">Login</a>`],
    forgot: ['Forgot your password?', 'Enter your email address or mobile number and we’ll help you reset your password.', `<a href="#login" id="ssLoginBackToLogin">← Back to Login</a>`]
  };
  function showView(name) {
    views.forEach(view => { view.hidden = view.dataset.ssLoginView !== name; });
    heading.textContent = copy[name][0];
    subtitle.textContent = copy[name][1];
    footer.innerHTML = copy[name][2];
    extras.hidden = name !== 'login';
    document.title = `${copy[name][0]} | Seasonal Swaad`;
    document.querySelectorAll('.ss-login-message').forEach(el => { el.textContent = ''; });
    const active = document.querySelector(`[data-ss-login-view="${name}"] input`);
    active?.focus({ preventScroll: true });
    if (name === 'signup') window.dispatchEvent(new CustomEvent('seasonalSwaad:signupView'));
    if (name === 'forgot') window.dispatchEvent(new CustomEvent('seasonalSwaad:forgotPasswordView'));
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('#ssLoginSignuplink, #ssLoginForgotlink, #ssLoginBackToLogin');
    if (!link) return;
    event.preventDefault();
    if (link.id === 'ssLoginSignuplink') showView('signup');
    else if (link.id === 'ssLoginForgotlink') showView('forgot');
    else showView('login');
  });

  const password = document.getElementById('ssLoginPassword');
  const showPassword = document.getElementById('ssLoginShowpassword');
  const eyeOpen = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const eyeClosed = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path d="m3 3 18 18"/></svg>';
  showPassword.addEventListener('click', () => {
    const reveal = password.type === 'password';
    password.type = reveal ? 'text' : 'password';
    showPassword.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
    showPassword.setAttribute('aria-pressed', String(reveal));
    showPassword.innerHTML = reveal ? eyeOpen : eyeClosed;
  });

  document.getElementById('ssLoginLoginform').addEventListener('submit', event => {
    event.preventDefault();
    const identifier = document.getElementById('ssLoginIdentifier').value.trim();
    const message = document.getElementById('ssLoginMessage');
    if (!identifier) { message.textContent = 'Enter your email address or mobile number.'; document.getElementById('ssLoginIdentifier').focus(); return; }
    if (!password.value) { message.textContent = 'Enter your password.'; password.focus(); return; }
    window.dispatchEvent(new CustomEvent('seasonalSwaad:loginSubmit', { detail: { identifier, password: password.value } }));
    message.textContent = 'Login form is ready to connect to your authentication API.';
  });
  document.getElementById('ssLoginSignupform').addEventListener('submit', event => {
    event.preventDefault();
    const fullName = document.getElementById('ssLoginFullname').value.trim();
    const identifier = document.getElementById('ssLoginSignupIdentifier').value.trim();
    const passwordValue = document.getElementById('ssLoginSignupPassword').value;
    const message = document.getElementById('ssLoginSignupMessage');
    if (!fullName || !identifier || !passwordValue) { message.textContent = 'Please complete all fields.'; return; }
    window.dispatchEvent(new CustomEvent('seasonalSwaad:signupSubmit', { detail: { fullName, identifier, password: passwordValue } }));
    message.textContent = 'Your account form is ready to connect to registration.';
  });
  document.getElementById('ssLoginForgotform').addEventListener('submit', event => {
    event.preventDefault();
    const identifier = document.getElementById('ssLoginRecoveryIdentifier').value.trim();
    const message = document.getElementById('ssLoginForgotMessage');
    if (!identifier) { message.textContent = 'Enter your email address or mobile number.'; document.getElementById('ssLoginRecoveryIdentifier').focus(); return; }
    window.dispatchEvent(new CustomEvent('seasonalSwaad:forgotPasswordSubmit', { detail: { identifier } }));
    message.textContent = 'Password reset will be available once the recovery flow is connected.';
  });
  document.querySelectorAll('[data-ss-login-provider]').forEach(button => button.addEventListener('click', () => {
    const provider = button.dataset.ssLoginProvider;
    window.dispatchEvent(new CustomEvent('seasonalSwaad:socialLogin', { detail: { provider } }));
    document.getElementById('ssLoginMessage').textContent = `${provider} login will be available once configured.`;
  }));
})();