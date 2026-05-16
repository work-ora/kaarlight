// Job Detail Page Logic
    const JobDetail = {
      getJobIdFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.get('id');
      },

      async getJobById(id) {
        if (!id) return null;
        if (!FirebaseStore.enabled) {
          await FirebaseStore.init();
        }

        const localJobs = Storage.getAllJobs();
        const localJob = localJobs.find(job => String(job.id) === String(id));

        if (FirebaseStore.enabled && FirebaseStore.db) {
          try {
            const doc = await FirebaseStore.db.collection('jobs').doc(String(id)).get();
            if (doc.exists) {
              const firebaseJob = { id: doc.id, ...doc.data() };
              if (localJob) {
                return {
                  ...firebaseJob,
                  media: firebaseJob.media || localJob.media || '',
                  mediaType: firebaseJob.mediaType || localJob.mediaType || ''
                };
              }
              return firebaseJob;
            }
          } catch {
            // Fall back to local storage below.
          }
        }

        const allJobs = await Storage.getAllJobsAsync();
        return allJobs.find(job => String(job.id) === String(id)) || localJob || null;
      },

      formatDate(isoString) {
        if (!isoString) return '-';
        const date = new Date(isoString);
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      },

      renderJobDetail(job) {
        if (!job) {
          document.getElementById('job-not-found').style.display = 'block';
          document.getElementById('job-detail-hero').style.display = 'none';
          document.getElementById('job-content').style.display = 'none';
          return;
        }

        // Show content
        document.getElementById('job-not-found').style.display = 'none';
        document.getElementById('job-detail-hero').style.display = 'block';
        document.getElementById('job-content').style.display = 'grid';

        // Header
        document.getElementById('job-title').textContent = job.title || 'Untitled';
        document.getElementById('category-meta').textContent = `${LanguageManager.t('detail_category_label')}: ${job.category || 'Other'}`;
        document.getElementById('location-meta').textContent = `${LanguageManager.t('detail_location_label')}: ${job.location || 'Remote'}`;
        document.getElementById('type-meta').textContent = `${LanguageManager.t('detail_posted_by_label')}: ${job.posterType || 'Poster'}`;

        // Description
        document.getElementById('job-description').textContent = job.description || 'No description provided';

        // Budget
        document.getElementById('job-budget').textContent = `${job.currency || 'USD'} ${job.price || '0'}`;
        document.getElementById('job-currency').textContent = job.currency || 'USD';
        document.getElementById('category-badge').textContent = job.category || 'Other';
        document.getElementById('type-badge').textContent = job.posterType || 'Poster';

        // Contact
        const contact = String(job.contact || '').trim();
        const isEmail = Utils.isEmail(contact);
        document.getElementById('contact-display').textContent = contact;

        if (isEmail) {
          document.getElementById('contact-primary-btn').href = `mailto:${encodeURIComponent(contact)}`;
          document.getElementById('contact-btn-text').textContent = LanguageManager.t('contact_btn_email');
        } else {
          document.getElementById('contact-primary-btn').href = `tel:${contact.replace(/[^\d+]/g, '')}`;
          document.getElementById('contact-btn-text').textContent = LanguageManager.t('contact_btn_call');
        }

        // Media
        const mediaUrl = Utils.safeHttpUrl(job.media);
        if (mediaUrl) {
          document.getElementById('media-section').style.display = 'block';
          const isVideo = (job.mediaType || '').includes('video');
          if (isVideo) {
            document.getElementById('job-media-video').src = mediaUrl;
            document.getElementById('job-media-video').style.display = 'block';
            document.getElementById('job-media-img').style.display = 'none';
          } else {
            document.getElementById('job-media-img').src = mediaUrl;
            document.getElementById('job-media-img').style.display = 'block';
            document.getElementById('job-media-video').style.display = 'none';
          }
          document.getElementById('job-media-placeholder').style.display = 'none';
        } else {
          document.getElementById('media-section').style.display = 'block';
          document.getElementById('job-media-placeholder').style.display = 'block';
          document.getElementById('job-media-img').style.display = 'none';
          document.getElementById('job-media-video').style.display = 'none';
        }

        // Portfolio Link
        if (job.portfolioLink) {
          const safePortfolio = Utils.safeHttpUrl(job.portfolioLink);
          if (!safePortfolio) {
            document.getElementById('portfolio-section').style.display = 'none';
          } else {
          document.getElementById('portfolio-section').style.display = 'block';
          document.getElementById('portfolio-link-text').href = safePortfolio;
          document.getElementById('portfolio-link-text').textContent = safePortfolio;
          }
        } else {
          document.getElementById('portfolio-section').style.display = 'none';
        }

        // Online Job
        if (job.isOnline && job.sampleLink) {
          const safeSample = Utils.safeHttpUrl(job.sampleLink);
          if (!safeSample) {
            document.getElementById('online-job-section').style.display = 'none';
          } else {
          document.getElementById('online-job-section').style.display = 'block';
          document.getElementById('sample-link-text').href = safeSample;
          document.getElementById('sample-link-text').textContent = safeSample;
          }
        } else {
          document.getElementById('online-job-section').style.display = 'none';
        }

        // Date
        document.getElementById('posted-date').textContent = this.formatDate(job.createdAt);

        // Set page title
        document.title = `${job.title} - Kaarlight`;

        // Owner actions
        const currentUser = Storage.getCurrentUser();
        const ownerSection = document.getElementById('owner-actions');
        const deleteBtn = document.getElementById('delete-job-btn');
        const editBtn = document.getElementById('edit-job-btn');
        const isOwner = Utils.isJobOwner(job, currentUser);
        if (ownerSection) {
          ownerSection.style.display = isOwner ? 'block' : 'none';
        }
        if (deleteBtn) {
          deleteBtn.onclick = async () => {
            if (!isOwner) {
              alert(LanguageManager.t('delete_not_owner'));
              return;
            }
            if (!confirm(LanguageManager.t('delete_confirm'))) return;
            const result = await Storage.deleteJobByIdAsync(job.id, currentUser);
            if (!result.ok) {
              if (result.reason === 'auth-required') {
                alert('Please sign in with your account to delete this job.');
              } else {
                alert(LanguageManager.t('delete_failed'));
              }
              return;
            }
            window.location.href = 'jobs.html';
          };
        }
        if (editBtn) {
          editBtn.onclick = () => {
            if (!isOwner) {
              alert(LanguageManager.t('delete_not_owner'));
              return;
            }
            localStorage.setItem('editJobId', job.id);
            window.location.href = 'post-job.html';
          };
        }

        // Event listeners
        this.setupEventListeners(contact);
      },

      setupEventListeners(contact) {
        const copyText = (value) => {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(value);
          }

          return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.value = value;
            document.body.appendChild(input);
            input.select();
            const success = document.execCommand('copy');
            input.remove();
            if (success) resolve();
            else reject(new Error('Copy failed'));
          });
        };

        // Copy contact
        document.getElementById('copy-contact-btn').addEventListener('click', () => {
          copyText(contact).then(() => {
            const btn = document.getElementById('copy-contact-btn');
            const original = btn.textContent;
            btn.textContent = LanguageManager.t('copy_success');
            setTimeout(() => btn.textContent = original, 2000);
          }).catch(() => alert(LanguageManager.t('copy_failed')));
        });

        // WhatsApp share
        document.getElementById('share-whatsapp-btn').addEventListener('click', () => {
          const title = document.getElementById('job-title').textContent;
          const url = window.location.href;
          const message = `Check out this job on Kaarlight: ${title} - ${url}`;
          const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
          window.open(whatsappUrl, '_blank');
        });

        // Copy link
        document.getElementById('share-copy-link-btn').addEventListener('click', () => {
          copyText(window.location.href).then(() => {
            const btn = document.getElementById('share-copy-link-btn');
            const original = btn.textContent;
            btn.textContent = LanguageManager.t('copy_link_success');
            setTimeout(() => btn.textContent = original, 2000);
          }).catch(() => alert(LanguageManager.t('copy_link_failed')));
        });
      },

      setupReportForm(job) {
        const form = document.getElementById('report-form');
        const msgEl = document.getElementById('report-msg');
        if (!form || !job) return;

        form.addEventListener('submit', async (event) => {
          event.preventDefault();

          const reason = String(document.getElementById('report-reason')?.value || '').trim();
          const details = String(document.getElementById('report-details')?.value || '').trim();

          if (!reason) {
            if (msgEl) {
              msgEl.textContent = LanguageManager.t('report_reason_required');
              msgEl.className = 'feedback-msg error';
            }
            return;
          }

          const currentUser = Storage.getCurrentUser();
          const payload = {
            jobId: job.id,
            jobTitle: job.title || 'Untitled',
            posterId: job.posterId || null,
            posterEmail: job.postedBy || '',
            posterName: job.postedByName || '',
            reason,
            details,
            reporterId: currentUser?.id || null,
            reporterEmail: currentUser?.email || null,
            reporterName: currentUser?.fullname || null
          };

          const result = await Storage.saveReportAsync(payload);
          if (!result.ok) {
            if (msgEl) {
              msgEl.textContent = LanguageManager.t('report_submit_fail');
              msgEl.className = 'feedback-msg error';
            }
            return;
          }

          form.reset();
          if (msgEl) {
            msgEl.textContent = LanguageManager.t('report_submit_success');
            msgEl.className = 'feedback-msg success';
          }
        });
      },

      async init() {
        const jobId = this.getJobIdFromUrl();
        const job = await this.getJobById(jobId);
        this.renderJobDetail(job);
        this.setupReportForm(job);
      }
    };

    // Initialize when page loads
    window.KaarlightJobDetailPage = JobDetail;

    if (document.currentScript?.dataset.routerPageScript !== 'true') {
      document.addEventListener('DOMContentLoaded', () => {
        JobDetail.init();
      });
    }
