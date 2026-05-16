const KEYS = {
      USER: 'afg_current_user',
      USERS: 'afg_users',
      JOBS: 'afg_jobs_data'
    };

    let activeUser = null;

    function onProfileReady(callback) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', callback);
        return;
      }
      callback();
    }

    async function initProfilePage() {
      if (!document.querySelector('.profile-tabs')) return;
      activeUser = readJson(KEYS.USER, null);
      if (!activeUser) {
        window.location.href = 'auth.html';
        return;
      }

      setupTabNavigation();

      try {
        setupFormHandlers();
        setupModalHandlers();
        setupBioCounters();
        loadProfileData(activeUser);
        await loadUserJobs(activeUser.id, activeUser.email);
      } catch (error) {
        console.error('Profile page initialization failed:', error);
      }
    }

    window.KaarlightProfilePage = { init: initProfilePage };

    if (document.currentScript?.dataset.routerPageScript !== 'true') {
      onProfileReady(initProfilePage);
    }

    function readJson(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    }

    function writeJson(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
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

    function syncUserToUsersCollection(user) {
      const users = readJson(KEYS.USERS, []);
      const index = users.findIndex((u) => u.id === user.id || u.email === user.email);

      if (index >= 0) {
        users[index] = {
          ...users[index],
          fullname: user.fullname,
          email: user.email,
          phone: user.phone,
          type: user.type,
          portfolio: user.portfolio,
          bio: user.bio,
          avatar: user.avatar || ''
        };
      } else {
        users.push({
          ...user,
          avatar: user.avatar || ''
        });
      }

      writeJson(KEYS.USERS, users);
    }

    function showMessage(elementId, text, type) {
      const el = document.getElementById(elementId);
      if (!el) return;
      el.textContent = text;
      el.className = `form-msg ${type}`;
      setTimeout(() => {
        el.textContent = '';
        el.className = 'form-msg';
      }, 3000);
    }

    function clearError(errorId) {
      const el = document.getElementById(errorId);
      if (!el) return;
      el.textContent = '';
      el.classList.remove('show');
    }

    function setError(errorId, text) {
      const el = document.getElementById(errorId);
      if (!el) return;
      el.textContent = text;
      el.classList.add('show');
    }

    function loadProfileData(user) {
      const displayName = user.fullname || 'User';
      const profileType = user.type || 'User';
      const bio = String(user.bio || '').trim();
      const portfolio = String(user.portfolio || '').trim();
      const email = String(user.email || '').trim();
      const phone = String(user.phone || '').trim();

      document.getElementById('profile-name').textContent = displayName;
      document.getElementById('profile-type').textContent = profileType;
      document.getElementById('profile-email').textContent = email || 'Add your email';
      document.getElementById('profile-contact').textContent = phone || 'Add your phone number';
      document.getElementById('profile-email').style.display = email ? 'inline-flex' : 'none';
      document.getElementById('profile-contact').style.display = phone ? 'inline-flex' : 'none';
      document.getElementById('profile-bio-preview').textContent = bio || 'Add a short bio so employers immediately understand what you do best.';
      document.getElementById('profile-status-badge').textContent = bio && portfolio ? 'Strong profile' : 'Ready for work';
      document.getElementById('profile-visibility').textContent = portfolio ? 'Enhanced profile' : 'Basic profile';
      document.getElementById('profile-next-step').textContent = getNextStepText({ bio, portfolio, phone, email });
      updatePortfolioSummary(portfolio);
      updatePrimaryAction(profileType);
      updateWelcome(displayName);
      renderAvatar(user.avatar, displayName);

      document.getElementById('edit-name').value = displayName;
      document.getElementById('edit-type').value = user.type || 'Freelancer';
      document.getElementById('edit-email').value = user.email || '';
      document.getElementById('edit-contact').value = user.phone || '';
      document.getElementById('edit-portfolio').value = user.portfolio || '';
      document.getElementById('edit-bio').value = user.bio || '';

      document.getElementById('modal-name').value = displayName;
      document.getElementById('modal-bio').value = user.bio || '';

      updateStats(user.id, user.email);
    }

    function updatePortfolioSummary(portfolio) {
      const portfolioLink = document.getElementById('profile-portfolio-link');
      if (!portfolioLink) return;

      if (portfolio) {
        portfolioLink.href = portfolio;
        portfolioLink.target = '_blank';
        portfolioLink.rel = 'noopener noreferrer';
        portfolioLink.textContent = 'View portfolio';
      } else {
        portfolioLink.href = '#profile-info';
        portfolioLink.removeAttribute('target');
        portfolioLink.removeAttribute('rel');
        portfolioLink.textContent = 'Add your portfolio';
      }
    }

    function updatePrimaryAction(profileType) {
      const actionLink = document.getElementById('profile-primary-action');
      if (!actionLink) return;

      if (String(profileType).toLowerCase() === 'freelancer') {
        actionLink.href = 'jobs.html';
        actionLink.textContent = 'Find work';
      } else {
        actionLink.href = 'post-job.html';
        actionLink.textContent = 'Post a Job';
      }
    }

    function getNextStepText(details) {
      if (!details.bio) return 'Write a short bio';
      if (!details.portfolio) return 'Add a portfolio link';
      if (!details.phone) return 'Add a phone number';
      if (!details.email) return 'Add an email address';
      return 'Your profile is looking good';
    }

    function updateWelcome(name) {
      const userDisplay = document.getElementById('user-display');
      if (!userDisplay) return;
      const label = window.LanguageManager && typeof LanguageManager.formatWelcome === 'function'
        ? LanguageManager.formatWelcome(name || 'User')
        : `Welcome, ${name || 'User'}`;
      userDisplay.textContent = label;
      userDisplay.style.display = 'inline';
    }

    function renderAvatar(photoData, fullName) {
      const initials = document.getElementById('avatar-initials');
      const image = document.getElementById('avatar-image');
      const removeBtn = document.getElementById('remove-photo-btn');

      initials.textContent = getInitials(fullName || 'User');

      if (photoData) {
        image.src = photoData;
        image.style.display = 'block';
        initials.style.display = 'none';
        if (removeBtn) removeBtn.style.display = 'inline-flex';
      } else {
        image.removeAttribute('src');
        image.style.display = 'none';
        initials.style.display = 'inline';
        if (removeBtn) removeBtn.style.display = 'none';
      }
    }

    function getInitials(name) {
      if (!name) return 'U';
      return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
    }

    async function getUserJobs(userId, userEmail) {
      const jobs = window.Storage && typeof Storage.getAllJobsAsync === 'function'
        ? await Storage.getAllJobsAsync()
        : readJson(KEYS.JOBS, []);
      const safeUserId = userId ?? null;
      const safeEmail = String(userEmail || '').trim().toLowerCase();

      return jobs.filter((job) => {
        if (!job) return false;

        // Hide seeded/system jobs (negative numeric IDs).
        if (typeof job.id === 'number' && job.id < 0) return false;

        const matchesId = safeUserId !== null
          && job.posterId !== undefined
          && job.posterId !== null
          && String(job.posterId) === String(safeUserId);

        const matchesEmail = Boolean(safeEmail)
          && job.postedBy
          && String(job.postedBy).trim().toLowerCase() === safeEmail;

        return matchesId || matchesEmail;
      });
    }

    async function loadUserJobs(userId, userEmail) {
      const userJobs = await getUserJobs(userId, userEmail);
      const jobsList = document.getElementById('jobs-list');

      if (userJobs.length === 0) {
        jobsList.innerHTML = '<div class="empty-state rich-empty-state"><h4>Nothing posted yet</h4><p>Your profile is ready. Create your first listing to start getting responses from local talent.</p><a href="post-job.html" class="btn">Post your first job</a></div>';
        return;
      }

      jobsList.innerHTML = userJobs.map((job) => `
        <div class="job-card">
          <div class="job-header">
            <h4>${escapeHtml(job.title || 'Untitled')}</h4>
            <span class="job-status ${escapeHtml(job.status || 'active')}">${escapeHtml(job.status || 'Active')}</span>
          </div>
          <p class="job-excerpt">${escapeHtml((job.description || '').slice(0, 100))}${(job.description || '').length > 100 ? '...' : ''}</p>
          <div class="job-meta">
            <span>Location: ${escapeHtml(job.location || 'Remote')}</span>
            <span>Budget: ${escapeHtml(job.currency || 'USD')} ${escapeHtml(job.price ?? 'N/A')}</span>
            <span>Posted: ${formatDate(job.createdAt)}</span>
          </div>
          <div class="job-actions">
            <button class="btn small" data-job-action="edit" data-job-id="${escapeHtml(job.id)}">Edit</button>
            <button class="btn small outline" data-job-action="delete" data-job-id="${escapeHtml(job.id)}">Delete</button>
          </div>
        </div>
      `).join('');

      jobsList.querySelectorAll('[data-job-action]').forEach((button) => {
        button.addEventListener('click', () => {
          const jobId = button.dataset.jobId;
          if (button.dataset.jobAction === 'edit') {
            editJob(jobId);
            return;
          }
          if (button.dataset.jobAction === 'delete') {
            deleteJob(jobId);
          }
        });
      });
    }

    async function updateStats(userId, userEmail) {
      const userJobs = await getUserJobs(userId, userEmail);
      const activeJobs = userJobs.filter((job) => job.status !== 'closed').length;

      document.getElementById('stat-jobs').textContent = String(userJobs.length);
      document.getElementById('stat-active').textContent = String(activeJobs);
      document.getElementById('stat-completed').textContent = String(Math.max(0, userJobs.length - activeJobs));
    }

    function setupTabNavigation() {
      const tabs = document.querySelector('.profile-tabs');
      if (!tabs || tabs.dataset.bound === 'true') return;
      tabs.dataset.bound = 'true';

      tabs.addEventListener('click', function (event) {
        const tab = event.target.closest('.profile-tab');
        if (!tab) return;

        const tabName = tab.dataset.tab;
        const targetContent = tabName ? document.getElementById(tabName) : null;
        if (!targetContent) return;

        document.querySelectorAll('.profile-tab-content').forEach((content) => {
          content.classList.remove('active');
        });
        document.querySelectorAll('.profile-tab').forEach((item) => {
          item.classList.remove('active');
        });

        targetContent.classList.add('active');
        tab.classList.add('active');
      });
    }

    function setupFormHandlers() {
      document.getElementById('profile-photo').addEventListener('change', async function (e) {
        clearError('error-profilePhoto');
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        if (!['image/jpeg', 'image/png'].includes(String(file.type || '').toLowerCase())) {
          setError('error-profilePhoto', 'Please choose a JPG or PNG image.');
          this.value = '';
          return;
        }

        if (file.size > 1 * 1024 * 1024) {
          setError('error-profilePhoto', 'Image must be 1MB or smaller.');
          this.value = '';
          return;
        }

        const msgEl = document.getElementById('profile-msg');
        if (window.CloudinaryUploader && CloudinaryUploader.isConfigured()) {
          if (msgEl) {
            msgEl.textContent = 'Uploading photo...';
            msgEl.className = 'form-msg';
          }
          try {
            const result = await CloudinaryUploader.uploadFile(file, {
              folder: 'avatars',
              tags: ['profile-avatar'],
              resourceType: 'image'
            });
            activeUser.avatar = String(result.url || '');
            renderAvatar(activeUser.avatar, activeUser.fullname || 'User');
            if (msgEl) {
              msgEl.textContent = 'Photo uploaded.';
              msgEl.className = 'form-msg success';
            }
          } catch (err) {
            setError('error-profilePhoto', err?.message || 'Photo upload failed.');
            if (msgEl) {
              msgEl.textContent = '';
              msgEl.className = 'form-msg';
            }
          }
          return;
        }

        const reader = new FileReader();
        reader.onload = function (event) {
          activeUser.avatar = String(event.target?.result || '');
          renderAvatar(activeUser.avatar, activeUser.fullname || 'User');
        };
        reader.readAsDataURL(file);
      });

      document.getElementById('remove-photo-btn').addEventListener('click', function () {
        activeUser.avatar = '';
        document.getElementById('profile-photo').value = '';
        clearError('error-profilePhoto');
        renderAvatar('', activeUser.fullname || 'User');
      });

      document.getElementById('profile-form').addEventListener('submit', function (e) {
        e.preventDefault();

        const updated = {
          ...activeUser,
          fullname: document.getElementById('edit-name').value.trim(),
          type: document.getElementById('edit-type').value,
          email: document.getElementById('edit-email').value.trim(),
          phone: document.getElementById('edit-contact').value.trim(),
          portfolio: document.getElementById('edit-portfolio').value.trim(),
          bio: document.getElementById('edit-bio').value.trim(),
          avatar: activeUser.avatar || ''
        };

        activeUser = updated;
        writeJson(KEYS.USER, updated);
        syncUserToUsersCollection(updated);
        loadProfileData(updated);
        updateWelcome(updated.fullname || 'User');
        window.dispatchEvent(new Event('afg-user-updated'));
        showMessage('profile-msg', 'Profile updated successfully.', 'success');
      });

      document.getElementById('password-form').addEventListener('submit', async function (e) {
        e.preventDefault();

        clearError('error-currentPassword');
        clearError('error-newPassword');
        clearError('error-confirmPassword');

        const currentPassword = document.getElementById('current-password').value;
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        const users = readJson(KEYS.USERS, []);
        const userRecord = users.find((u) => u.id === activeUser.id || u.email === activeUser.email);

        const isValidCurrentPassword = await verifyPassword(userRecord, currentPassword);
        if (!userRecord || !isValidCurrentPassword) {
          setError('error-currentPassword', 'Current password is incorrect.');
          return;
        }

        if (newPassword.length < 6) {
          setError('error-newPassword', 'Password must be at least 6 characters.');
          return;
        }

        if (newPassword !== confirmPassword) {
          setError('error-confirmPassword', 'Passwords do not match.');
          return;
        }

        userRecord.passwordHash = await hashPassword(newPassword);
        delete userRecord.password;
        writeJson(KEYS.USERS, users);
        showMessage('password-msg', 'Password updated successfully.', 'success');
        this.reset();
      });

      document.getElementById('delete-account-btn').addEventListener('click', function () {
        document.getElementById('delete-modal').style.display = 'block';
      });

      document.getElementById('confirm-delete-btn').addEventListener('click', function () {
        const users = readJson(KEYS.USERS, []).filter((u) => u.id !== activeUser.id && u.email !== activeUser.email);
        writeJson(KEYS.USERS, users);

        const jobs = readJson(KEYS.JOBS, []).filter((job) => job.posterId !== activeUser.id && job.postedBy !== activeUser.email);
        writeJson(KEYS.JOBS, jobs);

        localStorage.removeItem(KEYS.USER);
        alert('Account deleted. Redirecting to home.');
        window.location.href = 'index.html';
      });

      document.getElementById('edit-profile-btn').addEventListener('click', function () {
        document.getElementById('profile-modal').style.display = 'block';
      });

      document.getElementById('quick-edit-form').addEventListener('submit', function (e) {
        e.preventDefault();

        const updated = {
          ...activeUser,
          fullname: document.getElementById('modal-name').value.trim(),
          bio: document.getElementById('modal-bio').value.trim(),
          avatar: activeUser.avatar || ''
        };

        activeUser = updated;
        writeJson(KEYS.USER, updated);
        syncUserToUsersCollection(updated);
        loadProfileData(updated);
        updateWelcome(updated.fullname || 'User');
        window.dispatchEvent(new Event('afg-user-updated'));
        document.getElementById('profile-modal').style.display = 'none';
        showMessage('modal-msg', 'Profile updated successfully.', 'success');
      });
    }

    function setupModalHandlers() {
      document.querySelectorAll('.modal-close').forEach((btn) => {
        btn.addEventListener('click', function () {
          this.closest('.modal').style.display = 'none';
        });
      });
    }

    function setupBioCounters() {
      document.getElementById('edit-bio').addEventListener('input', function () {
        document.getElementById('bio-count').textContent = `${this.value.length}/500`;
      });

      document.getElementById('modal-bio').addEventListener('input', function () {
        document.getElementById('modal-bio-count').textContent = `${this.value.length}/500`;
      });
    }

    function formatDate(isoString) {
      if (!isoString) return 'N/A';
      const date = new Date(isoString);
      if (Number.isNaN(date.getTime())) return 'N/A';
      return date.toLocaleDateString();
    }

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function editJob(jobId) {
      localStorage.setItem('editJobId', jobId);
      window.location.href = 'post-job.html';
    }

    async function deleteJob(jobId) {
      if (!confirm('Are you sure you want to delete this job?')) return;

      if (window.Storage && typeof Storage.deleteJobByIdAsync === 'function') {
        const result = await Storage.deleteJobByIdAsync(jobId, activeUser);
        if (!result.ok) {
          alert('Could not delete this job right now. Please try again.');
          return;
        }
      } else {
        const jobs = readJson(KEYS.JOBS, []);
        const updated = jobs.filter((job) => String(job.id) !== String(jobId));
        writeJson(KEYS.JOBS, updated);
      }

      await loadUserJobs(activeUser.id, activeUser.email);
      await updateStats(activeUser.id, activeUser.email);
    }
