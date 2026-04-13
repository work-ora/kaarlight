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

const R2Uploader = {
    getConfig() {
        return window.R2_UPLOAD_CONFIG || {};
    },

    isPlaceholder(value) {
        const normalized = String(value || '').trim().toUpperCase();
        return !normalized || normalized.includes('YOUR_') || normalized.includes('PLACEHOLDER');
    },

    isConfigured() {
        const config = this.getConfig();
        return Boolean(
            config.workerUrl
            && config.publicBaseUrl
            && !this.isPlaceholder(config.workerUrl)
            && !this.isPlaceholder(config.publicBaseUrl)
        );
    },

    getSetupError() {
        const config = this.getConfig();
        if (this.isConfigured()) return '';
        if (this.isPlaceholder(config.workerUrl) || this.isPlaceholder(config.publicBaseUrl)) {
            return 'R2 is not configured yet. Update r2-config.js with your Worker URL and public bucket URL.';
        }
        return 'R2 is not configured.';
    },

    buildPath(config, extraFolder) {
        const baseFolder = String(config.basePath || '').trim().replace(/^\/+|\/+$/g, '');
        const childFolder = String(extraFolder || '').trim().replace(/^\/+|\/+$/g, '');
        return [baseFolder, childFolder].filter(Boolean).join('/');
    },

    sanitizeFileName(name) {
        return String(name || 'upload')
            .replace(/[^a-zA-Z0-9._-]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 80) || 'upload';
    },

    async uploadFile(file, options = {}) {
        const config = this.getConfig();
        if (!this.isConfigured()) {
            throw new Error(this.getSetupError());
        }

        // Validate file with Utils methods
        const validation = Utils.validateFileUpload(file);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        const maxSizeBytes = Number(config.maxFileSizeMb || 2) * 1024 * 1024;
        if (file?.size > maxSizeBytes) {
            throw new Error(`File must be ${config.maxFileSizeMb || 2}MB or smaller.`);
        }

        const folder = this.buildPath(config, options.folder);
        const safeName = this.sanitizeFileName(file?.name);
        const objectKey = [folder, `${Date.now()}-${safeName}`].filter(Boolean).join('/');
        
        // Sanitize content type
        const contentType = String(file?.type || 'application/octet-stream').replace(/[^\w\-./+]/g, '');
        
        const response = await fetch(String(config.workerUrl).trim(), {
            method: 'POST',
            body: file,
            headers: {
                'Content-Type': contentType,
                'X-File-Key': objectKey,
                'X-File-Name': safeName,
                'X-File-Type': contentType,
                'X-Upload-Tags': Array.isArray(options.tags) ? options.tags.join(',') : ''
            }
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            const errorMessage = payload?.error || payload?.message || 'R2 upload failed.';
            throw new Error(errorMessage);
        }

        const publicBaseUrl = String(config.publicBaseUrl || '').trim().replace(/\/+$/g, '');
        const publicUrl = payload?.url || (publicBaseUrl ? `${publicBaseUrl}/${objectKey}` : '');
        const resourceType = options.resourceType
            || (file?.type?.startsWith('video/') ? 'video' : 'image');

        return {
            url: publicUrl,
            resourceType,
            publicId: payload?.key || objectKey,
            format: file?.type || '',
            bytes: payload?.size || file?.size || 0
        };
    }
};

window.R2Uploader = R2Uploader;

const CloudinaryUploader = {
    getConfig() {
        return window.CLOUDINARY_CONFIG || {};
    },

    isPlaceholder(value) {
        const normalized = String(value || '').trim().toUpperCase();
        return !normalized || normalized.includes('UNSIGNED') || normalized.includes('PLACEHOLDER');
    },

    isConfigured() {
        const config = this.getConfig();
        return Boolean(
            config.cloudName
            && config.uploadPreset
            && !this.isPlaceholder(config.cloudName)
            && !this.isPlaceholder(config.uploadPreset)
        );
    },

    getSetupError() {
        const config = this.getConfig();
        if (this.isConfigured()) return '';
        return 'Cloudinary is not configured yet. Update cloudinary-config.js with your Cloud Name and Upload Preset.';
    },

    sanitizeFileName(name) {
        return String(name || 'upload')
            .replace(/[^a-zA-Z0-9._-]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 80) || 'upload';
    },

    async uploadFile(file, options = {}, onProgress) {
        const config = this.getConfig();
        if (!this.isConfigured()) {
            throw new Error(this.getSetupError());
        }

        // Validate
        const validation = Utils.validateFileUpload(file);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        const maxSizeBytes = Number(config.maxFileSizeMb || 5) * 1024 * 1024;
        if (file?.size > maxSizeBytes) {
            throw new Error(`File must be ${config.maxFileSizeMb || 5}MB or smaller (current: ${(file.size / 1024 / 1024).toFixed(1)}MB)`);
        }

        const folder = String(options.folder || 'afgjobs').trim().replace(/^\/+|\/+$/g, '');
        const tags = Array.isArray(options.tags) ? options.tags : [];

        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', String(config.uploadPreset).trim());
        formData.append('folder', folder);
        if (tags.length > 0) formData.append('tags', tags.join(','));

        const uploadUrl = `${config.apiBase}/${config.cloudName}/auto/upload`;

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.timeout = 120000;

            // Progress
            xhr.upload.addEventListener('loadstart', () => {
                if (!onProgress) return;
                onProgress({ percent: 1, loaded: 0, total: 0, lengthComputable: false });
            });

            xhr.upload.addEventListener('progress', (event) => {
                if (!onProgress) return;
                const loaded = event.loaded || 0;
                const total = event.total || 0;
                    const percent = event.lengthComputable
                        ? Math.round((loaded / total) * 100)
                        : Math.max(12, Math.min(90, 10 + Math.round(loaded / 1024 / 2)));
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const payload = JSON.parse(xhr.responseText);
                        const resourceType = options.resourceType || payload?.resource_type || (file?.type?.startsWith('video/') ? 'video' : 'image');
                        resolve({
                            url: payload?.secure_url || payload?.url || '',
                            resourceType,
                            publicId: payload?.public_id || `${folder}/${this.sanitizeFileName(file?.name)}`,
                            format: payload?.format || file?.type || '',
                            bytes: payload?.bytes || file?.size || 0
                        });
                    } catch {
                        reject(new Error('Invalid response from Cloudinary'));
                    }
                } else {
                    let errorMsg = 'Cloudinary upload failed';
                    try {
                        const payload = JSON.parse(xhr.responseText);
                        errorMsg = payload?.error?.message || payload?.error?.http_code || payload?.error || errorMsg;
                        if (payload?.bytes && payload?.max_bytes && payload.bytes > payload.max_bytes) {
                            errorMsg = `File too large (${(payload.bytes/1024/1024).toFixed(1)}MB > ${payload.max_bytes/1024/1024}MB quota)`;
                        }
                    } catch {}
                    reject(new Error(errorMsg));
                }
            });

            xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
            xhr.addEventListener('timeout', () => reject(new Error('Upload timed out after 120 seconds')));
            xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));
            xhr.open('POST', uploadUrl);
            xhr.send(formData);
        });
    }
};

window.CloudinaryUploader = CloudinaryUploader;

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

    getJobTimestamp(job) {
        const createdAtMs = Number(job?.createdAtMs);
        if (Number.isFinite(createdAtMs) && createdAtMs > 0) {
            return createdAtMs;
        }

        const parsedCreatedAt = Date.parse(String(job?.createdAt || ''));
        return Number.isFinite(parsedCreatedAt) ? parsedCreatedAt : 0;
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
    },

    /** Enhanced security validations */
    sanitizeText(value, maxLength = 500) {
        if (typeof value !== 'string') return '';
        return value
            .trim()
            .slice(0, maxLength)
            .replace(/[\x00-\x1F\x7F]/g, ''); // Remove control characters
    },

    validateJobTitle(title) {
        const sanitized = this.sanitizeText(title, 100);
        if (sanitized.length < 5 || sanitized.length > 100) return { valid: false, error: 'Title must be 5-100 characters.' };
        if (!/^[a-zA-Z0-9\s\-().,&\u0600-\u06FF]+$/.test(sanitized)) return { valid: false, error: 'Title contains invalid characters.' };
        return { valid: true, value: sanitized };
    },

    validateDescription(desc) {
        const sanitized = this.sanitizeText(desc, 1000);
        if (sanitized.length < 20 || sanitized.length > 1000) return { valid: false, error: 'Description must be 20-1000 characters.' };
        return { valid: true, value: sanitized };
    },

    validatePrice(price) {
        const num = Number(price);
        if (!Number.isFinite(num) || num < 0 || num > 999999999) return { valid: false, error: 'Price must be a valid number between 0 and 999,999,999.' };
        return { valid: true, value: num };
    },

    validateLocation(location) {
        const sanitized = this.sanitizeText(location, 100);
        if (sanitized.length < 2 || sanitized.length > 100) return { valid: false, error: 'Location must be 2-100 characters.' };
        return { valid: true, value: sanitized };
    },

    validateContactInfo(contact) {
        const sanitized = this.sanitizeText(contact, 150);
        if (!this.isEmail(sanitized) && !this.isPhone(sanitized)) return { valid: false, error: 'Contact must be a valid email or phone number.' };
        return { valid: true, value: sanitized };
    },

    validateFileUpload(file) {
        if (!file) return { valid: false, error: 'No file selected.' };
        const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm'];
        if (!allowedMimes.includes(file.type)) return { valid: false, error: 'File type not allowed. Use JPG, PNG, GIF, WebP, or MP4.' };
        const maxSize = 2 * 1024 * 1024; // 2MB
        if (file.size > maxSize) return { valid: false, error: 'File exceeds 2MB limit.' };
        return { valid: true, value: file };
    },

    stripDangerousAttributes(html) {
        // Remove event handlers and dangerous attributes
        return String(html || '')
            .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '') // Remove onEvent="..." attributes
            .replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '') // Remove onEvent=value attributes
            .replace(/\s*javascript:/gi, ''); // Remove javascript: protocol
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

                    return Array.from(byId.values()).sort((a, b) => this.sortJobsByNewest(a, b));
                }
            } catch {
                // Fall back to local storage below.
            }
        }

        return localJobs;
    },

    sortJobsByNewest(a, b) {
        return Utils.getJobTimestamp(b) - Utils.getJobTimestamp(a);
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
        if (!Utils.isAdmin(user) && !Utils.isJobOwner(target, user)) return { ok: false, reason: 'not-owner' };

        const updated = jobs.filter((job) => String(job.id) !== String(jobId));
        localStorage.setItem(APP_KEYS.JOBS, JSON.stringify(updated));
        return { ok: true };
    },

    async deleteJobByIdAsync(jobId, user) {
        if (FirebaseStore.enabled && FirebaseStore.db) {
            try {
                await FirebaseAuthLoader.load();
                await FirebaseAuthState.wait();
                const docRef = FirebaseStore.db.collection('jobs').doc(String(jobId));
                const snapshot = await docRef.get();
                if (!snapshot.exists) return { ok: false, reason: 'not-found' };
                const data = snapshot.data();
                const fbUser = window.firebase?.auth ? window.firebase.auth().currentUser : null;
                const authUser = fbUser ? { id: fbUser.uid, email: fbUser.email || '' } : user;
                const isAdmin = Utils.isAdmin(user) || Utils.isAdmin(authUser);
                if (!fbUser && !isAdmin) return { ok: false, reason: 'auth-required' };
                if (!isAdmin && !Utils.isJobOwner(data, authUser)) return { ok: false, reason: 'not-owner' };
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
        const currentUser = Storage.getCurrentUser();
        const isOwner = Utils.isJobOwner(job, currentUser);
        const ownerBadge = isOwner ? `<span class="badge owner-badge">${LanguageManager.t('job_owner_badge')}</span>` : '';
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
            <a href="job-detail.html?id=${encodeURIComponent(String(job.id ?? ''))}" style="text-decoration: none; color: inherit; display: block;">
                <article class="card job-card" style="cursor: pointer; transition: all 0.3s ease;">
                    ${mediaHtml}
                    <div class="card-body">
                        <div class="badge-row">
                            <span class="badge">${category}</span>
                            ${ownerBadge}
                        </div>
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
            const rawQuery = String(searchInput?.value || '').trim();
            const query = rawQuery.toLowerCase();
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

                return Storage.sortJobsByNewest(a, b);
            });

            Renderer.renderList('jobs-list', filtered);
            Renderer.renderList('featured-list', filtered.slice(0, 3));

            Storage.saveSettings({
                ...Storage.getSettings(),
                jobSearch: rawQuery,
                jobCategory: category,
                jobSort: sortBy
            });

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
            // Sanitize URL parameter to prevent XSS
            const sanitized = Utils.sanitizeText(queryFromUrl, 100);
            searchInput.value = sanitized;
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

const TopButton = {
    init() {
        const button = document.getElementById('jump-to-top');
        if (!button) return;

        const toggleVisibility = () => {
            if (window.scrollY > 300) {
                button.classList.add('show');
            } else {
                button.classList.remove('show');
            }
        };

        button.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            button.blur();
        });

        window.addEventListener('scroll', toggleVisibility, { passive: true });
        toggleVisibility();
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
    },

    ensureMobileMenu() {
        const header = document.querySelector('.site-header');
        const navRow = document.querySelector('.nav-row');
        if (!header || !navRow) return;

        let menuToggle = navRow.querySelector('.mobile-menu-toggle');
        if (!menuToggle) {
            menuToggle = document.createElement('button');
            menuToggle.type = 'button';
            menuToggle.className = 'mobile-menu-toggle';
            menuToggle.setAttribute('aria-label', 'Open navigation menu');
            menuToggle.setAttribute('aria-expanded', 'false');
            menuToggle.innerHTML = [
                '<span class="mobile-menu-toggle-inner" aria-hidden="true">',
                '<span class="mobile-menu-toggle-line"></span>',
                '<span class="mobile-menu-toggle-line"></span>',
                '<span class="mobile-menu-toggle-line"></span>',
                '</span>'
            ].join('');
            navRow.insertBefore(menuToggle, navRow.firstChild);
        }

        if (menuToggle.dataset.bound === 'true') return;
        menuToggle.dataset.bound = 'true';

        const closeMenu = () => {
            header.classList.remove('menu-open');
            menuToggle.setAttribute('aria-expanded', 'false');
            menuToggle.setAttribute('aria-label', 'Open navigation menu');
        };

        menuToggle.addEventListener('click', (event) => {
            event.stopPropagation();
            const isOpen = header.classList.toggle('menu-open');
            menuToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            menuToggle.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
        });

        navRow.querySelectorAll('a').forEach((link) => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 768) closeMenu();
            });
        });

        document.addEventListener('click', (event) => {
            if (window.innerWidth > 768) return;
            if (!header.classList.contains('menu-open')) return;
            if (!header.contains(event.target)) closeMenu();
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeMenu();
        });

        window.addEventListener('resize', () => {
            if (window.innerWidth > 768) closeMenu();
        });
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
            job_owner_badge: 'Your Job',
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
            jobs_found_count: '{count} jobs found',
            footer_tagline: 'Helping Afghans find local work',
            footer_faq: 'FAQ',
            footer_privacy: 'Privacy',
            footer_terms: 'Terms',
            footer_copyright: '© 2026 AfgJobs - Built for Afghanistan',
            about_title: 'About AfgJobs',
            about_lead: 'Connecting Afghan talent with local opportunities, one job at a time.',
            about_mission_title: 'Our Mission',
            about_mission_body: 'AfgJobs is a simple, fast platform designed to connect Afghan freelancers, businesses, and individuals with local job opportunities. We believe in making work accessible - whether you are a small business looking to hire, a freelancer searching for your next project, or someone offering services in your community.',
            about_why_title: 'Why AfgJobs?',
            about_why_item1_title: 'Quick Sign-In:',
            about_why_item1_text: 'Create an account in under a minute to post and manage jobs easily.',
            about_why_item2_title: 'Local Focus:',
            about_why_item2_text: 'Browse opportunities across Afghan cities and connect with people in your area.',
            about_why_item3_title: 'Direct Contact:',
            about_why_item3_text: 'Reach freelancers and employers directly via phone or email - no middleman.',
            about_why_item4_title: 'Fair Pricing:',
            about_why_item4_text: 'You set your own rates with no hidden fees.',
            about_why_item5_title: 'Safe and Transparent:',
            about_why_item5_text: 'Build trust through direct communication and clear contact details.',
            about_what_title: 'What You Can Do',
            about_seekers_title: 'Job Seekers',
            about_seekers_text: 'Explore freelance, short-term, and full-time opportunities across Afghanistan. Filter by category, location, and budget.',
            about_employers_title: 'Employers',
            about_employers_text: 'Post a job in 2 minutes. Set your budget, describe the work, and connect with qualified professionals.',
            about_freelancers_title: 'Freelancers',
            about_freelancers_text: 'Showcase your skills and portfolio. Build your reputation by accepting gigs and delivering quality work.',
            about_values_title: 'Our Values',
            about_value_fair_title: 'Fairness',
            about_value_fair_text: 'We believe in fair pricing and transparent communication between all parties.',
            about_value_speed_title: 'Speed',
            about_value_speed_text: 'Remove barriers. Posting and hiring should be fast and hassle-free.',
            about_value_local_title: 'Local Impact',
            about_value_local_text: 'We support Afghan communities by helping locals find work within Afghanistan.',
            about_value_trust_title: 'Trust',
            about_value_trust_text: 'Direct relationships build trust. We keep your information private and secure.',
            about_start_title: 'Get Started',
            about_start_text: 'Ready to find work or hire local talent?',
            about_cta_browse: 'Browse Jobs',
            about_cta_post: 'Post a Job',
            about_questions_title: 'Questions or Feedback?',
            about_questions_text: 'We would love to hear from you. Share suggestions to improve AfgJobs.',
            about_feedback_name_placeholder: 'Your name (optional)',
            about_feedback_email_placeholder: 'Your email (optional - only if you want a reply)',
            about_feedback_message_placeholder: 'Your feedback or question...',
            about_feedback_send: 'Send Message',
            contact_title: 'Contact AfgJobs',
            contact_lead: 'Need help, want to report an issue, or have a suggestion? Reach us here.',
            contact_email_title: 'Email Support',
            contact_email_text: 'For account, posting, or technical questions.',
            contact_business_title: 'Business Inquiries',
            contact_business_text: 'Partnerships, hiring campaigns, and media requests.',
            contact_response_title: 'Response Time',
            contact_response_text: 'We usually reply within 24-48 hours on working days.',
            contact_send_title: 'Send a Message',
            contact_feedback_name_placeholder: 'Your name (optional)',
            contact_feedback_email_placeholder: 'Your email (optional)',
            contact_feedback_message_placeholder: 'Tell us how we can help...',
            contact_feedback_send: 'Send Message',
            faq_title: 'Frequently Asked Questions',
            faq_lead: 'Quick answers about accounts, job posting, safety, and site usage.',
            faq_q1: 'Do I need an account to browse jobs?',
            faq_a1: 'No. You can browse public job listings without creating an account.',
            faq_q2: 'Do I need an account to post a job?',
            faq_a2: 'Yes. You need to sign in first to create and manage job postings.',
            faq_q3: 'How do I post a good job listing?',
            faq_a3: 'Use a clear title, explain tasks in detail, include budget and timeline, and provide reliable contact information.',
            faq_q4: 'Can I post remote or online work?',
            faq_a4: 'Yes. Mark the listing as online and include a valid sample or reference link when requested.',
            faq_q5: 'How can I edit or remove my job post?',
            faq_a5: 'Sign in and use your profile page to manage jobs posted from your account.',
            faq_q6: 'How are jobs sorted?',
            faq_a6: 'Jobs can be sorted by newest, budget high-to-low, or budget low-to-high using filters on the Jobs page.',
            faq_q7: 'Is my data shared publicly?',
            faq_a7: 'Only details you place in public listings are visible to other users. Review Privacy Policy for full details.',
            faq_q8: 'What should I do if I find suspicious content?',
            faq_a8: 'Do not engage. Capture the listing details and report it through the Contact page.',
            faq_q9: 'Why do I not see my jobs on another device?',
            faq_a9: 'The current version stores most data in local browser storage, so data may not sync across devices.',
            faq_q10: 'How can I contact support?',
            faq_a10: 'Use the Contact page to send your message and include as much detail as possible.',
            faq_action_contact: 'Contact Support',
            faq_action_browse: 'Browse Jobs',
            faq_action_privacy: 'Privacy Policy',
            faq_action_terms: 'Terms of Service',
            privacy_title: 'Privacy Policy',
            privacy_updated: 'Last updated: February 12, 2026',
            privacy_intro: 'This Privacy Policy explains how AfgJobs collects, uses, and stores information when you use this website.',
            privacy_info_title: '1. Information We Collect',
            privacy_info_item1: 'Account information you enter, such as full name, email, phone, and password.',
            privacy_info_item2: 'Job post details you submit, such as title, description, category, location, budget, contact, and optional media.',
            privacy_info_item3: 'Feedback and newsletter email entries you submit through forms.',
            privacy_info_item4: 'Basic usage preferences, such as selected theme mode.',
            privacy_use_title: '2. How We Use Information',
            privacy_use_item1: 'To show your account status and support sign-in features.',
            privacy_use_item2: 'To display posted jobs and related details.',
            privacy_use_item3: 'To store feedback and newsletter subscriptions.',
            privacy_use_item4: 'To improve site usability and user experience.',
            privacy_storage_title: '3. Data Storage',
            privacy_storage_body: 'In the current version of this site, form data and account data are stored in your browser local storage on your own device. This means data is not synced across devices by default.',
            privacy_sharing_title: '4. Data Sharing',
            privacy_sharing_body: 'AfgJobs does not sell personal data. We only show data you choose to publish in job posts (such as contact details).',
            privacy_security_title: '5. Security Notice',
            privacy_security_body: 'No browser-based system is fully secure. Avoid entering highly sensitive personal information in public fields.',
            privacy_choices_title: '6. Your Choices',
            privacy_choices_item1: 'You can update or remove job posts and profile data from your device.',
            privacy_choices_item2: 'You can clear browser local storage to remove locally stored site data.',
            privacy_choices_item3: 'You can contact us to request clarification about this policy.',
            privacy_changes_title: '7. Changes to This Policy',
            privacy_changes_body: 'We may update this Privacy Policy as the platform evolves. Material changes should be reflected by updating the date at the top of this page.',
            privacy_contact_title: '8. Contact',
            privacy_contact_body: 'For privacy-related questions, use the contact page.',
            privacy_action_contact: 'Contact Us',
            privacy_action_home: 'Back to Home',
            terms_title: 'Terms of Service',
            terms_updated: 'Last updated: February 12, 2026',
            terms_intro: 'By accessing or using AfgJobs, you agree to these Terms of Service. If you do not agree, do not use the site.',
            terms_use_title: '1. Use of the Platform',
            terms_use_item1: 'You may use AfgJobs to browse jobs, post opportunities, and manage your profile.',
            terms_use_item2: 'You agree to use the platform only for lawful purposes.',
            terms_use_item3: 'You are responsible for information you submit.',
            terms_accounts_title: '2. Accounts',
            terms_accounts_item1: 'You are responsible for maintaining the confidentiality of your account details.',
            terms_accounts_item2: 'You must provide accurate and current information.',
            terms_accounts_item3: 'You are responsible for activity performed under your account on your device.',
            terms_content_title: '3. Job Posts and User Content',
            terms_content_item1: 'You must not post false, misleading, abusive, or illegal content.',
            terms_content_item2: 'You must not post content that infringes rights of others.',
            terms_content_item3: 'You are responsible for contact details and terms included in your listing.',
            terms_prohibited_title: '4. Prohibited Activities',
            terms_prohibited_item1: 'Impersonation, fraud, harassment, or spam.',
            terms_prohibited_item2: 'Attempting to disrupt, damage, or misuse the website.',
            terms_prohibited_item3: 'Uploading malicious code or harmful files.',
            terms_disclaimer_title: '5. Disclaimer',
            terms_disclaimer_body: 'AfgJobs is a listing platform. We do not guarantee job quality, employer behavior, freelancer performance, or payment outcomes between users.',
            terms_liability_title: '6. Limitation of Liability',
            terms_liability_body: 'To the maximum extent allowed by law, AfgJobs is not liable for indirect or consequential losses resulting from use of the platform.',
            terms_termination_title: '7. Suspension or Termination',
            terms_termination_body: 'We may remove content or restrict access if we believe these terms are violated or if required for safety and legal compliance.',
            terms_changes_title: '8. Changes to Terms',
            terms_changes_body: 'We may update these terms over time. Continued use after changes means you accept the updated terms.',
            terms_contact_title: '9. Contact',
            terms_contact_body: 'For questions about these terms, use our contact page.',
            terms_action_contact: 'Contact Us',
            terms_action_privacy: 'Privacy Policy',
            admin_reports_title: 'Reported Jobs',
            admin_reports_lead: 'Review reports submitted by users. Reports are stored in Firestore.',
            admin_clear_reports: 'Clear All Reports',
            admin_no_reports_title: 'No reports yet',
            admin_no_reports_body: 'Reports will appear here when users report a job.',
            admin_feedback_title: 'Feedback',
            admin_clear_feedback: 'Clear All Feedback',
            admin_no_feedback_title: 'No feedback yet',
            admin_no_feedback_body: 'Feedback will appear here when users send a message.',
            not_found_title: 'Page not found',
            not_found_body: 'The page you requested is unavailable or may have been moved. Use one of the links below to continue browsing AfgJobs.',
            not_found_home: 'Go to Home',
            not_found_browse: 'Browse Jobs',
            not_found_post: 'Post a Job',
            not_found_about: 'About AfgJobs',
            not_found_contact: 'Contact Support'
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
            job_owner_badge: 'کار شما',
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
            jobs_found_count: '{count} کار پیدا شد',
            footer_tagline: 'کمک به افغان‌ها برای یافتن کار محلی',
            footer_faq: 'پرسش‌های متداول',
            footer_privacy: 'حریم خصوصی',
            footer_terms: 'شرایط استفاده',
            footer_copyright: '© ۲۰۲۶ AfgJobs - ساخته‌شده برای افغانستان',
            about_title: 'درباره AfgJobs',
            about_lead: 'پیوند دادن استعدادهای افغان با فرصت‌های محلی، یک کار در هر زمان.',
            about_mission_title: 'ماموریت ما',
            about_mission_body: 'AfgJobs یک پلتفرم ساده و سریع است که فریلنسرها، کسب‌وکارها و افراد افغان را با فرصت‌های کاری محلی وصل می‌کند. ما باور داریم دسترسی به کار باید آسان باشد؛ چه شما یک کسب‌وکار کوچک برای استخدام باشید، چه فریلنسری که دنبال پروژه بعدی است، یا کسی که خدماتی در جامعه خود ارائه می‌دهد.',
            about_why_title: 'چرا AfgJobs؟',
            about_why_item1_title: 'ورود سریع:',
            about_why_item1_text: 'کمتر از یک دقیقه حساب بسازید و آگهی‌ها را به‌سادگی مدیریت کنید.',
            about_why_item2_title: 'تمرکز محلی:',
            about_why_item2_text: 'فرصت‌ها را در شهرهای افغانستان ببینید و با افراد منطقه خود ارتباط بگیرید.',
            about_why_item3_title: 'تماس مستقیم:',
            about_why_item3_text: 'با فریلنسرها و کارفرماها مستقیم از طریق تلفن یا ایمیل ارتباط بگیرید — بدون واسطه.',
            about_why_item4_title: 'قیمت‌گذاری منصفانه:',
            about_why_item4_text: 'خودتان نرخ را تعیین می‌کنید و هیچ هزینه پنهان وجود ندارد.',
            about_why_item5_title: 'امن و شفاف:',
            about_why_item5_text: 'با ارتباط مستقیم و اطلاعات تماس روشن، اعتماد بسازید.',
            about_what_title: 'چه کارهایی می‌توانید انجام دهید',
            about_seekers_title: 'جویندگان کار',
            about_seekers_text: 'فرصت‌های فریلنس، کوتاه‌مدت و تمام‌وقت را در سراسر افغانستان ببینید. بر اساس دسته‌بندی، موقعیت و بودجه فیلتر کنید.',
            about_employers_title: 'کارفرمایان',
            about_employers_text: 'در ۲ دقیقه آگهی ثبت کنید. بودجه تعیین کنید، کار را توضیح دهید و با افراد متخصص ارتباط بگیرید.',
            about_freelancers_title: 'فریلنسرها',
            about_freelancers_text: 'مهارت‌ها و نمونه‌کار خود را نمایش دهید. با انجام پروژه‌های باکیفیت اعتبار بسازید.',
            about_values_title: 'ارزش‌های ما',
            about_value_fair_title: 'انصاف',
            about_value_fair_text: 'ما به قیمت‌گذاری منصفانه و ارتباط شفاف میان همه طرف‌ها باور داریم.',
            about_value_speed_title: 'سرعت',
            about_value_speed_text: 'موانع را حذف می‌کنیم. ثبت آگهی و استخدام باید سریع و ساده باشد.',
            about_value_local_title: 'اثر محلی',
            about_value_local_text: 'با کمک به یافتن کار در داخل افغانستان از جامعه‌های محلی حمایت می‌کنیم.',
            about_value_trust_title: 'اعتماد',
            about_value_trust_text: 'روابط مستقیم اعتماد می‌سازد. اطلاعات شما را خصوصی و امن نگه می‌داریم.',
            about_start_title: 'شروع کنید',
            about_start_text: 'آماده‌اید کار پیدا کنید یا استعداد محلی استخدام کنید؟',
            about_cta_browse: 'مشاهده کارها',
            about_cta_post: 'ثبت آگهی',
            about_questions_title: 'پرسش یا بازخورد دارید؟',
            about_questions_text: 'خوشحال می‌شویم از شما بشنویم. پیشنهادهای خود را برای بهتر شدن AfgJobs بفرستید.',
            about_feedback_name_placeholder: 'نام شما (اختیاری)',
            about_feedback_email_placeholder: 'ایمیل شما (اختیاری - فقط اگر پاسخ می‌خواهید)',
            about_feedback_message_placeholder: 'بازخورد یا سوال شما...',
            about_feedback_send: 'ارسال پیام',
            contact_title: 'تماس با AfgJobs',
            contact_lead: 'کمک لازم دارید، می‌خواهید مشکلی را گزارش کنید یا پیشنهادی دارید؟ از اینجا با ما در تماس شوید.',
            contact_email_title: 'پشتیبانی ایمیل',
            contact_email_text: 'برای سوال‌های حساب، ثبت آگهی یا مشکلات فنی.',
            contact_business_title: 'درخواست‌های تجاری',
            contact_business_text: 'همکاری‌ها، کمپین‌های استخدام و درخواست‌های رسانه‌ای.',
            contact_response_title: 'زمان پاسخگویی',
            contact_response_text: 'معمولاً در روزهای کاری طی ۲۴ تا ۴۸ ساعت پاسخ می‌دهیم.',
            contact_send_title: 'ارسال پیام',
            contact_feedback_name_placeholder: 'نام شما (اختیاری)',
            contact_feedback_email_placeholder: 'ایمیل شما (اختیاری)',
            contact_feedback_message_placeholder: 'بگویید چگونه می‌توانیم کمک کنیم...',
            contact_feedback_send: 'ارسال پیام',
            faq_title: 'پرسش‌های متداول',
            faq_lead: 'پاسخ‌های سریع درباره حساب، ثبت آگهی، امنیت و استفاده از سایت.',
            faq_q1: 'آیا برای دیدن کارها نیاز به حساب دارم؟',
            faq_a1: 'خیر. می‌توانید آگهی‌های عمومی را بدون ساخت حساب مشاهده کنید.',
            faq_q2: 'آیا برای ثبت آگهی نیاز به حساب دارم؟',
            faq_a2: 'بله. برای ایجاد و مدیریت آگهی باید وارد حساب شوید.',
            faq_q3: 'چطور یک آگهی خوب ثبت کنم؟',
            faq_a3: 'عنوان واضح، توضیحات دقیق، بودجه و زمان‌بندی و اطلاعات تماس معتبر ارائه کنید.',
            faq_q4: 'آیا می‌توانم کار آنلاین یا دورکاری ثبت کنم؟',
            faq_a4: 'بله. آگهی را آنلاین علامت بزنید و در صورت درخواست، نمونه لینک معتبر اضافه کنید.',
            faq_q5: 'چطور آگهی‌ام را ویرایش یا حذف کنم؟',
            faq_a5: 'وارد حساب شوید و از صفحه پروفایل آگهی‌های خود را مدیریت کنید.',
            faq_q6: 'آگهی‌ها چگونه مرتب می‌شوند؟',
            faq_a6: 'از صفحه کارها می‌توانید بر اساس جدیدترین یا بودجه زیاد به کم / کم به زیاد مرتب کنید.',
            faq_q7: 'آیا اطلاعات من عمومی می‌شود؟',
            faq_a7: 'تنها اطلاعاتی که در آگهی عمومی می‌گذارید برای دیگران قابل دیدن است. برای جزئیات سیاست حریم خصوصی را ببینید.',
            faq_q8: 'اگر محتوای مشکوک دیدم چه کنم؟',
            faq_a8: 'درگیر نشوید. جزئیات آگهی را ثبت کنید و از صفحه تماس گزارش دهید.',
            faq_q9: 'چرا آگهی‌های من در دستگاه دیگر دیده نمی‌شود؟',
            faq_a9: 'نسخه فعلی بیشتر داده‌ها را در ذخیره‌سازی مرورگر نگه می‌دارد و ممکن است بین دستگاه‌ها همگام نشود.',
            faq_q10: 'چگونه با پشتیبانی تماس بگیرم؟',
            faq_a10: 'از صفحه تماس پیام خود را ارسال کنید و تا حد امکان جزئیات را بنویسید.',
            faq_action_contact: 'تماس با پشتیبانی',
            faq_action_browse: 'مشاهده کارها',
            faq_action_privacy: 'سیاست حریم خصوصی',
            faq_action_terms: 'شرایط استفاده',
            privacy_title: 'سیاست حریم خصوصی',
            privacy_updated: 'آخرین بروزرسانی: ۱۲ فوریه ۲۰۲۶',
            privacy_intro: 'این سیاست توضیح می‌دهد AfgJobs چگونه اطلاعات را هنگام استفاده از سایت جمع‌آوری، استفاده و ذخیره می‌کند.',
            privacy_info_title: '۱. اطلاعاتی که جمع‌آوری می‌کنیم',
            privacy_info_item1: 'اطلاعات حساب مانند نام کامل، ایمیل، تلفن و رمز عبور که وارد می‌کنید.',
            privacy_info_item2: 'جزئیات آگهی شامل عنوان، توضیحات، دسته‌بندی، موقعیت، بودجه، تماس و رسانه اختیاری.',
            privacy_info_item3: 'بازخورد و ایمیل‌های خبرنامه که از طریق فرم‌ها ارسال می‌کنید.',
            privacy_info_item4: 'ترجیحات ساده استفاده مانند حالت پوسته انتخاب‌شده.',
            privacy_use_title: '۲. چگونه از اطلاعات استفاده می‌کنیم',
            privacy_use_item1: 'برای نمایش وضعیت حساب و پشتیبانی از ورود.',
            privacy_use_item2: 'برای نمایش آگهی‌های ثبت‌شده و جزئیات مرتبط.',
            privacy_use_item3: 'برای ذخیره بازخورد و عضویت خبرنامه.',
            privacy_use_item4: 'برای بهبود تجربه و کارایی سایت.',
            privacy_storage_title: '۳. ذخیره‌سازی داده',
            privacy_storage_body: 'در نسخه فعلی، داده‌های فرم و حساب در ذخیره‌سازی مرورگر شما روی همان دستگاه نگهداری می‌شود؛ بنابراین به‌صورت پیش‌فرض بین دستگاه‌ها همگام نیست.',
            privacy_sharing_title: '۴. اشتراک‌گذاری داده',
            privacy_sharing_body: 'AfgJobs داده شخصی را نمی‌فروشد. فقط اطلاعاتی را نشان می‌دهیم که خودتان در آگهی عمومی منتشر می‌کنید (مانند اطلاعات تماس).',
            privacy_security_title: '۵. اطلاعیه امنیتی',
            privacy_security_body: 'هیچ سیستم مبتنی بر مرورگر کاملاً امن نیست. از وارد کردن اطلاعات بسیار حساس در بخش‌های عمومی خودداری کنید.',
            privacy_choices_title: '۶. انتخاب‌های شما',
            privacy_choices_item1: 'می‌توانید آگهی‌ها و اطلاعات پروفایل را از دستگاه خود به‌روزرسانی یا حذف کنید.',
            privacy_choices_item2: 'می‌توانید ذخیره‌سازی محلی مرورگر را پاک کنید تا داده‌های ذخیره‌شده حذف شوند.',
            privacy_choices_item3: 'می‌توانید برای توضیح بیشتر درباره این سیاست با ما تماس بگیرید.',
            privacy_changes_title: '۷. تغییرات این سیاست',
            privacy_changes_body: 'ممکن است این سیاست را هم‌زمان با توسعه پلتفرم به‌روزرسانی کنیم. تغییرات مهم با به‌روزرسانی تاریخ بالای صفحه مشخص می‌شود.',
            privacy_contact_title: '۸. تماس',
            privacy_contact_body: 'برای سوالات مربوط به حریم خصوصی از صفحه تماس استفاده کنید.',
            privacy_action_contact: 'تماس با ما',
            privacy_action_home: 'بازگشت به خانه',
            terms_title: 'شرایط استفاده',
            terms_updated: 'آخرین بروزرسانی: ۱۲ فوریه ۲۰۲۶',
            terms_intro: 'با دسترسی یا استفاده از AfgJobs، شما این شرایط را می‌پذیرید. اگر موافق نیستید، از سایت استفاده نکنید.',
            terms_use_title: '۱. استفاده از پلتفرم',
            terms_use_item1: 'می‌توانید از AfgJobs برای دیدن کارها، ثبت فرصت‌ها و مدیریت پروفایل استفاده کنید.',
            terms_use_item2: 'متعهد می‌شوید فقط برای اهداف قانونی از پلتفرم استفاده کنید.',
            terms_use_item3: 'مسئول اطلاعاتی هستید که ارسال می‌کنید.',
            terms_accounts_title: '۲. حساب‌ها',
            terms_accounts_item1: 'مسئول حفظ محرمانگی اطلاعات حساب خود هستید.',
            terms_accounts_item2: 'باید اطلاعات دقیق و به‌روز ارائه کنید.',
            terms_accounts_item3: 'مسئول فعالیت‌های انجام‌شده تحت حساب خود در دستگاه‌تان هستید.',
            terms_content_title: '۳. آگهی‌ها و محتوای کاربران',
            terms_content_item1: 'نباید محتوای نادرست، گمراه‌کننده، توهین‌آمیز یا غیرقانونی منتشر کنید.',
            terms_content_item2: 'نباید محتوایی منتشر کنید که حقوق دیگران را نقض کند.',
            terms_content_item3: 'مسئول اطلاعات تماس و شرایط درج‌شده در آگهی خود هستید.',
            terms_prohibited_title: '۴. فعالیت‌های ممنوع',
            terms_prohibited_item1: 'جعل هویت، کلاه‌برداری، آزار یا هرزنامه.',
            terms_prohibited_item2: 'تلاش برای اخلال، آسیب یا سوءاستفاده از وب‌سایت.',
            terms_prohibited_item3: 'آپلود کد مخرب یا فایل‌های زیان‌آور.',
            terms_disclaimer_title: '۵. سلب مسئولیت',
            terms_disclaimer_body: 'AfgJobs یک پلتفرم آگهی است. ما کیفیت کار، رفتار کارفرما، عملکرد فریلنسر یا نتایج پرداخت بین کاربران را تضمین نمی‌کنیم.',
            terms_liability_title: '۶. محدودیت مسئولیت',
            terms_liability_body: 'تا حدی که قانون اجازه دهد، AfgJobs در برابر خسارت‌های غیرمستقیم یا تبعی ناشی از استفاده از پلتفرم مسئول نیست.',
            terms_termination_title: '۷. تعلیق یا خاتمه',
            terms_termination_body: 'اگر فکر کنیم این شرایط نقض شده یا برای امنیت و رعایت قانون لازم باشد، ممکن است محتوا را حذف یا دسترسی را محدود کنیم.',
            terms_changes_title: '۸. تغییرات شرایط',
            terms_changes_body: 'ممکن است این شرایط را در طول زمان به‌روزرسانی کنیم. استفاده ادامه‌دار به معنی پذیرش شرایط جدید است.',
            terms_contact_title: '۹. تماس',
            terms_contact_body: 'برای سوالات درباره این شرایط، از صفحه تماس استفاده کنید.',
            terms_action_contact: 'تماس با ما',
            terms_action_privacy: 'سیاست حریم خصوصی',
            admin_reports_title: 'آگهی‌های گزارش‌شده',
            admin_reports_lead: 'گزارش‌های ارسال‌شده توسط کاربران را مرور کنید. گزارش‌ها در Firestore ذخیره می‌شوند.',
            admin_clear_reports: 'پاک کردن همه گزارش‌ها',
            admin_no_reports_title: 'هنوز گزارشی نیست',
            admin_no_reports_body: 'وقتی کاربران آگهی را گزارش کنند، اینجا نمایش داده می‌شود.',
            admin_feedback_title: 'بازخوردها',
            admin_clear_feedback: 'پاک کردن همه بازخوردها',
            admin_no_feedback_title: 'هنوز بازخوردی نیست',
            admin_no_feedback_body: 'وقتی کاربران پیام ارسال کنند، بازخوردها اینجا نمایش داده می‌شود.',
            not_found_title: 'صفحه پیدا نشد',
            not_found_body: 'صفحه‌ای که درخواست کردید در دسترس نیست یا ممکن است منتقل شده باشد. از لینک‌های زیر برای ادامه استفاده کنید.',
            not_found_home: 'رفتن به خانه',
            not_found_browse: 'مشاهده کارها',
            not_found_post: 'ثبت آگهی',
            not_found_about: 'درباره AfgJobs',
            not_found_contact: 'تماس با پشتیبانی'
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

        const footerTagline = document.querySelector('.footer-tagline');
        if (footerTagline) footerTagline.textContent = this.t('footer_tagline');

        const footerLinks = document.querySelectorAll('.footer-links a');
        footerLinks.forEach((link) => {
            const href = link.getAttribute('href');
            const keyMap = {
                'faq.html': 'footer_faq',
                'privacy.html': 'footer_privacy',
                'terms.html': 'footer_terms'
            };
            const key = keyMap[href || ''];
            if (key) link.textContent = this.t(key);
        });

        const footerCopyright = document.querySelector('.footer-copyright');
        if (footerCopyright) footerCopyright.textContent = this.t('footer_copyright');

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
        const mobileWelcome = document.getElementById('mobile-welcome');
        const currentUser = Storage.getCurrentUser();
        if (userDisplay && currentUser) {
            userDisplay.textContent = this.formatWelcome(currentUser.fullname || 'User');
        }
        if (mobileWelcome) {
            mobileWelcome.textContent = currentUser
                ? this.formatWelcome(currentUser.fullname || 'User')
                : this.t('welcome_prefix') + ' User';
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
        const mobileAccountLink = document.getElementById('mobile-account-link');
        const mobileWelcome = document.getElementById('mobile-welcome');
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
            if (mobileAccountLink) mobileAccountLink.href = 'auth.html';
            if (mobileWelcome) mobileWelcome.textContent = LanguageManager.t('welcome_prefix') + ' User';
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
            if (mobileAccountLink) mobileAccountLink.href = 'profile.html';
            if (mobileWelcome) mobileWelcome.textContent = LanguageManager.formatWelcome(user.fullname || 'User');
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

            const submitBtn = document.getElementById('submit-btn');
            const originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Processing...';

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

            // Validation (existing)
            if (!title || !category || !description || !location || !contact || !posterType) {
                alert(LanguageManager.t('alert_required_fields'));
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
                return;
            }
            if (!Number.isFinite(price) || price < 0) {
                alert(LanguageManager.t('alert_invalid_price'));
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
                return;
            }
            if (description.length < 20) {
                alert(LanguageManager.t('alert_description_short'));
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
                return;
            }
            if (!Utils.isEmail(contact) && !Utils.isPhone(contact)) {
                alert(LanguageManager.t('alert_invalid_contact'));
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
                return;
            }
            if (isOnline && !sampleLink) {
                alert(LanguageManager.t('alert_sample_link_required'));
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
                return;
            }
            if (sampleLink && !/^https?:\/\//i.test(sampleLink)) {
                alert(LanguageManager.t('alert_sample_link_format'));
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
                return;
            }
            if (portfolioLink && !/^https?:\/\//i.test(portfolioLink)) {
                alert(LanguageManager.t('alert_portfolio_link_format'));
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
                return;
            }

            let media = null;
            let mediaType = null;
            let uploadSuccess = true;
            let progressEl = null;
            let statusEl = null;
            let errorEl = null;
            let fillEl = null;
            let textEl = null;

            // Handle media upload with progress
            if (this.mediaFile) {
                progressEl = document.getElementById('upload-progress');
                statusEl = document.getElementById('upload-status');
                errorEl = document.getElementById('upload-error');
                fillEl = document.querySelector('.progress-fill');
                textEl = document.getElementById('progress-text');
                if (progressEl) progressEl.style.display = 'block';
                if (fillEl) {
                    fillEl.style.width = '12%';
                    fillEl.style.transition = 'width 0.3s ease';
                }
                if (textEl) textEl.textContent = 'Upload started...';
                if (statusEl) statusEl.textContent = 'Waiting for upload...';

                try {
                    if (CloudinaryUploader.isConfigured()) {
                        const onUploadProgress = ({ percent, loaded, total, lengthComputable }) => {
                            const fillEl = document.querySelector('.progress-fill');
                            const textEl = document.getElementById('progress-text');
                            const loadedKb = Math.round(loaded / 1024);
                            const totalKb = total ? Math.round(total / 1024) : null;
                            const displayPercent = lengthComputable ? percent : (loaded ? 1 : 0);

                            if (fillEl) fillEl.style.width = `${displayPercent}%`;
                            if (textEl) textEl.textContent = lengthComputable ? `${percent}%` : (loaded ? `${loadedKb}KB` : 'Uploading...');
                            if (statusEl) {
                                statusEl.textContent = totalKb
                                    ? `Uploading... ${loadedKb}KB / ${totalKb}KB`
                                    : `Uploading... ${loadedKb}KB`;
                            }
                        };
                        const result = await CloudinaryUploader.uploadFile(this.mediaFile, {
                            folder: 'jobs',
                            tags: ['job-media']
                        }, onUploadProgress);
                        media = result.url;
                        mediaType = result.format || this.mediaFile.type;
                        if (statusEl) statusEl.textContent = 'Upload complete ✅';
                    } else {
                        // Firebase fallback (existing logic)
                        const storageReady = await FirebaseStorageLoader.load();
                        if (storageReady && window.firebase?.storage) {
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
                            if (statusEl) statusEl.textContent = 'Firebase upload complete ✅';
                        }
                    }
            } catch (error) {
                // Enhanced logging for debugging
                console.error('[Media upload FAILED] Full error:', {
                    message: error?.message,
                    name: error?.name,
                    stack: error?.stack,
                    response: error?.response || null
                });
                console.error('Original file:', this.mediaFile?.name, this.mediaFile?.size);
                uploadSuccess = false;
                const msg = error?.message || 'Upload failed (check console)';
                if (errorEl) {
                    errorEl.textContent = `Media upload failed: ${msg}. Please try again.`;
                    errorEl.style.display = 'block';
                }
                if (statusEl) statusEl.textContent = `Upload failed: ${msg}`;
                const formMsgEl = document.getElementById('form-msg');
                if (formMsgEl) {
                    formMsgEl.textContent = msg;
                    formMsgEl.className = 'form-msg error';
                }
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
                return;
            }
            }

            // Prevent save when a selected image was not uploaded successfully
            if (this.mediaFile && !media) {
                const msg = 'Selected image was not uploaded successfully. Please try again.';
                const formMsgEl = document.getElementById('form-msg');
                if (formMsgEl) {
                    formMsgEl.textContent = msg;
                    formMsgEl.className = 'form-msg error';
                }
                if (statusEl) statusEl.textContent = 'Upload failed';
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
                return;
            }

            // Use existing media for edits or skip if upload failed
            if (isEditing && !this.mediaTouched) {
                media = existingJob.media || null;
                mediaType = existingJob.mediaType || null;
            }

            // If a new media file was selected, require a successful upload before saving
            console.log('[Job Post] Media status:', { media, mediaType, uploadSuccess, hadFile: !!this.mediaFile });


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
                ...(media ? { media, mediaType } : {}),
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

            // Reset UI
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
            form.reset();
            this.mediaData = null;
            this.mediaType = null;
            this.mediaTouched = false;
            this.mediaFile = null;
            this.editingJob = null;
            const previewContainer = document.getElementById('media-preview-container');
            if (previewContainer) previewContainer.style.display = 'none';
            if (progressEl) progressEl.style.display = 'none';

            if (saveResult?.ok) {
                if (msgEl) {
                    msgEl.textContent = isEditing ? 'Job updated successfully.' : LanguageManager.t('post_success');
                    msgEl.className = 'form-msg success';
                }
                setTimeout(() => {
                    localStorage.removeItem('editJobId');
                    window.location.href = 'jobs.html';
                }, 1500);
            } else {
                if (msgEl) {
                    msgEl.textContent = LanguageManager.t('post_fail');
                    msgEl.className = 'form-msg error';
                }
            }
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

    async handleFile(file) {
        if (!file) return;

        const statusEl = document.getElementById('upload-status');
        const errorEl = document.getElementById('upload-error');
        if (errorEl) errorEl.style.display = 'none';

        // Type check
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
            if (statusEl) statusEl.textContent = LanguageManager.t('alert_invalid_media_type');
            alert(LanguageManager.t('alert_invalid_media_type'));
            return;
        }

        // Initial size check (before compress)
        if (file.size > 10 * 1024 * 1024) {  // 10MB hard limit
            const msg = 'File too large (max 10MB). Compress or choose smaller file.';
            if (statusEl) statusEl.textContent = msg;
            alert(msg);
            return;
        }

        this.mediaFile = file;
        this.mediaTouched = true;

        try {
            if (file.type.startsWith('image/')) {
                // Compress/resize images
                const compressed = await this.compressImage(file);
                this.mediaFile = new File([compressed], file.name, { type: 'image/jpeg' });
                if (statusEl) statusEl.textContent = `Compressed to ${Math.round(this.mediaFile.size / 1024)} KB`;
            }

            // Preview
            const reader = new FileReader();
            reader.onload = (event) => {
                const result = event.target?.result;
                if (result) {
                    this.mediaData = String(result);
                    this.mediaType = this.mediaFile.type;
                    this.setMediaPreview(this.mediaData, this.mediaType);
                    const info = document.getElementById('media-info');
                    if (info) info.textContent = `${this.mediaFile.name} (${Math.round(this.mediaFile.size / 1024)} KB)`;
                }
            };
            reader.readAsDataURL(this.mediaFile);
        } catch (error) {
            console.error('File processing failed:', error);
            const msg = 'Failed to process file. Try another.';
            if (statusEl) statusEl.textContent = msg;
            alert(msg);
        }
    },

    compressImage(file, maxWidth = 1200, quality = 0.8) {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();

            img.onload = () => {
                const { width, height } = img;
                if (width <= maxWidth) {
                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0);
                } else {
                    canvas.width = maxWidth;
                    canvas.height = (height * maxWidth) / width;
                    ctx.drawImage(img, 0, 0, maxWidth, canvas.height);
                }

                canvas.toBlob((blob) => {
                    if (blob.size > file.size * 0.9) {
                        // Retry lower quality if barely smaller
                        const lowerQualityCanvas = document.createElement('canvas');
                        const lowerCtx = lowerQualityCanvas.getContext('2d');
                        lowerQualityCanvas.width = canvas.width;
                        lowerQualityCanvas.height = canvas.height;
                        lowerCtx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        lowerQualityCanvas.toBlob(resolve, 'image/jpeg', quality * 0.7);
                    } else {
                        resolve(blob);
                    }
                }, 'image/jpeg', quality);
            };

            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
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
        const localIsAdmin = Utils.isAdmin(user);
        const firebaseUser = window.firebase?.auth ? window.firebase.auth().currentUser : null;
        const firebaseEmail = firebaseUser?.email ? String(firebaseUser.email).trim().toLowerCase() : '';
        const firebaseIsAdmin = ADMIN_EMAILS.includes(firebaseEmail);

        if (firebaseIsAdmin) return true;

        let message = 'Access denied. This page is restricted.';
        if (localIsAdmin) {
            message = 'Please sign in with your admin account to load reports.';
        }

        if (listEl) {
            listEl.innerHTML = `<div class="empty-state-container"><h4>Access denied</h4><p>${message} <a href="auth.html">Sign in</a></p></div>`;
        }
        if (emptyEl) emptyEl.style.display = 'none';
        if (clearBtn) clearBtn.style.display = 'none';
        return false;
    }
};

const FirebaseAuthState = {
    ready: null,

    wait() {
        if (!window.firebase || !window.firebase.auth) return Promise.resolve(false);
        if (this.ready) return this.ready;
        this.ready = new Promise((resolve) => {
            const auth = window.firebase.auth();
            const unsub = auth.onAuthStateChanged(() => {
                unsub();
                resolve(true);
            });
        });
        return this.ready;
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

            const jobId = Utils.escapeHtml(String(report.jobId || ''));
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
                        ${jobId ? `<button class="btn warning small" data-job-id="${jobId}" data-job-delete="true">Delete Job</button>` : ''}
                        <button class="btn danger small" data-report-id="${reportId}" data-report-source="${reportSource}">Delete Report</button>
                    </div>
                </div>
            `;
        }).join('');

        list.querySelectorAll('button[data-job-delete]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const jobId = btn.getAttribute('data-job-id');
                if (!confirm('Are you sure you want to permanently delete this job? This cannot be undone.')) return;
                await this.deleteJobAsAdmin(jobId);
                const refreshed = await this.fetchReports();
                this.renderReports(refreshed);
            });
        });

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

    async deleteJobAsAdmin(jobId) {
        // Get the current user (admin)
        const firebaseUser = window.firebase?.auth ? window.firebase.auth().currentUser : null;
        const adminUser = firebaseUser ? { id: firebaseUser.uid, email: firebaseUser.email || '' } : { email: '' };

        // Use the Storage utility to delete the job async
        const result = await Storage.deleteJobByIdAsync(jobId, adminUser);
        if (!result.ok) {
            console.error('Failed to delete job:', result.reason);
            alert(`Failed to delete job: ${result.reason}`);
        }
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
        await FirebaseAuthState.wait();
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
        await FirebaseAuthState.wait();
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

const HomePageManager = {
    async init() {
        const snapshotJobs = document.getElementById('snapshot-jobs');
        const snapshotCategories = document.getElementById('snapshot-categories');
        const snapshotCities = document.getElementById('snapshot-cities');
        const categoryTags = document.getElementById('hero-category-tags');
        const citySummary = document.getElementById('hero-city-summary');
        const popularCategories = document.getElementById('popular-category-chips');

        if (!snapshotJobs && !snapshotCategories && !snapshotCities && !categoryTags && !citySummary && !popularCategories) {
            return;
        }

        const jobs = await Storage.getAllJobsAsync();
        const categoryCounts = new Map();
        const cityCounts = new Map();

        jobs.forEach((job) => {
            const category = String(job?.category || '').trim();
            if (category) {
                categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
            }

            const city = String(job?.location || '').trim();
            if (city) {
                cityCounts.set(city, (cityCounts.get(city) || 0) + 1);
            }
        });

        const topCategories = Array.from(categoryCounts.entries())
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 6);

        const topCities = Array.from(cityCounts.entries())
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 3);

        if (snapshotJobs) snapshotJobs.textContent = String(jobs.length);
        if (snapshotCategories) snapshotCategories.textContent = String(categoryCounts.size);
        if (snapshotCities) snapshotCities.textContent = String(cityCounts.size);

        if (categoryTags) {
            categoryTags.innerHTML = '';
            if (topCategories.length) {
                topCategories.slice(0, 4).forEach(([name, count]) => {
                    const tag = document.createElement('span');
                    tag.className = 'hero-tag';
                    tag.textContent = `${name} (${count})`;
                    categoryTags.appendChild(tag);
                });
            } else {
                const fallback = document.createElement('span');
                fallback.className = 'hero-tag';
                fallback.textContent = 'Fresh listings coming in';
                categoryTags.appendChild(fallback);
            }
        }

        if (citySummary) {
            citySummary.textContent = topCities.length
                ? `${topCities.map(([city, count]) => `${city} (${count})`).join(', ')} are currently generating the most activity.`
                : 'Add a few listings with city names to show local hiring momentum here.';
        }

        if (popularCategories) {
            popularCategories.innerHTML = '';

            const allLink = document.createElement('a');
            allLink.className = 'category-chip';
            allLink.href = 'jobs.html';
            allLink.textContent = 'Browse all jobs';
            popularCategories.appendChild(allLink);

            topCategories.forEach(([name, count]) => {
                const link = document.createElement('a');
                link.className = 'category-chip';
                link.href = `jobs.html?search=${encodeURIComponent(name)}`;
                link.textContent = `${name} (${count})`;
                popularCategories.appendChild(link);
            });
        }
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    LayoutManager.ensureNavRight();
    LayoutManager.ensureMobileMenu();
    await FirebaseStore.init();
    await FirebaseAuthLoader.load();
    LanguageManager.init();
    ThemeManager.init();
    TopButton.init();
    AuthManager.init();
    await StatsManager.init();
    await HomePageManager.init();
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
