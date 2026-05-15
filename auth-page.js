// Tab switching
    function switchTab(tabName, event) {
      if (event) event.preventDefault();
      const targetTab = document.querySelector(`.auth-tab[data-tab="${tabName}"]`);
      const targetForm = document.getElementById(`${tabName}-form`);
      if (!targetTab || !targetForm) return;
      
      document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.classList.remove('active');
      });
      document.querySelectorAll('.auth-form').forEach(form => {
        form.classList.remove('active');
      });

      targetTab.classList.add('active');
      targetForm.classList.add('active');
    }

document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', (event) => switchTab(tab.dataset.tab, event));
});

document.querySelectorAll('[data-auth-tab-link]').forEach(link => {
  link.addEventListener('click', (event) => switchTab(link.dataset.authTabLink, event));
});

    // Validation functions
    function validateEmail(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function validatePassword(password) {
      return password.length >= 6 && /[A-Z]/.test(password) && /[0-9]/.test(password);
    }

    function showError(elementId, message) {
      const errorEl = document.getElementById(elementId);
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.add('show');
      }
    }

    function clearError(elementId) {
      const errorEl = document.getElementById(elementId);
      if (errorEl) {
        errorEl.textContent = '';
        errorEl.classList.remove('show');
      }
    }

    function showMessage(formType, message, type) {
      const msgEl = document.getElementById(`${formType}-message`);
      if (msgEl) {
        msgEl.textContent = message;
        msgEl.className = `message ${type}`;
      }
    }

    function completeAuth(user, formType, message) {
      localStorage.setItem('afg_current_user', JSON.stringify({
        id: user.id,
        email: user.email,
        fullname: user.fullname,
        phone: user.phone || '',
        authProvider: user.authProvider || ''
      }));
      localStorage.setItem('afg_auth_source', user.authSource || '');

      showMessage(formType, message, 'success');
      setTimeout(() => window.location.href = 'index.html', 1500);
    }

    function socialEmail(provider) {
      return `${provider.toLowerCase()}.${Date.now()}@social.kaarlight.local`;
    }

    function normalizeEmail(value) {
      return String(value || '').trim().toLowerCase();
    }

    function accountBanId(value) {
      return normalizeEmail(value).replace(/[/.#[\]]/g, '_');
    }

    function getLocalBans() {
      try {
        const bans = JSON.parse(localStorage.getItem('afg_account_bans') || '[]');
        return Array.isArray(bans) ? bans : [];
      } catch {
        return [];
      }
    }

    function accountMatchesBan(user, ban) {
      if (!user || !ban || ban.banned === false) return false;
      const userEmail = normalizeEmail(user.email);
      const banEmail = normalizeEmail(ban.email);
      if (userEmail && banEmail && userEmail === banEmail) return true;
      if (user.id && ban.userId && String(user.id) === String(ban.userId)) return true;
      if (user.oauthUid && ban.oauthUid && String(user.oauthUid) === String(ban.oauthUid)) return true;
      return false;
    }

    async function isAccountBanned(user, auth) {
      if (!user) return false;
      if (getLocalBans().some((ban) => accountMatchesBan(user, ban))) return true;

      if (!window.firebase || !window.firebase.firestore) return false;
      try {
        const app = window.firebase.apps && window.firebase.apps.length
          ? window.firebase.app()
          : window.firebase.initializeApp(getOAuthConfig());
        const db = window.firebase.firestore(app);
        const ids = [
          user.email ? accountBanId(user.email) : '',
          user.oauthUid ? `uid_${String(user.oauthUid)}` : '',
          user.id ? `uid_${String(user.id)}` : ''
        ].filter(Boolean);

        for (const id of ids) {
          const doc = await db.collection('accountBans').doc(id).get();
          if (doc.exists && doc.data()?.banned !== false) return true;
        }
      } catch {
        return false;
      }

      return false;
    }

    async function blockIfBanned(user, formType, auth) {
      if (!(await isAccountBanned(user, auth))) return false;
      showMessage(formType, 'This account has been banned. Contact support if you think this is a mistake.', 'error');
      localStorage.removeItem('afg_current_user');
      localStorage.removeItem('afg_auth_source');
      try {
        await auth?.signOut?.();
      } catch {
        // Ignore sign-out errors after clearing local state.
      }
      return true;
    }

    function getOAuthConfig() {
      // Set this in a separate script before auth.html runs:
      // window.KAARLIGHT_OAUTH_CONFIG = { apiKey, authDomain, projectId, appId, messagingSenderId, storageBucket };
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
          error: 'Social login is not configured yet. Add Firebase config first.'
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
          error: 'Failed to initialize social login. Check OAuth config values.'
        };
      }
    }

    function createProvider(providerName) {
      if (providerName === 'Google') {
        const provider = new window.firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        return provider;
      }
      if (providerName === 'Facebook') {
        return new window.firebase.auth.FacebookAuthProvider();
      }
      if (providerName === 'Apple') {
        return new window.firebase.auth.OAuthProvider('apple.com');
      }
      return null;
    }

    function mapOAuthError(err) {
      const code = err && err.code ? String(err.code) : '';
      if (code === 'auth/popup-closed-by-user') return 'Sign-in popup was closed before completion.';
      if (code === 'auth/popup-blocked') return 'Popup was blocked by the browser. Allow popups and retry.';
      if (code === 'auth/unauthorized-domain') return 'This domain is not authorized in Firebase Authentication.';
      if (code === 'auth/operation-not-allowed') return 'This provider is disabled in Firebase Authentication.';
      if (code === 'auth/operation-not-supported-in-this-environment') return 'Use http://localhost or HTTPS. File protocol is not supported.';
      return 'Could not complete social login. Check provider setup and try again.';
    }

    async function tryRedirectAuth(providerName, mode) {
      const formType = mode === 'signup' ? 'signup' : 'login';
      const init = ensureFirebaseAuth();
      if (!init.auth) {
        showMessage(formType, init.error, 'error');
        return;
      }

      const provider = createProvider(providerName);
      if (!provider) {
        showMessage(formType, 'Unsupported social provider selected.', 'error');
        return;
      }

      try {
        localStorage.setItem('afg_auth_pending', JSON.stringify({ providerName, mode }));
        await init.auth.signInWithRedirect(provider);
      } catch (err) {
        showMessage(formType, mapOAuthError(err), 'error');
      }
    }

    async function handleSocialAuth(providerName, mode) {
      const formType = mode === 'signup' ? 'signup' : 'login';
      if (window.location.protocol === 'file:') {
        showMessage(formType, 'Google sign-in requires http://localhost or HTTPS hosting. File protocol is not supported.', 'error');
        return;
      }
      const init = ensureFirebaseAuth();
      if (!init.auth) {
        showMessage(formType, init.error, 'error');
        return;
      }

      const provider = createProvider(providerName);
      if (!provider) {
        showMessage(formType, 'Unsupported social provider selected.', 'error');
        return;
      }

      try {
        const result = await init.auth.signInWithPopup(provider);
        const authUser = result && result.user ? result.user : null;
        if (!authUser || !authUser.uid) {
          showMessage(formType, 'Social login failed: no user data returned.', 'error');
          return;
        }

        const users = JSON.parse(localStorage.getItem('afg_users') || '[]');
        let user = users.find((u) =>
          u.oauthUid === authUser.uid ||
          (authUser.email && u.email === authUser.email)
        );

        if (!user && mode === 'login') {
          showMessage('login', 'No account found. Use Sign Up with this provider first.', 'error');
          await init.auth.signOut();
          return;
        }

        if (!user) {
          user = {
            id: Date.now(),
            fullname: authUser.displayName || `${providerName} User`,
            email: authUser.email || socialEmail(providerName),
            phone: authUser.phoneNumber || '',
            oauthProvider: providerName,
            oauthUid: authUser.uid,
            avatar: authUser.photoURL || '',
            createdAt: new Date().toISOString()
          };
          users.push(user);
        } else {
          user.oauthProvider = providerName;
          user.oauthUid = authUser.uid;
          if (!user.fullname && authUser.displayName) user.fullname = authUser.displayName;
          if ((!user.email || user.email.endsWith('@social.kaarlight.local')) && authUser.email) user.email = authUser.email;
          if (!user.phone && authUser.phoneNumber) user.phone = authUser.phoneNumber;
          if (!user.avatar && authUser.photoURL) user.avatar = authUser.photoURL;
        }

        user.authProvider = providerName;
        user.authSource = 'firebase';
        if (await blockIfBanned(user, formType, init.auth)) return;

        localStorage.setItem('afg_users', JSON.stringify(users));
        completeAuth(user, formType, `${providerName} sign ${mode === 'signup' ? 'up' : 'in'} successful! Redirecting...`);
      } catch (err) {
        const code = err && err.code ? String(err.code) : '';
        if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user' || code === 'auth/operation-not-supported-in-this-environment') {
          tryRedirectAuth(providerName, mode);
          return;
        }
        showMessage(formType, mapOAuthError(err), 'error');
      }
    }

    function bytesToHex(bytes) {
      return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    function hexToBytes(hex) {
      const clean = String(hex || '').replace(/[^a-f0-9]/gi, '');
      const bytes = new Uint8Array(clean.length / 2);
      for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
      }
      return bytes;
    }

    function constantTimeEqual(a, b) {
      if (!a || !b || a.length !== b.length) return false;
      let diff = 0;
      for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
      return diff === 0;
    }

    async function legacySha256(password) {
      const data = new TextEncoder().encode(String(password || ''));
      const digest = await crypto.subtle.digest('SHA-256', data);
      return bytesToHex(new Uint8Array(digest));
    }

    async function hashPassword(password) {
      const iterations = 210000;
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(String(password || '')),
        'PBKDF2',
        false,
        ['deriveBits']
      );
      const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
        keyMaterial,
        256
      );
      return `pbkdf2-sha256$${iterations}$${bytesToHex(salt)}$${bytesToHex(new Uint8Array(bits))}`;
    }

    async function verifyPassword(user, enteredPassword) {
      if (!user) return false;

      if (user.passwordHash) {
        const stored = String(user.passwordHash || '');
        const parts = stored.split('$');
        if (parts.length === 4 && parts[0] === 'pbkdf2-sha256') {
          const iterations = Number(parts[1]);
          const salt = hexToBytes(parts[2]);
          const expected = hexToBytes(parts[3]);
          const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(String(enteredPassword || '')),
            'PBKDF2',
            false,
            ['deriveBits']
          );
          const bits = await crypto.subtle.deriveBits(
            { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
            keyMaterial,
            expected.length * 8
          );
          return constantTimeEqual(new Uint8Array(bits), expected);
        }

        return stored === await legacySha256(enteredPassword);
      }

      return user.password === enteredPassword;
    }

    // Login form handler
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('login-email').value.trim().toLowerCase();
      const password = document.getElementById('login-password').value;
      const remember = document.getElementById('login-remember').checked;

      clearError('error-login-email');
      clearError('error-login-password');

      let isValid = true;

      if (!email) {
        showError('error-login-email', 'Email is required');
        isValid = false;
      } else if (!validateEmail(email)) {
        showError('error-login-email', 'Invalid email address');
        isValid = false;
      }

      if (!password) {
        showError('error-login-password', 'Password is required');
        isValid = false;
      }

      if (!isValid) return;

      // Get stored users
      const users = JSON.parse(localStorage.getItem('afg_users') || '[]');
      const user = users.find(u => String(u.email || '').trim().toLowerCase() === email);

      const isValidPassword = await verifyPassword(user, password);
      if (!user || !isValidPassword) {
        showMessage('login', 'Invalid email or password', 'error');
        return;
      }

      if (await blockIfBanned(user, 'login', null)) return;

      // Migrate legacy plain-text or unsalted SHA-256 entries after successful login.
      if (user.password || (user.passwordHash && !String(user.passwordHash).startsWith('pbkdf2-sha256$'))) {
        user.passwordHash = await hashPassword(password);
        delete user.password;
        localStorage.setItem('afg_users', JSON.stringify(users));
      }

      // Successful login
      localStorage.setItem('afg_current_user', JSON.stringify({
        id: user.id,
        email: user.email,
        fullname: user.fullname,
        phone: user.phone
      }));
      localStorage.setItem('afg_auth_source', 'local');

      if (remember) {
        localStorage.setItem('afg_remember_user', JSON.stringify({ email: user.email }));
      } else {
        localStorage.removeItem('afg_remember_user');
      }

      showMessage('login', 'Sign in successful! Redirecting...', 'success');
      setTimeout(() => window.location.href = 'index.html', 1500);
    });

    // Signup form handler
    document.getElementById('signup-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      const fullname = document.getElementById('signup-fullname').value.trim();
      const email = document.getElementById('signup-email').value.trim().toLowerCase();
      const phone = document.getElementById('signup-phone').value.trim();
      const password = document.getElementById('signup-password').value;
      const confirm = document.getElementById('signup-confirm').value;
      const terms = document.getElementById('signup-terms').checked;

      clearError('error-signup-fullname');
      clearError('error-signup-email');
      clearError('error-signup-phone');
      clearError('error-signup-password');
      clearError('error-signup-confirm');

      let isValid = true;

      if (!fullname || fullname.length < 3) {
        showError('error-signup-fullname', 'Full name must be at least 3 characters');
        isValid = false;
      }

      if (!email) {
        showError('error-signup-email', 'Email is required');
        isValid = false;
      } else if (!validateEmail(email)) {
        showError('error-signup-email', 'Invalid email address');
        isValid = false;
      }

      if (!validatePassword(password)) {
        showError('error-signup-password', 'Password must be at least 6 chars with uppercase and number');
        isValid = false;
      }

      if (password !== confirm) {
        showError('error-signup-confirm', 'Passwords do not match');
        isValid = false;
      }

      if (!terms) {
        showMessage('signup', 'You must agree to the terms of service', 'error');
        isValid = false;
      }

      if (!isValid) return;

      // Check if email already exists
      const users = JSON.parse(localStorage.getItem('afg_users') || '[]');
      if (users.some(u => String(u.email || '').trim().toLowerCase() === email)) {
        showError('error-signup-email', 'Email already registered');
        return;
      }

      if (await blockIfBanned({ email }, 'signup', null)) return;

      // Create new user
      const newUser = {
        id: Date.now(),
        fullname,
        email,
        phone,
        passwordHash: await hashPassword(password),
        createdAt: new Date().toISOString()
      };

      users.push(newUser);
      localStorage.setItem('afg_users', JSON.stringify(users));

      // Auto login
      localStorage.setItem('afg_current_user', JSON.stringify({
        id: newUser.id,
        email: newUser.email,
        fullname: newUser.fullname,
        phone: newUser.phone
      }));
      localStorage.setItem('afg_auth_source', 'local');

      showMessage('signup', 'Account created successfully! Redirecting...', 'success');
      setTimeout(() => window.location.href = 'index.html', 1500);
    });

    // Social auth handlers
    document.querySelectorAll('#login-form .social-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const provider = btn.dataset.provider || btn.textContent.trim();
        handleSocialAuth(provider, 'login');
      });
    });

    document.querySelectorAll('#signup-form .social-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const provider = btn.dataset.provider || btn.textContent.trim();
        handleSocialAuth(provider, 'signup');
      });
    });

    // Handle OAuth redirect result (fallback for blocked popups or file protocol)
    window.addEventListener('load', async () => {
      const pendingRaw = localStorage.getItem('afg_auth_pending');
      if (!pendingRaw) return;

      const pending = JSON.parse(pendingRaw || 'null');
      if (!pending || !pending.providerName) return;

      const formType = pending.mode === 'signup' ? 'signup' : 'login';
      const init = ensureFirebaseAuth();
      if (!init.auth) return;

      try {
        const result = await init.auth.getRedirectResult();
        const authUser = result && result.user ? result.user : null;
        if (!authUser || !authUser.uid) return;

        const providerName = pending.providerName;
        const users = JSON.parse(localStorage.getItem('afg_users') || '[]');
        let user = users.find((u) =>
          u.oauthUid === authUser.uid ||
          (authUser.email && u.email === authUser.email)
        );

        if (!user && pending.mode === 'login') {
          showMessage('login', 'No account found. Use Sign Up with this provider first.', 'error');
          await init.auth.signOut();
          return;
        }

        if (!user) {
          user = {
            id: Date.now(),
            fullname: authUser.displayName || `${providerName} User`,
            email: authUser.email || socialEmail(providerName),
            phone: authUser.phoneNumber || '',
            oauthProvider: providerName,
            oauthUid: authUser.uid,
            avatar: authUser.photoURL || '',
            createdAt: new Date().toISOString()
          };
          users.push(user);
        } else {
          user.oauthProvider = providerName;
          user.oauthUid = authUser.uid;
          if (!user.fullname && authUser.displayName) user.fullname = authUser.displayName;
          if ((!user.email || user.email.endsWith('@social.kaarlight.local')) && authUser.email) user.email = authUser.email;
          if (!user.phone && authUser.phoneNumber) user.phone = authUser.phoneNumber;
          if (!user.avatar && authUser.photoURL) user.avatar = authUser.photoURL;
        }

        user.authProvider = providerName;
        user.authSource = 'firebase';
        if (await blockIfBanned(user, formType, init.auth)) return;

        localStorage.setItem('afg_users', JSON.stringify(users));
        localStorage.removeItem('afg_auth_pending');
        completeAuth(user, formType, `${providerName} sign ${pending.mode === 'signup' ? 'up' : 'in'} successful! Redirecting...`);
      } catch (err) {
        showMessage(formType, mapOAuthError(err), 'error');
      }
    });

    // Auto-fill email if user is remembered
    window.addEventListener('load', () => {
      const remembered = localStorage.getItem('afg_remember_user');
      if (remembered) {
        const { email } = JSON.parse(remembered);
        document.getElementById('login-email').value = email || '';
        document.getElementById('login-remember').checked = true;
      }
    });
