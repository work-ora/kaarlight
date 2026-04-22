# Workora - Fast Local Jobs for Afghans

Workora is a fast, simple job board for Afghan communities, built to help people post local jobs and find nearby freelance or full-time work in minutes.

**Features**
- Job listings with search and filters (category, location, type)
- Post jobs for freelance, short-term, or full-time roles
- User profiles and basic account management
- Firebase-backed app setup
- Cloudinary-powered media uploads for profile photos and job media
- Dark mode
- Mobile-responsive design
- PWA support for installable app experience
- User settings for preferences

**Built With**
- HTML5, CSS3, JavaScript (Vanilla)
- Firebase for app and data services
- Cloudinary for image and video uploads
- Local Storage for client-side session and fallback persistence
- Mobile-first responsive design
- SEO-friendly markup

**Pages**
Home, Jobs, Job Detail, Post Job, Authentication, Profile, Settings, About, Contact, FAQ, Privacy, Terms, 404.

**Getting Started**
1. Download or clone this repository.
2. Review `firebase-init.js` and confirm the Firebase project values are correct for your deployment.
3. Create a Cloudinary account (free at cloudinary.com) and set up an unsigned upload preset named `afgjobs_unsigned`.
4. Update `cloudinary-config.js` with your Cloudinary Cloud Name and Upload Preset.
5. Open `index.html` in your browser.
6. Start browsing or posting jobs.

**Cloudinary + Firebase Upload Flow**
- Job media and profile photos upload directly to Cloudinary from the browser.
- The Cloudinary URL is stored with the related job or user record.
- Firebase stays focused on lightweight application data instead of large media files.

**Cloudinary Setup**
1. Sign up free at [cloudinary.com](https://cloudinary.com).
2. Go to Dashboard → Settings → Upload and create an unsigned upload preset named `afgjobs_unsigned`.
3. Copy your Cloud Name and paste it into `cloudinary-config.js`.
4. No backend Worker needed - uploads go directly from browser to Cloudinary!

**Note**
This project still includes local/session storage behavior for some client-side flows. For production use, keep Firebase rules locked down and protect the Worker with auth or rate limits before accepting public uploads.

**Security**
This project includes security best practices:
- Content Security Policy (CSP) headers to prevent XSS attacks
- Input validation and sanitization for all user data
- File upload validation (type & size checks)
- MIME-type sniffing protection
- Clickjacking prevention (X-Frame-Options)
- See [SECURITY.md](./SECURITY.md) and [SECURITY-HEADERS-DEPLOYMENT.md](./SECURITY-HEADERS-DEPLOYMENT.md) for details.
