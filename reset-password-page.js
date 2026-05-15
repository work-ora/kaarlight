function setMessage(text, type) {
      const msg = document.getElementById('reset-msg');
      msg.textContent = text;
      msg.className = `reset-msg ${type}`;
    }

    function getOAuthConfig() {
      if (window.KAARLIGHT_OAUTH_CONFIG && typeof window.KAARLIGHT_OAUTH_CONFIG === 'object') {
        return window.KAARLIGHT_OAUTH_CONFIG;
      }
      if (window.AFG_OAUTH_CONFIG && typeof window.AFG_OAUTH_CONFIG === 'object') {
        return window.AFG_OAUTH_CONFIG;
      }
      try {
        const fromStorage = JSON.parse(
          localStorage.getItem('kaarlight_oauth_config')
          || localStorage.getItem('afg_oauth_config')
          || 'null'
        );
        return fromStorage && typeof fromStorage === 'object' ? fromStorage : null;
      } catch {
        return null;
      }
    }

    function hasValidOAuthConfig(config) {
      const required = ['apiKey', 'authDomain', 'projectId', 'appId'];
      return !!config && required.every((key) => typeof config[key] === 'string' && config[key].trim() !== '');
    }

    function ensureFirebaseAuth() {
      const config = getOAuthConfig();
      if (!hasValidOAuthConfig(config)) {
        return {
          error: 'Password reset is not configured yet. Add Firebase config first.'
        };
      }

      if (!window.firebase || !window.firebase.auth) {
        return {
          error: 'Firebase SDK failed to load. Check network and try again.'
        };
      }

      try {
        const app = window.firebase.apps && window.firebase.apps.length
          ? window.firebase.app()
          : window.firebase.initializeApp(config);
        return { auth: window.firebase.auth(app) };
      } catch {
        return {
          error: 'Failed to initialize password reset. Check Firebase config values.'
        };
      }
    }

    function getLocalAccount(email) {
      try {
        const users = JSON.parse(localStorage.getItem('afg_users') || '[]');
        if (!Array.isArray(users)) return null;
        return users.find((user) => String(user.email || '').trim().toLowerCase() === email) || null;
      } catch {
        return null;
      }
    }

    document.getElementById('reset-form').addEventListener('submit', async (event) => {
      event.preventDefault();

      const submitBtn = event.submitter || event.currentTarget.querySelector('button[type="submit"]');
      const email = document.getElementById('reset-email').value.trim().toLowerCase();
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';
      }

      const finish = (message, type = 'success') => {
        setMessage(message, type);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send Reset Email';
        }
      };

      const localAccount = getLocalAccount(email);
      if (localAccount && !localAccount.oauthUid && localAccount.authSource !== 'firebase') {
        finish('If this account can be reset online, we will send a reset email. Browser-only accounts must change password from Profile after signing in.');
        return;
      }

      const init = ensureFirebaseAuth();
      if (!init.auth) {
        finish(init.error, 'error');
        return;
      }

      try {
        await init.auth.sendPasswordResetEmail(email);
        finish('If an account exists for that email, a reset link will be sent. Check your inbox and spam folder.');
      } catch (err) {
        const code = err && err.code ? String(err.code) : '';
        if (code === 'auth/invalid-email') {
          finish('Invalid email address.', 'error');
          return;
        }
        if (code === 'auth/user-not-found') {
          finish('If an account exists for that email, a reset link will be sent. Check your inbox and spam folder.');
          return;
        }
        if (code === 'auth/operation-not-supported-in-this-environment') {
          finish('Use http://localhost or HTTPS. File protocol is not supported.', 'error');
          return;
        }
        finish('Could not send reset email. Check Firebase setup and try again.', 'error');
      }
    });
