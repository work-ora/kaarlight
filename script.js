/**
 * AfgJobs - Core Logic
 * Handles local storage, rendering, search, theme, auth UI, posting, and feedback.
 */

const APP_KEYS = {
    JOBS: 'afg_jobs_data',
    LEGACY_JOBS: 'jobs',
    USERS: 'afg_users',
    THEME: 'afg_theme',
    USER: 'afg_current_user',
    SETTINGS: 'afg_settings',
    FEEDBACK: 'afg_feedback',
    NEWSLETTER: 'afg_newsletter',
    SEEKER_POSTS: 'afg_job_seeker_posts',
    REPORTS: 'afg_job_reports',
    LANGUAGE: 'afg_language'
};

const ADMIN_EMAILS = ['mahd62215@gmail.com'];
const REPORTS_COLLECTION = 'reports';
const FEEDBACK_COLLECTION = 'feedback';
const REPORTS_LIMIT = 500;
const FEEDBACK_LIMIT = 500;

const DEFAULT_SETTINGS = {
    theme: 'light',
    jobSearch: '',
    jobCategory: 'All',
    jobSort: 'newest',
    defaultPosterType: 'Company',
    defaultCategory: '',
    defaultCurrency: 'USD',
    defaultLocation: '',
    defaultOnline: false,
    notifications: {
        weeklyDigest: true,
        jobAlerts: true,
        productUpdates: false
    }
};

const DEFAULT_JOBS = [];

const Utils = {
    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    isEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
    },

    isPhone(value) {
        return /^\+?[\d\s\-()]{7,}$/.test(String(value || '').trim());
    },

    safeHttpUrl(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        try {
            const parsed = new URL(raw);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                return parsed.href;
            }
            return '';
        } catch {
            return '';
        }
    },

    readJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    },

    isJobOwner(job, user) {
        if (!job || !user) return false;
        if (job.posterId && user.id && String(job.posterId) === String(user.id)) return true;
        if (job.postedBy && user.email && String(job.postedBy).toLowerCase() === String(user.email).toLowerCase()) return true;
        return false;
    },

    isAdmin(user) {
        if (!user?.email) return false;
        const email = String(user.email).trim().toLowerCase();
        return ADMIN_EMAILS.includes(email);
    }
};

const FirebaseStore = {
    enabled: false,
    db: null,

    async init() {
        if (!window.firebase || !window.firebase.firestore) return;
        try {
            this.db = window.firebase.firestore();
            this.enabled = true;
        } catch {
            this.enabled = false;
        }
    }
};

const FirebaseAuthLoader = {
    loading: null,

    load() {
        if (!window.firebase) return Promise.resolve(false);
        if (window.firebase.auth) return Promise.resolve(true);
        if (this.loading) return this.loading;

        this.loading = new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = 'https://www.gstatic.com/firebasejs/10.12.3/firebase-auth-compat.js';
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.head.appendChild(script);
        });

        return this.loading;
    }
};

const Storage = {
    getAllJobs() {
        try {
            const data = localStorage.getItem(APP_KEYS.JOBS);
            if (data) {
                const parsed = JSON.parse(data);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    const cleaned = parsed.filter((job) => !(typeof job?.id === 'number' && job.id < 0));
                    if (cleaned.length !== parsed.length) {
                        localStorage.setItem(APP_KEYS.JOBS, JSON.stringify(cleaned));
                    }
                    return cleaned;
                }
                localStorage.setItem(APP_KEYS.JOBS, JSON.stringify(DEFAULT_JOBS));
                return [...DEFAULT_JOBS];
            }

            // One-time migration from legacy key if present.
            const legacy = localStorage.getItem(APP_KEYS.LEGACY_JOBS);
            const parsedLegacy = legacy ? JSON.parse(legacy) : [];
            if (Array.isArray(parsedLegacy) && parsedLegacy.length > 0) {
                const cleanedLegacy = parsedLegacy.filter((job) => !(typeof job?.id === 'number' && job.id < 0));
                localStorage.setItem(APP_KEYS.JOBS, JSON.stringify(cleanedLegacy));
                return cleanedLegacy;
            }

            localStorage.setItem(APP_KEYS.JOBS, JSON.stringify(DEFAULT_JOBS));
            return [...DEFAULT_JOBS];
        } catch {
            return [];
        }
    },

    async getAllJobsAsync() {
        const localJobs = this.getAllJobs();

        if (FirebaseStore.enabled && FirebaseStore.db) {
            try {
                const snapshot = await FirebaseStore.db
                    .collection('jobs')
                    .orderBy('createdAtMs', 'desc')
                    .get();
                const jobs = snapshot.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data()
                }));

                if (jobs.length > 0) {
                    const byId = new Map();
                    jobs.forEach((job) => {
                        byId.set(String(job.id), { ...job });
                    });

                    localJobs.forEach((job) => {
                        const key = String(job.id);
                        if (!byId.has(key)) {
                            byId.set(key, job);
                            return;
                        }
                        const existing = byId.get(key);
                        if (!existing.media && job.media) existing.media = job.media;
                        if (!existing.mediaType && job.mediaType) existing.mediaType = job.mediaType;
                    });

                    return Array.from(byId.values());
                }
            } catch {
                // Fall back to local storage below.
            }
        }

        return localJobs;
    },

    saveJob(job) {
        const jobs = this.getAllJobs();

        try {
            jobs.unshift({
                ...job,
                id: Date.now(),
                createdAt: new Date().toISOString()
            });
            localStorage.setItem(APP_KEYS.JOBS, JSON.stringify(jobs));
            return true;
        } catch {
            alert(LanguageManager.t('alert_storage_full'));
            return false;
        }
    },

    async saveJobAsync(job) {
        if (FirebaseStore.enabled && FirebaseStore.db) {
            try {
                const payload = {
                    ...job,
                    createdAtMs: Date.now(),
                    createdAt: new Date().toISOString()
                };
                const docRef = await FirebaseStore.db.collection('jobs').add(payload);
                return { ok: true, id: docRef.id };
            } catch {
                // If Firestore write fails (rules/offline), fall back to local storage.
                const localOk = this.saveJob(job);
                return localOk ? { ok: true, local: true } : { ok: false };
            }
        }

        return this.saveJob(job) ? { ok: true } : { ok: false };
    },

    updateJob(job) {
        if (!job || !job.id) return false;
        const jobs = this.getAllJobs();
        const index = jobs.findIndex((item) => String(item.id) === String(job.id));
        if (index < 0) return false;
        jobs[index] = {
            ...jobs[index],
            ...job,
            updatedAt: new Date().toISOString()
        };
        try {
            localStorage.setItem(APP_KEYS.JOBS, JSON.stringify(jobs));
            return true;
        } catch {
            return false;
        }
    },

    async updateJobAsync(job) {
        if (!job || !job.id) return { ok: false };
        if (FirebaseStore.enabled && FirebaseStore.db) {
            try {
                const payload = {
                    ...job,
                    updatedAt: new Date().toISOString(),
                    updatedAtMs: Date.now()
                };
                await FirebaseStore.db.collection('jobs').doc(String(job.id)).set(payload, { merge: true });
                return { ok: true };
            } catch {
                // Fall back to local storage below.
            }
        }

        const localOk = this.updateJob(job);
        return localOk ? { ok: true, local: true } : { ok: false };
    },

    getUsers() {
        try {
            const data = localStorage.getItem(APP_KEYS.USERS);
            const parsed = data ? JSON.parse(data) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    },

    getTheme() {
        return localStorage.getItem(APP_KEYS.THEME) || 'light';
    },

    setTheme(theme) {
        localStorage.setItem(APP_KEYS.THEME, theme);
    },

    getCurrentUser() {
        try {
            return JSON.parse(localStorage.getItem(APP_KEYS.USER) || 'null');
        } catch {
            return null;
        }
    },

    getSettings() {
        const raw = Utils.readJson(APP_KEYS.SETTINGS, {});
        const theme = raw?.theme || this.getTheme();
        return {
            ...DEFAULT_SETTINGS,
            ...raw,
            theme,
            notifications: {
                ...DEFAULT_SETTINGS.notifications,
                ...(raw?.notifications || {})
            }
        };
    },

    saveSettings(settings) {
        localStorage.setItem(APP_KEYS.SETTINGS, JSON.stringify(settings || {}));
    },

    deleteJobById(jobId, user) {
        const jobs = this.getAllJobs();
        const target = jobs.find((job) => String(job.id) === String(jobId));
        if (!target) return { ok: false, reason: 'not-found' };
        if (!Utils.isJobOwner(target, user)) return { ok: false, reason: 'not-owner' };

        const updated = jobs.filter((job) => String(job.id) !== String(jobId));
        localStorage.setItem(APP_KEYS.JOBS, JSON.stringify(updated));
        return { ok: true };
    },

    async deleteJobByIdAsync(jobId, user) {
        if (FirebaseStore.enabled && FirebaseStore.db) {
            try {
                const docRef = FirebaseStore.db.collection('jobs').doc(String(jobId));
                const snapshot = await docRef.get();
                if (!snapshot.exists) return { ok: false, reason: 'not-found' };
                const data = snapshot.data();
                if (!Utils.isJobOwner(data, user)) return { ok: false, reason: 'not-owner' };
                await docRef.delete();
                return { ok: true };
            } catch {
                return { ok: false, reason: 'error' };
            }
        }

        return this.deleteJobById(jobId, user);
    },

    async pruneCollection(collection, limit) {
        if (!FirebaseStore.enabled || !FirebaseStore.db) return;
        try {
            const snapshot = await FirebaseStore.db
                .collection(collection)
                .orderBy('createdAtMs', 'desc')
                .get();
            if (snapshot.size <= limit) return;
            const docsToDelete = snapshot.docs.slice(limit);
            if (docsToDelete.length === 0) return;
            const batch = FirebaseStore.db.batch();
            docsToDelete.forEach((doc) => batch.delete(doc.ref));
            await batch.commit();
        } catch {
            // Ignore prune errors.
        }
    },

    saveReport(report) {
        try {
            const reports = Utils.readJson(APP_KEYS.REPORTS, []);
            reports.unshift({
                ...report,
                id: Date.now(),
                createdAt: new Date().toISOString()
            });
            localStorage.setItem(APP_KEYS.REPORTS, JSON.stringify(reports.slice(0, 500)));
            return true;
        } catch {
            return false;
        }
    },

    async saveReportAsync(report) {
        const payload = {
            ...report,
            createdAt: new Date().toISOString(),
            createdAtMs: Date.now()
        };

        if (FirebaseStore.enabled && FirebaseStore.db) {
            try {
                await FirebaseStore.db.collection(REPORTS_COLLECTION).add(payload);
                await this.pruneCollection(REPORTS_COLLECTION, REPORTS_LIMIT);
                return { ok: true };
            } catch {
                // Fall back to local storage below.
            }
        }

        const ok = this.saveReport(payload);
        return ok ? { ok: true, local: true } : { ok: false };
    },

    async saveFeedbackAsync(feedback) {
        const payload = {
            ...feedback,
            createdAt: new Date().toISOString(),
            createdAtMs: Date.now()
        };

        if (FirebaseStore.enabled && FirebaseStore.db) {
            try {
                await FirebaseStore.db.collection(FEEDBACK_COLLECTION).add(payload);
                await this.pruneCollection(FEEDBACK_COLLECTION, FEEDBACK_LIMIT);
                return { ok: true };
            } catch {
                // Fall back to local storage below.
            }
        }

        try {
            const feedbackList = Utils.readJson(APP_KEYS.FEEDBACK, []);
            feedbackList.push(payload);
            localStorage.setItem(APP_KEYS.FEEDBACK, JSON.stringify(feedbackList.slice(0, FEEDBACK_LIMIT)));
            return { ok: true, local: true };
        } catch {
            return { ok: false };
        }
    }
};

const Renderer = {
    createJobCard(job) {
        const title = Utils.escapeHtml(job.title || 'Untitled');
        const category = Utils.escapeHtml(job.category || 'Other');
        const location = Utils.escapeHtml(job.location || 'Remote');
        const posterType = Utils.escapeHtml(job.posterType || 'Poster');
        const description = Utils.escapeHtml((job.description || '').slice(0, 100));
        const budgetHtml = Number.isFinite(Number(job.price))
            ? `<p class="budget">${LanguageManager.t('job_budget_label')}: ${Utils.escapeHtml(job.currency || 'USD')} ${Utils.escapeHtml(job.price)}</p>`
            : '';

        const sampleUrl = Utils.safeHttpUrl(job.sampleLink);
        const sampleHtml = job.isOnline && sampleUrl
            ? `<p><a href="${sampleUrl}" target="_blank" rel="noopener noreferrer">${LanguageManager.t('view_sample_link')}</a></p>`
            : '';

        const mediaHtml = job.media
            ? ((job.mediaType || '').includes('video')
                ? `<video src="${job.media}" class="card-media" controls></video>`
                : `<img src="${job.media}" class="card-media" alt="Job media">`)
            : '';

        return `
            <a href="job-detail.html?id=${job.id}" style="text-decoration: none; color: inherit; display: block;">
                <article class="card job-card" style="cursor: pointer; transition: all 0.3s ease;">
                    ${mediaHtml}
                    <div class="card-body">
                        <span class="badge">${category}</span>
                        <h3>${title}</h3>
                        <p class="location">${LanguageManager.t('job_location_label')}: ${location}</p>
                        <p class="description">${description}${(job.description || '').length > 100 ? '...' : ''}</p>
                        ${budgetHtml}
                        ${sampleHtml}
                        <div class="card-footer">
                            <span class="poster">${posterType}</span>
                            <span class="btn outline small" style="pointer-events: none;">${LanguageManager.t('view_details')}</span>
                        </div>
                    </div>
                </article>
            </a>
        `;
    },

    renderList(containerId, jobs) {
        const container = document.getElementById(containerId);
        const emptyState = document.getElementById('empty-state');
        const countDisplay = document.getElementById('job-count');

        if (!container) return;

        if (!Array.isArray(jobs) || jobs.length === 0) {
            container.innerHTML = '';
            if (emptyState) emptyState.style.display = 'block';
            if (countDisplay) countDisplay.innerText = LanguageManager.formatJobsCount(0);
            return;
        }

        if (emptyState) emptyState.style.display = 'none';
        if (countDisplay) countDisplay.innerText = LanguageManager.formatJobsCount(jobs.length);
        container.innerHTML = jobs.map((job) => this.createJobCard(job)).join('');
    }
};

const SearchEngine = {
    async init() {
        const searchInput = document.getElementById('jobs-search') || document.getElementById('hero-search');
        const categoryFilter = document.getElementById('category-filter');
        const sortFilter = document.getElementById('sort-filter');
        const clearFiltersBtn = document.getElementById('clear-filters');

        if (!searchInput && !categoryFilter && !sortFilter) return;

        const settings = Storage.getSettings();

        const performSearch = async () => {
            const query = String(searchInput?.value || '').toLowerCase().trim();
            const category = categoryFilter?.value || 'All';
            const sortBy = sortFilter?.value || 'newest';
            const allJobs = await Storage.getAllJobsAsync();

            const filtered = allJobs.filter((job) => {
                const title = String(job.title || '').toLowerCase();
                const desc = String(job.description || '').toLowerCase();
                const location = String(job.location || '').toLowerCase();
                const matchesQuery = !query || title.includes(query) || desc.includes(query) || location.includes(query);
                const matchesCategory = category === 'All' || job.category === category;
                return matchesQuery && matchesCategory;
            });

            filtered.sort((a, b) => {
                if (sortBy === 'budget-high') {
                    return Number(b.price || 0) - Number(a.price || 0);
                }
                if (sortBy === 'budget-low') {
                    return Number(a.price || 0) - Number(b.price || 0);
                }

                const aDate = new Date(a.createdAt || 0).getTime();
                const bDate = new Date(b.createdAt || 0).getTime();
                return bDate - aDate;
            });

            Renderer.renderList('jobs-list', filtered);
            Renderer.renderList('featured-list', filtered.slice(0, 3));

            const hasFilters = Boolean(query) || category !== 'All';
            if (clearFiltersBtn) {
                clearFiltersBtn.style.display = hasFilters ? 'inline-flex' : 'none';
            }
        };

        searchInput?.addEventListener('input', performSearch);
        categoryFilter?.addEventListener('change', performSearch);
        sortFilter?.addEventListener('change', performSearch);
        clearFiltersBtn?.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            if (categoryFilter) categoryFilter.value = 'All';
            if (sortFilter) sortFilter.value = 'newest';
            performSearch();
        });

        const params = new URLSearchParams(window.location.search);
        const queryFromUrl = params.get('search');
        if (queryFromUrl && searchInput) {
            searchInput.value = queryFromUrl;
            performSearch();
            return;
        }

        if (searchInput && settings.jobSearch) {
            searchInput.value = settings.jobSearch;
        }
        if (categoryFilter && settings.jobCategory) {
            categoryFilter.value = settings.jobCategory;
        }
        if (sortFilter && settings.jobSort) {
            sortFilter.value = settings.jobSort;
        }

        await performSearch();
    }
};

const ThemeManager = {
    init() {
        const btn = document.getElementById('themeToggle');
        const currentTheme = Storage.getTheme();

        if (currentTheme === 'dark') {
            document.body.classList.add('dark');
            if (btn) btn.setAttribute('aria-pressed', 'true');
        }

        btn?.addEventListener('click', () => {
            document.body.classList.toggle('dark');
            const isDark = document.body.classList.contains('dark');
            Storage.setTheme(isDark ? 'dark' : 'light');
            btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
        });
    }
};

const LayoutManager = {
    ensureNavRight() {
        const navRow = document.querySelector('.nav-row');
        if (!navRow) return;

        let navRight = navRow.querySelector('.nav-right');
        if (!navRight) {
            navRight = document.createElement('div');
            navRight.className = 'nav-right';
            navRow.appendChild(navRight);
        }

        const navAuth = navRow.querySelector('.nav-auth');
        const themeToggle = document.getElementById('themeToggle');

        if (navAuth && navAuth.parentElement !== navRight) {
            navRight.appendChild(navAuth);
        }
        if (themeToggle && themeToggle.parentElement !== navRight) {
            navRight.appendChild(themeToggle);
        }
    }
};

const LanguageManager = {
    translations: {
        en: {
            nav_home: 'Home',
            nav_jobs: 'Jobs',
            nav_about: 'About',
            nav_contact: 'Contact',
            nav_post_job: 'Post Job',
            auth_sign_in: 'Sign In',
            auth_profile: 'My Profile',
            auth_settings: 'Settings',
            auth_logout: 'Logout',
            theme_toggle: 'Toggle Theme',
            language_label: 'Language',
            hero_title: 'Find local freelance work across Afghanistan',
            hero_lead: 'Browse short-term and freelance gigs posted by local businesses and individuals. Post your own job to reach local freelancers.',
            hero_browse: 'Browse Jobs',
            hero_post: 'Post a Job',
            hero_search_placeholder: 'Quick search jobs or categories (e.g. Web Designer)',
            hero_search_btn: 'Search',
            tagline: 'Fast local jobs for Afghans',
            welcome_prefix: 'Welcome, ',
            jobs_title: 'Available Opportunities',
            jobs_lead: 'Browse local freelance and short-term gigs. Contact posters directly.',
            filter_search_label: 'Search Keywords',
            filter_search_placeholder: 'Search title, company, or skills...',
            filter_category_label: 'Category',
            filter_heading: 'Search Filters',
            sort_label: 'Sort jobs',
            filter_all_categories: 'All Categories',
            filter_online_jobs: 'Online Jobs',
            filter_offline_jobs: 'Offline Jobs',
            sort_newest: 'Newest First',
            sort_budget_high: 'Budget: High to Low',
            sort_budget_low: 'Budget: Low to High',
            clear_filters: 'Clear All Filters',
            job_count_loading: 'Loading jobs...',
            empty_no_results: 'No Results',
            empty_no_jobs: 'No jobs found',
            empty_adjust: 'Try adjusting your search terms or category filters.',
            empty_cta: 'Be the first to post a job',
            back_to_jobs: 'Back to Jobs',
            job_description_heading: 'Job Description',
            portfolio_heading: 'Portfolio / Social Media',
            online_job_heading: 'Online Job Details',
            sample_link_label: 'Sample Link:',
            budget_label: 'Budget',
            contact_heading: 'Get in Touch',
            contact_btn_email: 'Email',
            contact_btn_call: 'Call',
            copy_contact: 'Copy Contact',
            share_heading: 'Share This Job',
            share_whatsapp: 'WhatsApp',
            share_copy: 'Copy Link',
            owner_manage: 'Manage Your Job',
            delete_job: 'Delete This Job',
            posted_on: 'Posted on',
            report_heading: 'Report This Job',
            report_subtext: 'If this looks unsafe, illegal, or abusive, report it for review.',
            report_reason_label: 'Reason',
            report_details_label: 'Details (optional)',
            report_reason_select: 'Select a reason',
            report_reason_illegal: 'Illegal activity',
            report_reason_scam: 'Scam or fraud',
            report_reason_hate: 'Hate or harassment',
            report_reason_adult: 'Adult content',
            report_reason_other: 'Other',
            report_details_placeholder: 'Add any details to help us review.',
            report_reason_required: 'Please choose a reason.',
            report_submit_fail: 'Could not submit the report. Please try again.',
            report_submit_success: 'Thanks. Your report was submitted.',
            portfolio_view: 'View portfolio',
            sample_view: 'View sample',
            view_sample_link: 'View sample link',
            job_location_label: 'Location',
            job_budget_label: 'Budget',
            view_details: 'View Details',
            job_not_found_title: 'Job Not Found',
            job_not_found_body: 'This job no longer exists or the link is broken.',
            job_not_found_cta: 'Browse All Jobs',
            detail_category_label: 'Category',
            detail_location_label: 'Location',
            detail_posted_by_label: 'Posted by',
            delete_not_owner: 'You can only delete your own jobs.',
            delete_confirm: 'Are you sure you want to delete this job?',
            delete_failed: 'Unable to delete this job.',
            copy_success: 'Copied!',
            copy_failed: 'Failed to copy',
            copy_link_success: 'Link Copied!',
            copy_link_failed: 'Failed to copy link',
            logout_confirm: 'Are you sure you want to log out?',
            report_delete_confirm: 'Delete this report?',
            report_clear_confirm: 'Clear all reports in this browser?',
            report_submit: 'Report Job',
            post_title: 'Post a Job',
            post_lead: 'Fill in the details below. Submitted jobs will appear on the Jobs page.',
            label_posted_by: 'Posted by',
            option_company: 'Company',
            option_freelancer: 'Freelancer',
            label_category: 'Category',
            option_choose_category: 'Choose a category',
            label_job_title: 'Job Title',
            placeholder_job_title: 'e.g. Frontend Web Designer (Kabul)',
            label_description: 'Description',
            placeholder_description: 'Describe the work, hours, pay, and required skills (max 1000 chars)',
            label_location: 'Location',
            placeholder_location: "City or 'Remote'",
            label_price: 'Price',
            placeholder_price: 'Enter price amount',
            label_online_job: 'This is an online job',
            label_sample_link: 'Sample link (if online)',
            placeholder_sample_link: 'https://example.com/sample',
            label_contact: 'Contact Info (phone or email)',
            placeholder_contact: 'email@example.com or +93 700 123 456',
            label_portfolio: 'Portfolio Link (optional)',
            placeholder_portfolio: 'https://instagram.com/username or https://youtube.com/c/yourprofile',
            portfolio_help: 'Instagram, TikTok, YouTube, or portfolio website',
            label_media_upload: 'Media Upload (optional)',
            upload_text: 'Drag and drop images or videos here',
            upload_subtext: 'or',
            upload_browse: 'click to browse',
            upload_limit: 'Max 2MB per file (images or short videos)',
            media_remove: 'Remove',
            submit_job: 'Submit Job',
            cancel: 'Cancel',
            alert_storage_full: 'Storage is full. Please use a smaller media file or remove old posts.',
            alert_required_fields: 'Please fill in all required fields.',
            alert_invalid_price: 'Please enter a valid price.',
            alert_description_short: 'Description must be at least 20 characters.',
            alert_invalid_contact: 'Please enter a valid email or phone number.',
            alert_sample_link_required: 'Please add a sample link for online jobs.',
            alert_sample_link_format: 'Sample link must start with http:// or https://',
            alert_portfolio_link_format: 'Portfolio link must start with http:// or https://',
            alert_invalid_media_type: 'Please upload an image or video file.',
            alert_media_too_large: 'File is too large. Please choose a file under 2MB.',
            feedback_enter_message: 'Please enter your feedback.',
            feedback_invalid_email: 'Please enter a valid email address.',
            feedback_thanks: 'Thank you for your feedback.',
            feedback_save_fail: 'Could not save feedback. Please try again.',
            newsletter_invalid_email: 'Enter a valid email address.',
            newsletter_subscribed: 'You are subscribed. Thanks for joining.',
            seeker_complete_fields: 'Please complete all fields.',
            seeker_min_skills: 'Please add at least 20 characters about your skills.',
            seeker_invalid_contact: 'Contact must be a valid email or phone number.',
            seeker_success: 'Your job-seeker profile was posted successfully.',
            seeker_save_fail: 'Could not save your profile. Please try again.',
            post_success: 'Job posted successfully. Redirecting...',
            post_fail: 'Unable to post the job right now. Please try again.',
            sign_in_required_title: 'Please sign in to post a job',
            sign_in_required_body: 'You need an account before posting a job.',
            sign_in_required_cta: 'Sign In / Create Account',
            jobs_found_count: '{count} jobs found'
        },
        fa: {
            nav_home: 'خانه',
            nav_jobs: 'کارها',
            nav_about: 'درباره',
            nav_contact: 'تماس',
            nav_post_job: 'ثبت کار',
            auth_sign_in: 'ورود',
            auth_profile: 'پروفایل من',
            auth_settings: 'تنظیمات',
            auth_logout: 'خروج',
            theme_toggle: 'تغییر پوسته',
            language_label: 'زبان',
            hero_title: 'کارهای فریلنس محلی در سراسر افغانستان پیدا کنید',
            hero_lead: 'کارهای کوتاه‌مدت و فریلنس را که توسط کسب‌وکارها و افراد محلی ثبت شده‌اند ببینید. کار خودتان را ثبت کنید تا به فریلنس‌های محلی برسید.',
            hero_browse: 'مشاهده کارها',
            hero_post: 'ثبت کار',
            hero_search_placeholder: 'جستجوی سریع کارها یا دسته‌بندی‌ها (مثلاً طراح وب)',
            hero_search_btn: 'جستجو',
            tagline: 'کارهای محلی سریع برای افغان‌ها',
            welcome_prefix: 'خوش آمدید، ',
            jobs_title: 'فرصت‌های موجود',
            jobs_lead: 'کارهای فریلنس و کوتاه‌مدت محلی را ببینید. مستقیم با آگهی‌دهنده تماس بگیرید.',
            filter_search_label: 'کلیدواژه جستجو',
            filter_search_placeholder: 'عنوان، شرکت یا مهارت‌ها را جستجو کنید...',
            filter_category_label: 'دسته‌بندی',
            filter_heading: 'فیلترهای جستجو',
            sort_label: 'مرتب‌سازی کارها',
            filter_all_categories: 'همه دسته‌بندی‌ها',
            filter_online_jobs: 'کارهای آنلاین',
            filter_offline_jobs: 'کارهای حضوری',
            sort_newest: 'جدیدترین',
            sort_budget_high: 'بودجه: زیاد به کم',
            sort_budget_low: 'بودجه: کم به زیاد',
            clear_filters: 'پاک کردن فیلترها',
            job_count_loading: 'در حال بارگذاری کارها...',
            empty_no_results: 'بدون نتیجه',
            empty_no_jobs: 'هیچ کاری پیدا نشد',
            empty_adjust: 'واژه‌های جستجو یا فیلتر دسته‌بندی را تغییر دهید.',
            empty_cta: 'اولین نفر باشید که کار ثبت می‌کند',
            back_to_jobs: 'بازگشت به کارها',
            job_description_heading: 'شرح کار',
            portfolio_heading: 'نمونه‌کار / شبکه‌های اجتماعی',
            online_job_heading: 'جزئیات کار آنلاین',
            sample_link_label: 'نمونه لینک:',
            budget_label: 'بودجه',
            contact_heading: 'راه‌های تماس',
            contact_btn_email: 'ایمیل',
            contact_btn_call: 'تماس',
            copy_contact: 'کپی تماس',
            share_heading: 'اشتراک‌گذاری این کار',
            share_whatsapp: 'واتساپ',
            share_copy: 'کپی لینک',
            owner_manage: 'مدیریت آگهی شما',
            delete_job: 'حذف این آگهی',
            posted_on: 'ارسال‌شده در',
            report_heading: 'گزارش این آگهی',
            report_subtext: 'اگر این آگهی ناامن، غیرقانونی یا توهین‌آمیز است گزارش دهید.',
            report_reason_label: 'دلیل',
            report_details_label: 'جزئیات (اختیاری)',
            report_reason_select: 'یک دلیل انتخاب کنید',
            report_reason_illegal: 'فعالیت غیرقانونی',
            report_reason_scam: 'کلاه‌برداری',
            report_reason_hate: 'نفرت یا آزار',
            report_reason_adult: 'محتوای بزرگسالان',
            report_reason_other: 'دیگر',
            report_details_placeholder: 'جزئیات بیشتری برای بررسی بنویسید.',
            report_reason_required: 'لطفاً یک دلیل انتخاب کنید.',
            report_submit_fail: 'ارسال گزارش ممکن نشد. لطفاً دوباره تلاش کنید.',
            report_submit_success: 'سپاس. گزارش شما ثبت شد.',
            portfolio_view: 'مشاهده نمونه‌کار',
            sample_view: 'مشاهده نمونه',
            view_sample_link: 'مشاهده نمونه لینک',
            job_location_label: 'موقعیت',
            job_budget_label: 'بودجه',
            view_details: 'مشاهده جزئیات',
            job_not_found_title: 'آگهی پیدا نشد',
            job_not_found_body: 'این آگهی دیگر موجود نیست یا لینک خراب است.',
            job_not_found_cta: 'مشاهده همه کارها',
            detail_category_label: 'دسته‌بندی',
            detail_location_label: 'موقعیت',
            detail_posted_by_label: 'ثبت‌شده توسط',
            delete_not_owner: 'فقط می‌توانید آگهی‌های خودتان را حذف کنید.',
            delete_confirm: 'آیا مطمئن هستید که می‌خواهید این آگهی را حذف کنید؟',
            delete_failed: 'حذف آگهی ممکن نشد.',
            copy_success: 'کپی شد!',
            copy_failed: 'کپی ناموفق بود',
            copy_link_success: 'لینک کپی شد!',
            copy_link_failed: 'کپی لینک ناموفق بود',
            logout_confirm: 'آیا مطمئن هستید که می‌خواهید خارج شوید؟',
            report_delete_confirm: 'این گزارش حذف شود؟',
            report_clear_confirm: 'همه گزارش‌ها در این مرورگر پاک شود؟',
            report_submit: 'گزارش آگهی',
            post_title: 'ثبت کار',
            post_lead: 'جزئیات را پر کنید. آگهی‌ها در صفحه کارها نمایش داده می‌شوند.',
            label_posted_by: 'ثبت‌شده توسط',
            option_company: 'شرکت',
            option_freelancer: 'فریلنس',
            label_category: 'دسته‌بندی',
            option_choose_category: 'یک دسته‌بندی انتخاب کنید',
            label_job_title: 'عنوان کار',
            placeholder_job_title: 'مثلاً طراح وب فرانت‌اند (کابل)',
            label_description: 'توضیحات',
            placeholder_description: 'کار، ساعات، دستمزد و مهارت‌های لازم را توضیح دهید (حداکثر 1000 کاراکتر)',
            label_location: 'موقعیت',
            placeholder_location: "شهر یا 'دورکاری'",
            label_price: 'قیمت',
            placeholder_price: 'مبلغ را وارد کنید',
            label_online_job: 'این یک کار آنلاین است',
            label_sample_link: 'نمونه لینک (اگر آنلاین است)',
            placeholder_sample_link: 'https://example.com/sample',
            label_contact: 'اطلاعات تماس (تلفن یا ایمیل)',
            placeholder_contact: 'email@example.com یا +93 700 123 456',
            label_portfolio: 'لینک نمونه‌کار (اختیاری)',
            placeholder_portfolio: 'https://instagram.com/username یا https://youtube.com/c/yourprofile',
            portfolio_help: 'اینستاگرام، تیک‌تاک، یوتیوب یا وب‌سایت نمونه‌کار',
            label_media_upload: 'آپلود رسانه (اختیاری)',
            upload_text: 'تصاویر یا ویدیوها را اینجا بکشید و رها کنید',
            upload_subtext: 'یا',
            upload_browse: 'برای انتخاب فایل کلیک کنید',
            upload_limit: 'حداکثر 2MB برای هر فایل (تصاویر یا ویدیوهای کوتاه)',
            media_remove: 'حذف',
            submit_job: 'ارسال آگهی',
            cancel: 'لغو',
            alert_storage_full: 'فضای ذخیره‌سازی پر است. لطفاً فایل کوچک‌تر انتخاب کنید یا آگهی‌های قدیمی را حذف کنید.',
            alert_required_fields: 'لطفاً همه بخش‌های ضروری را پر کنید.',
            alert_invalid_price: 'لطفاً یک قیمت معتبر وارد کنید.',
            alert_description_short: 'توضیحات باید حداقل ۲۰ کاراکتر باشد.',
            alert_invalid_contact: 'لطفاً یک ایمیل یا شماره تلفن معتبر وارد کنید.',
            alert_sample_link_required: 'لطفاً برای کارهای آنلاین نمونه لینک اضافه کنید.',
            alert_sample_link_format: 'نمونه لینک باید با http:// یا https:// شروع شود',
            alert_portfolio_link_format: 'لینک نمونه‌کار باید با http:// یا https:// شروع شود',
            alert_invalid_media_type: 'لطفاً یک فایل تصویر یا ویدیو آپلود کنید.',
            alert_media_too_large: 'فایل خیلی بزرگ است. لطفاً فایلی زیر ۲MB انتخاب کنید.',
            feedback_enter_message: 'لطفاً بازخورد خود را وارد کنید.',
            feedback_invalid_email: 'لطفاً یک ایمیل معتبر وارد کنید.',
            feedback_thanks: 'از بازخورد شما سپاسگزاریم.',
            feedback_save_fail: 'ذخیره بازخورد ممکن نشد. لطفاً دوباره تلاش کنید.',
            newsletter_invalid_email: 'یک ایمیل معتبر وارد کنید.',
            newsletter_subscribed: 'شما عضو شدید. سپاس از همراهی شما.',
            seeker_complete_fields: 'لطفاً همه بخش‌ها را کامل کنید.',
            seeker_min_skills: 'لطفاً حداقل ۲۰ کاراکتر درباره مهارت‌ها بنویسید.',
            seeker_invalid_contact: 'اطلاعات تماس باید ایمیل یا شماره تلفن معتبر باشد.',
            seeker_success: 'پروفایل جوینده کار شما با موفقیت ثبت شد.',
            seeker_save_fail: 'ذخیره پروفایل ممکن نشد. لطفاً دوباره تلاش کنید.',
            post_success: 'آگهی با موفقیت ثبت شد. در حال انتقال...',
            post_fail: 'ثبت آگهی ممکن نشد. لطفاً دوباره تلاش کنید.',
            sign_in_required_title: 'برای ثبت آگهی وارد شوید',
            sign_in_required_body: 'برای ثبت آگهی نیاز به حساب دارید.',
            sign_in_required_cta: 'ورود / ساخت حساب',
            jobs_found_count: '{count} کار پیدا شد'
        }
    },

    getLanguage() {
        return localStorage.getItem(APP_KEYS.LANGUAGE) || 'en';
    },

    setLanguage(lang) {
        localStorage.setItem(APP_KEYS.LANGUAGE, lang);
    },

    t(key) {
        const lang = this.getLanguage();
        return this.translations[lang]?.[key] || this.translations.en[key] || '';
    },

    formatWelcome(name) {
        return `${this.t('welcome_prefix')}${name || ''}`.trim();
    },

    formatJobsCount(count) {
        return this.t('jobs_found_count').replace('{count}', String(count));
    },

    ensureLanguageSelect() {
        const navRight = document.querySelector('.nav-right') || document.querySelector('.nav-row');
        if (!navRight) return;

        if (document.getElementById('language-select')) return;

        const select = document.createElement('select');
        select.id = 'language-select';
        select.className = 'language-select';
        select.setAttribute('aria-label', this.t('language_label'));

        const optionEn = document.createElement('option');
        optionEn.value = 'en';
        optionEn.textContent = 'English';
        const optionFa = document.createElement('option');
        optionFa.value = 'fa';
        optionFa.textContent = 'دری';

        select.appendChild(optionEn);
        select.appendChild(optionFa);

        select.value = this.getLanguage();
        select.addEventListener('change', (event) => {
            const lang = String(event.target.value || 'en');
            this.setLanguage(lang);
            this.applyTranslations();
        });

        navRight.appendChild(select);
    },

    applyTranslations() {
        const lang = this.getLanguage();
        document.documentElement.lang = lang === 'fa' ? 'fa' : 'en';

        const tagline = document.querySelector('.site-tagline');
        if (tagline) tagline.textContent = this.t('tagline');

        const navLinks = document.querySelectorAll('.main-nav a.nav-link');
        navLinks.forEach((link) => {
            const href = link.getAttribute('href');
            const keyMap = {
                'index.html': 'nav_home',
                'jobs.html': 'nav_jobs',
                'about.html': 'nav_about',
                'contact.html': 'nav_contact',
                'post-job.html': 'nav_post_job'
            };
            const key = keyMap[href || ''];
            if (key) link.textContent = this.t(key);
        });

        const authLink = document.getElementById('auth-link');
        if (authLink) authLink.textContent = this.t('auth_sign_in');

        const profileLink = document.getElementById('profile-link');
        if (profileLink) profileLink.textContent = this.t('auth_profile');

        const settingsLink = document.getElementById('settings-link');
        if (settingsLink) settingsLink.textContent = this.t('auth_settings');

        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) logoutBtn.textContent = this.t('auth_logout');

        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) themeToggle.textContent = this.t('theme_toggle');

        const heroTitle = document.getElementById('hero-title');
        if (heroTitle) heroTitle.textContent = this.t('hero_title');

        const heroLead = document.getElementById('hero-lead');
        if (heroLead) heroLead.textContent = this.t('hero_lead');

        const heroBrowseBtn = document.getElementById('hero-browse-btn');
        if (heroBrowseBtn) heroBrowseBtn.textContent = this.t('hero_browse');

        const heroPostBtn = document.getElementById('hero-post-btn');
        if (heroPostBtn) heroPostBtn.textContent = this.t('hero_post');

        const heroSearch = document.getElementById('hero-search');
        if (heroSearch) heroSearch.setAttribute('placeholder', this.t('hero_search_placeholder'));

        const heroSearchBtn = document.getElementById('hero-search-btn');
        if (heroSearchBtn) heroSearchBtn.textContent = this.t('hero_search_btn');

        const userDisplay = document.getElementById('user-display');
        const currentUser = Storage.getCurrentUser();
        if (userDisplay && currentUser) {
            userDisplay.textContent = this.formatWelcome(currentUser.fullname || 'User');
        }

        document.querySelectorAll('[data-i18n]').forEach((el) => {
            const key = el.getAttribute('data-i18n');
            if (!key) return;
            const value = this.t(key);
            if (value) el.textContent = value;
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (!key) return;
            const value = this.t(key);
            if (value) el.setAttribute('placeholder', value);
        });

        document.querySelectorAll('[data-i18n-label]').forEach((el) => {
            const key = el.getAttribute('data-i18n-label');
            if (!key) return;
            const value = this.t(key);
            if (value) el.setAttribute('label', value);
        });
    },

    init() {
        this.ensureLanguageSelect();
        this.applyTranslations();
    }
};

const AuthManager = {
    init() {
        const userDisplay = document.getElementById('user-display');
        const authLink = document.getElementById('auth-link');
        const profileLink = document.getElementById('profile-link');
        const settingsLink = document.getElementById('settings-link');
        const logoutBtn = document.getElementById('logout-btn');
        const navAuth = document.querySelector('.nav-auth');
        let adminLink = document.getElementById('admin-reports-link');

        if (!adminLink && navAuth) {
            adminLink = document.createElement('a');
            adminLink.href = 'admin-reports.html';
            adminLink.id = 'admin-reports-link';
            adminLink.className = 'nav-link';
            adminLink.style.color = 'var(--primary)';
            adminLink.style.display = 'none';
            adminLink.textContent = 'Admin Reports';
            navAuth.insertBefore(adminLink, logoutBtn || null);
        }

        if (!userDisplay || !authLink || !logoutBtn) return;

        const applySignedOut = () => {
            userDisplay.textContent = '';
            userDisplay.style.display = 'none';
            authLink.style.display = 'inline';
            if (profileLink) profileLink.style.display = 'none';
            if (settingsLink) settingsLink.style.display = 'none';
            if (adminLink) adminLink.style.display = 'none';
            logoutBtn.style.display = 'none';
        };

        const applySignedIn = (user) => {
            if (!user) {
                applySignedOut();
                return;
            }
            userDisplay.textContent = LanguageManager.formatWelcome(user.fullname || 'User');
            userDisplay.style.display = 'inline';
            authLink.style.display = 'none';
            if (profileLink) profileLink.style.display = 'inline';
            if (settingsLink) settingsLink.style.display = 'inline';
            if (adminLink) adminLink.style.display = Utils.isAdmin(user) ? 'inline' : 'none';
            logoutBtn.style.display = 'inline';
        };

        const syncWelcomeFromStorage = () => {
            const latestUser = Storage.getCurrentUser();
            if (latestUser) {
                applySignedIn(latestUser);
            } else {
                applySignedOut();
            }
        };

        syncWelcomeFromStorage();

        window.addEventListener('afg-user-updated', syncWelcomeFromStorage);

        logoutBtn.addEventListener('click', async (event) => {
            event.preventDefault();
            if (!confirm(LanguageManager.t('logout_confirm'))) return;

            localStorage.removeItem(APP_KEYS.USER);
            localStorage.removeItem('afg_auth_source');

            if (window.firebase && window.firebase.auth) {
                try {
                    await window.firebase.auth().signOut();
                } catch {
                    // Ignore Firebase sign-out errors and still clear local session.
                }
            }

            window.location.reload();
        });

        if (window.firebase && window.firebase.auth) {
            const auth = window.firebase.auth();
            auth.onAuthStateChanged((fbUser) => {
                if (fbUser && fbUser.uid) {
                    const providerInfo = Array.isArray(fbUser.providerData) ? fbUser.providerData[0] : null;
                    const localUser = Storage.getCurrentUser();
                    const isSameLocal = localUser
                        && (String(localUser.id || '') === String(fbUser.uid)
                            || (localUser.oauthUid && localUser.oauthUid === fbUser.uid)
                            || (localUser.email && fbUser.email && localUser.email === fbUser.email));
                    if (isSameLocal) {
                        localStorage.setItem(APP_KEYS.USER, JSON.stringify(localUser));
                        localStorage.setItem('afg_auth_source', 'firebase');
                        applySignedIn(localUser);
                        return;
                    }
                    const users = Storage.getUsers();
                    const byUid = users.find((u) => u && u.oauthUid && u.oauthUid === fbUser.uid);
                    const byEmail = users.find((u) => u && u.email && fbUser.email && u.email === fbUser.email);
                    const profileUser = byUid || byEmail || localUser || {};
                    const syncedUser = {
                        id: profileUser.id || fbUser.uid,
                        email: fbUser.email || profileUser.email || '',
                        fullname: profileUser.fullname || fbUser.displayName || 'User',
                        phone: profileUser.phone || fbUser.phoneNumber || '',
                        type: profileUser.type || 'User',
                        portfolio: profileUser.portfolio || '',
                        bio: profileUser.bio || '',
                        avatar: profileUser.avatar || fbUser.photoURL || '',
                        oauthUid: profileUser.oauthUid || fbUser.uid,
                        oauthProvider: profileUser.oauthProvider || providerInfo?.providerId || '',
                        authProvider: profileUser.authProvider || providerInfo?.providerId || ''
                    };
                    localStorage.setItem(APP_KEYS.USER, JSON.stringify(syncedUser));
                    localStorage.setItem('afg_auth_source', 'firebase');
                    applySignedIn(syncedUser);
                    return;
                }

                if (localStorage.getItem('afg_auth_source') === 'firebase') {
                    localStorage.removeItem(APP_KEYS.USER);
                    localStorage.removeItem('afg_auth_source');
                    applySignedOut();
                }
            });
        }
    }
};

const FormHandler = {
    mediaData: null,
    mediaType: null,
    mediaTouched: false,
    mediaFile: null,
    editingJob: null,

    async init() {
        const form = document.getElementById('post-job-form');
        const user = Storage.getCurrentUser();
        const settings = Storage.getSettings();

        if (form && !user) {
            const container = form.parentElement;
            container.innerHTML = `<div style="text-align:center;padding:2rem;"><h3>${LanguageManager.t('sign_in_required_title')}</h3><p>${LanguageManager.t('sign_in_required_body')}</p><a href="auth.html" class="btn" style="display:inline-block;margin-top:1rem;">${LanguageManager.t('sign_in_required_cta')}</a></div>`;
            return;
        }

        if (!form) return;

        const fileInput = document.getElementById('media-upload-input');
        const mediaUploadArea = document.getElementById('media-upload-area');
        const uploadBtn = document.getElementById('upload-btn');
        const removeBtn = document.getElementById('media-remove-btn');
        const descTextarea = document.getElementById('description');
        const charCount = document.getElementById('char-count');
        const isOnlineCheckbox = document.getElementById('is-online');
        const sampleLinkLabel = document.getElementById('sample-link-label');
        const sampleLinkInput = document.getElementById('sample-link');

        if (settings) {
            const posterTypeSelect = document.getElementById('poster-type');
            const categorySelect = document.getElementById('category');
            const currencySelect = document.getElementById('currency');
            const locationInput = document.getElementById('location');
            const onlineCheckbox = document.getElementById('is-online');

            if (posterTypeSelect && settings.defaultPosterType) {
                posterTypeSelect.value = settings.defaultPosterType;
            }
            if (categorySelect && !categorySelect.value && settings.defaultCategory) {
                categorySelect.value = settings.defaultCategory;
            }
            if (currencySelect && settings.defaultCurrency) {
                currencySelect.value = settings.defaultCurrency;
            }
            if (locationInput && !locationInput.value && settings.defaultLocation) {
                locationInput.value = settings.defaultLocation;
            }
            if (onlineCheckbox && settings.defaultOnline) {
                onlineCheckbox.checked = true;
            }
        }

        const syncOnlineFields = () => {
            const show = Boolean(isOnlineCheckbox?.checked);
            if (!sampleLinkLabel || !sampleLinkInput) return;
            sampleLinkLabel.style.display = show ? 'block' : 'none';
            sampleLinkInput.style.display = show ? 'block' : 'none';
            sampleLinkInput.required = show;
            if (!show) sampleLinkInput.value = '';
        };

        isOnlineCheckbox?.addEventListener('change', syncOnlineFields);
        syncOnlineFields();

        if (descTextarea && charCount) {
            descTextarea.addEventListener('input', (event) => {
                charCount.textContent = `${event.target.value.length}/1000`;
            });
        }

        if (fileInput) {
            fileInput.addEventListener('change', (event) => this.handleFile(event.target.files?.[0]));
        }

        if (mediaUploadArea && fileInput) {
            mediaUploadArea.addEventListener('click', () => fileInput.click());

            mediaUploadArea.addEventListener('dragover', (event) => {
                event.preventDefault();
                mediaUploadArea.style.borderColor = 'var(--primary)';
                mediaUploadArea.style.background = 'rgba(37, 99, 235, 0.05)';
            });

            mediaUploadArea.addEventListener('dragleave', () => {
                mediaUploadArea.style.borderColor = 'var(--border)';
                mediaUploadArea.style.background = 'var(--accent-bg)';
            });

            mediaUploadArea.addEventListener('drop', (event) => {
                event.preventDefault();
                mediaUploadArea.style.borderColor = 'var(--border)';
                mediaUploadArea.style.background = 'var(--accent-bg)';
                this.handleFile(event.dataTransfer?.files?.[0]);
            });
        }

        uploadBtn?.addEventListener('click', (event) => {
            event.preventDefault();
            fileInput?.click();
        });

        removeBtn?.addEventListener('click', () => {
            this.mediaData = null;
            this.mediaType = null;
            this.mediaTouched = true;
            this.mediaFile = null;
            const container = document.getElementById('media-preview-container');
            if (container) container.style.display = 'none';
            if (fileInput) fileInput.value = '';
        });

        await this.loadEditJob(form, user, syncOnlineFields);

        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            const formData = new FormData(form);
            const title = String(formData.get('title') || '').trim();
            const category = String(formData.get('category') || '').trim();
            const description = String(formData.get('description') || '').trim();
            const location = String(formData.get('location') || '').trim();
            const contact = String(formData.get('contact') || '').trim();
            const posterType = String(formData.get('posterType') || '').trim();
            const price = Number(formData.get('price'));
            const currency = String(formData.get('currency') || 'USD').trim();
            const isOnline = formData.get('isOnline') === 'on';
            const sampleLink = String(formData.get('sampleLink') || '').trim();
            const portfolioLink = String(formData.get('portfolioLink') || '').trim();
            const existingJob = this.editingJob;
            const isEditing = Boolean(existingJob && existingJob.id);

            if (!title || !category || !description || !location || !contact || !posterType) {
                alert(LanguageManager.t('alert_required_fields'));
                return;
            }

            if (!Number.isFinite(price) || price < 0) {
                alert(LanguageManager.t('alert_invalid_price'));
                return;
            }

            if (description.length < 20) {
                alert(LanguageManager.t('alert_description_short'));
                return;
            }

            if (!Utils.isEmail(contact) && !Utils.isPhone(contact)) {
                alert(LanguageManager.t('alert_invalid_contact'));
                return;
            }

            if (isOnline && !sampleLink) {
                alert(LanguageManager.t('alert_sample_link_required'));
                return;
            }

            if (sampleLink && !/^https?:\/\//i.test(sampleLink)) {
                alert(LanguageManager.t('alert_sample_link_format'));
                return;
            }

            if (portfolioLink && !/^https?:\/\//i.test(portfolioLink)) {
                alert(LanguageManager.t('alert_portfolio_link_format'));
                return;
            }

            let media = this.mediaData;
            let mediaType = this.mediaType;
            if (isEditing && !this.mediaTouched) {
                media = existingJob.media || '';
                mediaType = existingJob.mediaType || '';
            } else if (this.mediaFile) {
                const storageReady = await FirebaseStorageLoader.load();
                if (storageReady && window.firebase?.storage) {
                    try {
                        const storage = window.firebase.storage();
                        const safeName = String(this.mediaFile.name || 'upload')
                            .replace(/[^a-zA-Z0-9._-]+/g, '_')
                            .slice(0, 80);
                        const userId = user?.id ? String(user.id) : 'anonymous';
                        const path = `jobs/${userId}/${Date.now()}-${safeName}`;
                        const ref = storage.ref().child(path);
                        await ref.put(this.mediaFile, { contentType: this.mediaFile.type });
                        media = await ref.getDownloadURL();
                        mediaType = this.mediaFile.type;
                    } catch {
                        alert('Media upload failed. Please try again or choose a smaller file.');
                        return;
                    }
                }
            }

            const jobData = {
                title,
                category,
                description,
                location,
                contact,
                posterType,
                price,
                currency,
                isOnline,
                sampleLink,
                portfolioLink,
                media,
                mediaType,
                posterId: existingJob?.posterId || user.id,
                postedBy: existingJob?.postedBy || user.email,
                postedByName: existingJob?.postedByName || user.fullname
            };

            const msgEl = document.getElementById('form-msg');
            let saveResult = null;
            if (isEditing) {
                const payload = {
                    ...jobData,
                    id: existingJob.id,
                    createdAt: existingJob.createdAt || new Date().toISOString(),
                    createdAtMs: existingJob.createdAtMs || Date.parse(existingJob.createdAt) || Date.now()
                };
                saveResult = await Storage.updateJobAsync(payload);
            } else {
                saveResult = await Storage.saveJobAsync(jobData);
            }
            if (!saveResult.ok) {
                if (msgEl) {
                    msgEl.textContent = LanguageManager.t('post_fail');
                    msgEl.className = 'form-msg error';
                }
                return;
            }

            form.reset();
            this.mediaData = null;
            this.mediaType = null;
            this.mediaTouched = false;
            this.mediaFile = null;
            this.editingJob = null;
            const previewContainer = document.getElementById('media-preview-container');
            if (previewContainer) previewContainer.style.display = 'none';
            syncOnlineFields();

            if (msgEl) {
                msgEl.textContent = isEditing ? 'Job updated successfully.' : LanguageManager.t('post_success');
                msgEl.className = 'form-msg success';
            }

            setTimeout(() => {
                localStorage.removeItem('editJobId');
                window.location.href = 'jobs.html';
            }, 1200);
        });
    },

    async loadEditJob(form, user, syncOnlineFields) {
        const editId = localStorage.getItem('editJobId');
        if (!editId) return;

        const jobs = await Storage.getAllJobsAsync();
        const job = jobs.find((item) => String(item.id) === String(editId));
        if (!job) {
            localStorage.removeItem('editJobId');
            return;
        }

        if (!Utils.isJobOwner(job, user)) {
            localStorage.removeItem('editJobId');
            alert(LanguageManager.t('delete_not_owner'));
            window.location.href = 'jobs.html';
            return;
        }

        this.editingJob = job;
        const jobIdInput = document.getElementById('job-id');
        if (jobIdInput) jobIdInput.value = job.id;

        document.getElementById('poster-type').value = job.posterType || 'Company';
        document.getElementById('category').value = job.category || '';
        document.getElementById('title').value = job.title || '';
        document.getElementById('description').value = job.description || '';
        document.getElementById('location').value = job.location || '';
        document.getElementById('price').value = job.price ?? '';
        document.getElementById('currency').value = job.currency || 'USD';
        document.getElementById('contact').value = job.contact || '';
        document.getElementById('portfolio-link').value = job.portfolioLink || '';
        document.getElementById('is-online').checked = Boolean(job.isOnline);
        document.getElementById('sample-link').value = job.sampleLink || '';
        if (typeof syncOnlineFields === 'function') syncOnlineFields();

        const descCount = document.getElementById('char-count');
        if (descCount) descCount.textContent = `${(job.description || '').length}/1000`;

        if (job.media) {
            this.mediaData = job.media;
            this.mediaType = job.mediaType || '';
            this.mediaTouched = false;
            this.mediaFile = null;
            this.setMediaPreview(job.media, job.mediaType || '');
        }

        const titleEl = document.querySelector('.post-form h2');
        const leadEl = document.querySelector('.post-form .lead');
        if (titleEl) titleEl.textContent = 'Edit Job';
        if (leadEl) leadEl.textContent = 'Update the details below and save your changes.';

        const submitBtn = document.getElementById('submit-btn');
        if (submitBtn) submitBtn.textContent = 'Update Job';
        const cancelBtn = document.getElementById('cancel-edit');
        if (cancelBtn) {
            cancelBtn.style.display = 'inline-flex';
            cancelBtn.addEventListener('click', () => {
                localStorage.removeItem('editJobId');
                window.location.href = 'jobs.html';
            }, { once: true });
        }
    },

    setMediaPreview(media, mediaType) {
        const previewContainer = document.getElementById('media-preview-container');
        const imgEl = document.getElementById('media-preview-img');
        const videoEl = document.getElementById('media-preview-video');

        if (!previewContainer || !imgEl || !videoEl) return;

        previewContainer.style.display = 'block';
        const isVideo = String(mediaType || '').startsWith('video/');
        if (isVideo) {
            imgEl.style.display = 'none';
            videoEl.style.display = 'block';
            videoEl.src = media;
        } else {
            videoEl.style.display = 'none';
            imgEl.style.display = 'block';
            imgEl.src = media;
        }
    },

    handleFile(file) {
        if (!file) return;

        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
            alert(LanguageManager.t('alert_invalid_media_type'));
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            alert(LanguageManager.t('alert_media_too_large'));
            return;
        }

        this.mediaFile = file;
        const reader = new FileReader();
        reader.onload = (event) => {
            const result = event.target?.result;
            if (!result) return;
            this.mediaData = String(result);
            this.mediaType = file.type;
            this.mediaTouched = true;
            this.setMediaPreview(this.mediaData, this.mediaType);
            const info = document.getElementById('media-info');
            if (info) info.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
        };

        reader.readAsDataURL(file);
    }
};

const FirebaseStorageLoader = {
    loading: null,

    load() {
        if (!window.firebase) return Promise.resolve(false);
        if (window.firebase.storage) return Promise.resolve(true);
        if (this.loading) return this.loading;

        this.loading = new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = 'https://www.gstatic.com/firebasejs/10.12.3/firebase-storage-compat.js';
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.head.appendChild(script);
        });

        return this.loading;
    }
};

const FeedbackHandler = {
    init() {
        const form = document.getElementById('feedback-form');
        if (!form) return;

        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            const name = String(document.getElementById('feedback-name')?.value || '').trim() || 'Anonymous';
            const email = String(document.getElementById('feedback-email')?.value || '').trim();
            const message = String(document.getElementById('feedback-message')?.value || '').trim();
            const msgEl = document.getElementById('feedback-msg');

            if (!message) {
                if (msgEl) {
                    msgEl.textContent = LanguageManager.t('feedback_enter_message');
                    msgEl.className = 'feedback-msg error';
                }
                return;
            }

            if (email && !Utils.isEmail(email)) {
                if (msgEl) {
                    msgEl.textContent = LanguageManager.t('feedback_invalid_email');
                    msgEl.className = 'feedback-msg error';
                }
                return;
            }

            const result = await Storage.saveFeedbackAsync({ name, email, message });
            if (!result.ok) {
                if (msgEl) {
                    msgEl.textContent = LanguageManager.t('feedback_save_fail');
                    msgEl.className = 'feedback-msg error';
                }
                return;
            }

            form.reset();
            if (msgEl) {
                msgEl.textContent = LanguageManager.t('feedback_thanks');
                msgEl.className = 'feedback-msg success';
                setTimeout(() => {
                    msgEl.className = 'feedback-msg';
                }, 3000);
            }
        });
    }
};

const NewsletterHandler = {
    init() {
        const form = document.getElementById('newsletter-form');
        if (!form) return;

        form.addEventListener('submit', (event) => {
            event.preventDefault();

            const input = document.getElementById('newsletter-email');
            const msgEl = document.getElementById('newsletter-msg');
            const email = String(input?.value || '').trim().toLowerCase();

            if (!Utils.isEmail(email)) {
                if (msgEl) {
                    msgEl.textContent = LanguageManager.t('newsletter_invalid_email');
                    msgEl.className = 'feedback-msg error';
                }
                return;
            }

            const entries = Utils.readJson(APP_KEYS.NEWSLETTER, []);
            if (!entries.includes(email)) {
                entries.push(email);
                localStorage.setItem(APP_KEYS.NEWSLETTER, JSON.stringify(entries));
            }

            if (input) input.value = '';
            if (msgEl) {
                msgEl.textContent = LanguageManager.t('newsletter_subscribed');
                msgEl.className = 'feedback-msg success';
            }
        });
    }
};

const JobSeekerHandler = {
    init() {
        const form = document.getElementById('seeker-form');
        if (!form) return;

        form.addEventListener('submit', (event) => {
            event.preventDefault();

            const name = String(document.getElementById('seeker-name')?.value || '').trim();
            const location = String(document.getElementById('seeker-location')?.value || '').trim();
            const skills = String(document.getElementById('seeker-skills')?.value || '').trim();
            const contact = String(document.getElementById('seeker-contact')?.value || '').trim();
            const msgEl = document.getElementById('seeker-msg');

            if (!name || !location || !skills || !contact) {
                if (msgEl) {
                    msgEl.textContent = LanguageManager.t('seeker_complete_fields');
                    msgEl.className = 'feedback-msg error';
                }
                return;
            }

            if (skills.length < 20) {
                if (msgEl) {
                    msgEl.textContent = LanguageManager.t('seeker_min_skills');
                    msgEl.className = 'feedback-msg error';
                }
                return;
            }

            if (!Utils.isEmail(contact) && !Utils.isPhone(contact)) {
                if (msgEl) {
                    msgEl.textContent = LanguageManager.t('seeker_invalid_contact');
                    msgEl.className = 'feedback-msg error';
                }
                return;
            }

            const posts = Utils.readJson(APP_KEYS.SEEKER_POSTS, []);
            posts.unshift({
                id: Date.now(),
                name,
                location,
                skills,
                contact,
                createdAt: new Date().toISOString()
            });

            try {
                localStorage.setItem(APP_KEYS.SEEKER_POSTS, JSON.stringify(posts.slice(0, 200)));
                form.reset();
                if (msgEl) {
                    msgEl.textContent = LanguageManager.t('seeker_success');
                    msgEl.className = 'feedback-msg success';
                }
            } catch {
                if (msgEl) {
                    msgEl.textContent = LanguageManager.t('seeker_save_fail');
                    msgEl.className = 'feedback-msg error';
                }
            }
        });
    }
};

const AdminAccess = {
    ensure(listEl, emptyEl, clearBtn) {
        const user = Storage.getCurrentUser();
        if (Utils.isAdmin(user)) return true;

        if (listEl) {
            listEl.innerHTML = '<div class="empty-state-container"><h4>Access denied</h4><p>This page is restricted.</p></div>';
        }
        if (emptyEl) emptyEl.style.display = 'none';
        if (clearBtn) clearBtn.style.display = 'none';
        return false;
    }
};

const ReportsManager = {
    async fetchReports() {
        if (FirebaseStore.enabled && FirebaseStore.db) {
            try {
                const snapshot = await FirebaseStore.db
                    .collection(REPORTS_COLLECTION)
                    .orderBy('createdAtMs', 'desc')
                    .limit(REPORTS_LIMIT)
                    .get();
                return snapshot.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                    __source: 'firebase'
                }));
            } catch {
                // Fall back to local storage below.
            }
        }

        return Utils.readJson(APP_KEYS.REPORTS, []).map((report) => ({
            ...report,
            __source: 'local'
        }));
    },

    renderReports(reports) {
        const list = document.getElementById('reports-list');
        const empty = document.getElementById('reports-empty');
        if (!list) return;

        if (!Array.isArray(reports) || reports.length === 0) {
            list.innerHTML = '';
            if (empty) empty.style.display = 'block';
            return;
        }

        if (empty) empty.style.display = 'none';
        list.innerHTML = reports.map((report) => {
            const title = Utils.escapeHtml(report.jobTitle || 'Untitled');
            const reason = Utils.escapeHtml(report.reason || 'Unknown');
            const details = Utils.escapeHtml(report.details || '');
            const reporter = Utils.escapeHtml(report.reporterName || report.reporterEmail || 'Anonymous');
            const createdAt = report.createdAt
                ? new Date(report.createdAt).toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })
                : '-';
            const jobLink = report.jobId ? `job-detail.html?id=${report.jobId}` : '';
            const reportId = Utils.escapeHtml(String(report.id || ''));
            const reportSource = Utils.escapeHtml(String(report.__source || 'local'));

            return `
                <div class="report-card">
                    <div class="report-title">${title}</div>
                    <div class="report-meta">
                        <span class="report-badge">${reason}</span>
                        <span>Reported by: ${reporter}</span>
                        <span>${createdAt}</span>
                    </div>
                    ${details ? `<div class="report-details">${details}</div>` : ''}
                    <div class="report-actions">
                        ${jobLink ? `<a class="btn outline small" href="${jobLink}">View Job</a>` : ''}
                        <button class="btn danger small" data-report-id="${reportId}" data-report-source="${reportSource}">Delete Report</button>
                    </div>
                </div>
            `;
        }).join('');

        list.querySelectorAll('button[data-report-id]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-report-id');
                const source = btn.getAttribute('data-report-source') || 'local';
                if (!confirm(LanguageManager.t('report_delete_confirm'))) return;
                await this.deleteReport(id, source);
                const refreshed = await this.fetchReports();
                this.renderReports(refreshed);
            });
        });
    },

    async deleteReport(id, source) {
        if (source === 'firebase' && FirebaseStore.enabled && FirebaseStore.db) {
            try {
                await FirebaseStore.db.collection(REPORTS_COLLECTION).doc(String(id)).delete();
                return;
            } catch {
                // Fall back to local if needed.
            }
        }

        const reports = Utils.readJson(APP_KEYS.REPORTS, []);
        const updated = reports.filter((item) => String(item.id) !== String(id));
        localStorage.setItem(APP_KEYS.REPORTS, JSON.stringify(updated));
    },

    async clearReports() {
        if (FirebaseStore.enabled && FirebaseStore.db) {
            try {
                const snapshot = await FirebaseStore.db
                    .collection(REPORTS_COLLECTION)
                    .orderBy('createdAtMs', 'desc')
                    .limit(REPORTS_LIMIT)
                    .get();
                if (snapshot.empty) return;
                const batch = FirebaseStore.db.batch();
                snapshot.docs.forEach((doc) => batch.delete(doc.ref));
                await batch.commit();
                return;
            } catch {
                // Fall back to local if needed.
            }
        }

        localStorage.setItem(APP_KEYS.REPORTS, JSON.stringify([]));
    },

    async init() {
        const list = document.getElementById('reports-list');
        if (!list) return;

        const clearBtn = document.getElementById('clear-reports-btn');
        const empty = document.getElementById('reports-empty');
        if (!AdminAccess.ensure(list, empty, clearBtn)) return;

        const reports = await this.fetchReports();
        this.renderReports(reports);

        clearBtn?.addEventListener('click', async () => {
            if (!confirm(LanguageManager.t('report_clear_confirm'))) return;
            await this.clearReports();
            const refreshed = await this.fetchReports();
            this.renderReports(refreshed);
        });
    }
};

const FeedbackAdminManager = {
    async fetchFeedback() {
        if (FirebaseStore.enabled && FirebaseStore.db) {
            try {
                const snapshot = await FirebaseStore.db
                    .collection(FEEDBACK_COLLECTION)
                    .orderBy('createdAtMs', 'desc')
                    .limit(FEEDBACK_LIMIT)
                    .get();
                return snapshot.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                    __source: 'firebase'
                }));
            } catch {
                // Fall back to local storage below.
            }
        }

        return Utils.readJson(APP_KEYS.FEEDBACK, []).map((item, index) => ({
            id: item.id || `local-${index}`,
            ...item,
            __source: 'local'
        }));
    },

    renderFeedback(items) {
        const list = document.getElementById('feedback-list');
        const empty = document.getElementById('feedback-empty');
        if (!list) return;

        if (!Array.isArray(items) || items.length === 0) {
            list.innerHTML = '';
            if (empty) empty.style.display = 'block';
            return;
        }

        if (empty) empty.style.display = 'none';
        list.innerHTML = items.map((item) => {
            const name = Utils.escapeHtml(item.name || 'Anonymous');
            const email = Utils.escapeHtml(item.email || '');
            const message = Utils.escapeHtml(item.message || '');
            const createdAt = item.createdAt
                ? new Date(item.createdAt).toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })
                : (item.timestamp ? new Date(item.timestamp).toLocaleString('en-US') : '-');
            const source = Utils.escapeHtml(String(item.__source || 'local'));
            const itemId = Utils.escapeHtml(String(item.id || ''));

            return `
                <div class="report-card">
                    <div class="report-title">Feedback from ${name}</div>
                    <div class="report-meta">
                        ${email ? `<span>${email}</span>` : ''}
                        <span>${createdAt}</span>
                    </div>
                    ${message ? `<div class="report-details">${message}</div>` : ''}
                    <div class="report-actions">
                        <button class="btn danger small" data-feedback-id="${itemId}" data-feedback-source="${source}">Delete Feedback</button>
                    </div>
                </div>
            `;
        }).join('');

        list.querySelectorAll('button[data-feedback-id]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-feedback-id');
                const source = btn.getAttribute('data-feedback-source') || 'local';
                if (!confirm('Delete this feedback item?')) return;
                await this.deleteFeedback(id, source);
                const refreshed = await this.fetchFeedback();
                this.renderFeedback(refreshed);
            });
        });
    },

    async deleteFeedback(id, source) {
        if (source === 'firebase' && FirebaseStore.enabled && FirebaseStore.db) {
            try {
                await FirebaseStore.db.collection(FEEDBACK_COLLECTION).doc(String(id)).delete();
                return;
            } catch {
                // Fall back to local if needed.
            }
        }

        const feedback = Utils.readJson(APP_KEYS.FEEDBACK, []);
        const updated = feedback.filter((item) => String(item.id) !== String(id));
        localStorage.setItem(APP_KEYS.FEEDBACK, JSON.stringify(updated));
    },

    async clearFeedback() {
        if (FirebaseStore.enabled && FirebaseStore.db) {
            try {
                const snapshot = await FirebaseStore.db
                    .collection(FEEDBACK_COLLECTION)
                    .orderBy('createdAtMs', 'desc')
                    .limit(FEEDBACK_LIMIT)
                    .get();
                if (snapshot.empty) return;
                const batch = FirebaseStore.db.batch();
                snapshot.docs.forEach((doc) => batch.delete(doc.ref));
                await batch.commit();
                return;
            } catch {
                // Fall back to local if needed.
            }
        }

        localStorage.setItem(APP_KEYS.FEEDBACK, JSON.stringify([]));
    },

    async init() {
        const list = document.getElementById('feedback-list');
        if (!list) return;

        const clearBtn = document.getElementById('clear-feedback-btn');
        const empty = document.getElementById('feedback-empty');
        if (!AdminAccess.ensure(list, empty, clearBtn)) return;

        const items = await this.fetchFeedback();
        this.renderFeedback(items);

        clearBtn?.addEventListener('click', async () => {
            if (!confirm('Clear all feedback?')) return;
            await this.clearFeedback();
            const refreshed = await this.fetchFeedback();
            this.renderFeedback(refreshed);
        });
    }
};

const StatsManager = {
    async init() {
        const jobsEl = document.getElementById('stat-jobs-posted');
        const freelancersEl = document.getElementById('stat-freelancers-active');
        const categoriesEl = document.getElementById('stat-categories');

        if (!jobsEl || !freelancersEl || !categoriesEl) return;

        const jobs = await Storage.getAllJobsAsync();
        const users = Storage.getUsers();

        const categories = new Set(
            jobs
                .map((job) => String(job.category || '').trim())
                .filter(Boolean)
        );

        // Active freelancers = unique registered users + unique poster identities from posted jobs.
        const freelancers = new Set();
        users.forEach((user) => {
            if (user?.id) freelancers.add(`id:${user.id}`);
            else if (user?.email) freelancers.add(`email:${String(user.email).toLowerCase()}`);
        });
        jobs.forEach((job) => {
            if (job?.posterId) freelancers.add(`id:${job.posterId}`);
            else if (job?.postedBy) freelancers.add(`email:${String(job.postedBy).toLowerCase()}`);
            else if (job?.postedByName) freelancers.add(`name:${String(job.postedByName).toLowerCase()}`);
        });

        jobsEl.textContent = String(jobs.length);
        freelancersEl.textContent = String(freelancers.size);
        categoriesEl.textContent = String(categories.size);
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    LayoutManager.ensureNavRight();
    await FirebaseStore.init();
    await FirebaseAuthLoader.load();
    LanguageManager.init();
    ThemeManager.init();
    AuthManager.init();
    await StatsManager.init();
    await SearchEngine.init();
    FormHandler.init();
    FeedbackHandler.init();
    NewsletterHandler.init();
    JobSeekerHandler.init();
    ReportsManager.init();
    FeedbackAdminManager.init();

    const allJobs = await Storage.getAllJobsAsync();
    // Avoid overriding the filtered results on pages where search/filter controls exist.
    const hasJobsFilters = Boolean(
        document.getElementById('jobs-search')
        || document.getElementById('category-filter')
        || document.getElementById('sort-filter')
    );

    if (!hasJobsFilters) {
        Renderer.renderList('jobs-list', allJobs);
        Renderer.renderList('featured-list', allJobs.slice(0, 3));
    }
});
