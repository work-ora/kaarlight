document.addEventListener('DOMContentLoaded', () => {
      const settings = Storage.getSettings();
      const user = Storage.getCurrentUser();
      const userDisplay = document.getElementById('settings-user');

      if (userDisplay && user) {
        userDisplay.textContent = `Signed in as ${user.fullname || 'User'} (${user.email || 'no email'})`;
      }

      document.getElementById('theme-select').value = settings.theme || 'light';
      document.body.classList.toggle('dark', (settings.theme || 'light') === 'dark');
      document.getElementById('job-search').value = settings.jobSearch || '';
      document.getElementById('job-category').value = settings.jobCategory || 'All';
      document.getElementById('job-sort').value = settings.jobSort || 'newest';
      document.getElementById('default-poster-type').value = settings.defaultPosterType || 'Company';
      document.getElementById('default-category').value = settings.defaultCategory || '';
      document.getElementById('default-currency').value = settings.defaultCurrency || 'USD';
      document.getElementById('default-location').value = settings.defaultLocation || '';
      document.getElementById('default-online').checked = Boolean(settings.defaultOnline);
      document.getElementById('notif-weekly').checked = Boolean(settings.notifications?.weeklyDigest);
      document.getElementById('notif-alerts').checked = Boolean(settings.notifications?.jobAlerts);
      document.getElementById('notif-product').checked = Boolean(settings.notifications?.productUpdates);

      const msg = document.getElementById('settings-msg');
      const dataMsg = document.getElementById('data-msg');
      const themeSelect = document.getElementById('theme-select');

      themeSelect.addEventListener('change', () => {
        const selected = themeSelect.value === 'dark' ? 'dark' : 'light';
        document.body.classList.toggle('dark', selected === 'dark');
        Storage.setTheme(selected);
        Storage.saveSettings({
          ...settings,
          theme: selected
        });
      });

      document.getElementById('settings-form').addEventListener('submit', (event) => {
        event.preventDefault();

        const updated = {
          theme: themeSelect.value === 'dark' ? 'dark' : 'light',
          jobSearch: String(document.getElementById('job-search').value || '').trim(),
          jobCategory: document.getElementById('job-category').value || 'All',
          jobSort: document.getElementById('job-sort').value || 'newest',
          defaultPosterType: document.getElementById('default-poster-type').value || 'Company',
          defaultCategory: document.getElementById('default-category').value || '',
          defaultCurrency: document.getElementById('default-currency').value || 'USD',
          defaultLocation: String(document.getElementById('default-location').value || '').trim(),
          defaultOnline: document.getElementById('default-online').checked,
          notifications: {
            weeklyDigest: document.getElementById('notif-weekly').checked,
            jobAlerts: document.getElementById('notif-alerts').checked,
            productUpdates: document.getElementById('notif-product').checked
          }
        };

        Storage.saveSettings(updated);
        Storage.setTheme(updated.theme);
        document.body.classList.toggle('dark', updated.theme === 'dark');
        if (msg) {
          msg.textContent = 'Settings saved.';
          msg.className = 'form-msg success';
          setTimeout(() => {
            msg.className = 'form-msg';
            msg.textContent = '';
          }, 2000);
        }
      });

      document.getElementById('reset-settings').addEventListener('click', () => {
        if (!confirm('Reset settings to defaults?')) return;
        localStorage.removeItem(APP_KEYS.SETTINGS);
        window.location.reload();
      });

      document.getElementById('export-data').addEventListener('click', () => {
        const exportPayload = {
          jobs: Utils.readJson(APP_KEYS.JOBS, []),
          users: Utils.readJson(APP_KEYS.USERS, []),
          currentUser: Utils.readJson(APP_KEYS.USER, null),
          feedback: Utils.readJson(APP_KEYS.FEEDBACK, []),
          newsletter: Utils.readJson(APP_KEYS.NEWSLETTER, []),
          settings: Utils.readJson(APP_KEYS.SETTINGS, {})
        };

        const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'Kaarlight-data.json';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        if (dataMsg) {
          dataMsg.textContent = 'Export created.';
          dataMsg.className = 'form-msg success';
        }
      });

      document.getElementById('clear-data').addEventListener('click', () => {
        if (!confirm('This will remove your local jobs, account, and settings from this browser. Continue?')) return;
        const keys = [
          APP_KEYS.JOBS,
          APP_KEYS.LEGACY_JOBS,
          APP_KEYS.USERS,
          APP_KEYS.USER,
          APP_KEYS.FEEDBACK,
          APP_KEYS.NEWSLETTER,
          APP_KEYS.ACCOUNT_BANS,
          APP_KEYS.SETTINGS,
          APP_KEYS.THEME
        ];
        keys.forEach((key) => localStorage.removeItem(key));
        if (dataMsg) {
          dataMsg.textContent = 'Local data cleared. Refreshing...';
          dataMsg.className = 'form-msg success';
        }
        setTimeout(() => window.location.reload(), 800);
      });
    });
