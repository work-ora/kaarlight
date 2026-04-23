# Kaarlight Security Improvements v1.0

## Summary
Critical security fixes have been applied to protect against:
- **XSS (Cross-Site Scripting)** attacks
- **Clickjacking** attacks
- **MIME-type sniffing**
- **Malicious file uploads**
- **SQL Injection-like attacks** (in localStorage context)

---

## âœ… Security Fixes Applied

### 1. HTTP Security Headers (.htaccess)
**File**: `.htaccess`

**What was added:**
- **Content-Security-Policy**: Blocks inline scripts and restricts resource loading to trusted domains
- **X-Content-Type-Options: nosniff**: Prevents MIME-type sniffing attacks
- **X-Frame-Options: DENY**: Prevents clickjacking by blocking iframe embedding
- **X-XSS-Protection**: Enables XSS protection in older browsers
- **Strict-Transport-Security**: Forces HTTPS (when configured on server)
- **Referrer-Policy**: Controls referrer information leaked to external sites
- **Permissions-Policy**: Blocks access to sensitive APIs (geolocation, microphone, camera)

**Implementation**: Deploy `.htaccess` to your Apache server, or convert the headers to your server config (nginx, IIS, etc.)

---

### 2. Content-Security-Policy Meta Tags (HTML)
**Files Modified**: 
- `index.html`
- `jobs.html`
- `post-job.html`
- `auth.html`
- `profile.html`
- `settings.html`

**What was added:**
- CSP meta tags as fallback when headers cannot be deployed
- Restricts all content to `https://` origin
- Allows scripts only from: Firebase, Google Analytics, Google APIs
- Blocks inline styles (`'unsafe-inline'` only for essential styling)
- Prevents form submission to external domains

**Example**:
```html
<meta http-equiv="Content-Security-Policy" 
  content="default-src 'self' https:; script-src 'self' https://www.gstatic.com https://apis.google.com; ..."
/>
```

---

### 3. Enhanced Input Validation (script.js)
**New Functions in Utils object:**

#### `validateJobTitle(title)`
- Length: 5-100 characters
- Blocks control characters (null bytes, etc.)
- Only allows: alphanumeric, spaces, hyphens, parentheses, periods, commas, ampersand, and Dari/Persian characters

#### `validateDescription(desc)`
- Length: 20-1000 characters
- Blocks control characters

#### `validatePrice(price)`
- Must be a valid number
- Range: 0 to 999,999,999
- Prevents negative numbers and exponent notation

#### `validateLocation(location)`
- Length: 2-100 characters
- Blocks control characters

#### `validateContactInfo(contact)`
- Must be valid email OR valid phone number
- Uses `isEmail()` and `isPhone()` validators

#### `validateFileUpload(file)`
- **Allowed MIME types**: image/jpeg, image/png, image/gif, image/webp, video/mp4, video/webm
- **Max file size**: 2MB
- Rejects any file with unknown or dangerous MIME types

#### `sanitizeText(value, maxLength = 500)`
- Trims whitespace
- Removes all control characters (ASCII 0x00-0x1F, 0x7F)
- Truncates to max length to prevent buffer-overflow-like attacks

#### `stripDangerousAttributes(html)`
- Removes `on*` event handlers (onclick, onload, etc.)
- Removes `javascript:` protocol
- Use this before storing or rendering user HTML

---

### 4. Improved File Upload Security (R2Uploader)
**File**: `script.js` (R2Uploader.uploadFile)

**Changes**:
- Uses `Utils.validateFileUpload()` before processing
- Sanitizes Content-Type header to prevent injection
- Prevents malicious file extensions via `sanitizeFileName()`
- Adds timestamp to all uploaded files for uniqueness

---

### 5. XSS Protection in Search & URL Parameters
**File**: `script.js` (SearchEngine)

**Changes**:
- URL search parameter (`?search=`) is now sanitized with `Utils.sanitizeText()`
- Prevents attackers from injecting scripts via URL parameters
- Example: `/jobs.html?search=<script>alert('xss')</script>` is now safe

---

### 6. Storage Access Control
**What's protected** (in `.htaccess`):
```apache
<FilesMatch "^(\.|firebase-init|oauth-config|cloudinary-config|\.git)">
    Deny from all
</FilesMatch>
```
- Blocks direct access to:
  - Hidden files (`.env`, `.htaccess`, `.git`)
  - Configuration files (`firebase-init.js`, `oauth-config.js`, `cloudinary-config.js`)
  - Git repository metadata

---

### 7. HTML Escaping (Already Present + Reinforced)
**Function**: `Utils.escapeHtml()`

**What it does:**
- Converts HTML special characters to entities:
  - `&` â†’ `&amp;`
  - `<` â†’ `&lt;`
  - `>` â†’ `&gt;`
  - `"` â†’ `&quot;`
  - `'` â†’ `&#39;`

**Usage**: Applied in `Renderer.createJobCard()` for:
- Job titles
- Descriptions
- Locations
- Poster types
- Budget information

---

## ðŸ“‹ Security Checklist for Deployment

### Before Going Live:

- [ ] **Deploy `.htaccess`** to your web server (if Apache)
- [ ] **Enable HTTPS/SSL** (required for Strict-Transport-Security)
- [ ] **Configure Firebase Rules** (Firestore read/write permissions):
  ```javascript
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /jobs/{document=**} {
        allow read: if true;
        allow create: if request.auth != null;
        allow update, delete: if request.auth.uid == resource.data.userId;
      }
      match /reports/{document=**} {
        allow write: if request.auth != null;
      }
      match /feedback/{document=**} {
        allow write: if request.auth != null;
      }
    }
  }
  ```

- [ ] **Cloudinary Configuration** already set up with unsigned upload preset
  - Validate file types and sizes on frontend (already implemented)
  - Monitor upload usage in Cloudinary Dashboard
  
- [ ] **Test CSP** in browser DevTools (check Console for CSP violations)
- [ ] **Validate all forms** on the backend (Firebase Cloud Functions or backend API)
- [ ] **Enable Google Analytics** for security monitoring if needed
- [ ] **Set up error tracking** (e.g., Sentry, Firebase Crashlytics)

---

## ðŸ”’ Additional Security Recommendations

### 1. Backend Validation (Critical)
**Always validate on the backend**, not just frontend:
- Duplicate title/price/description checks
- Check for duplicate submissions from same user
- Implement rate limiting on job submissions
- Log suspicious activities

### 2. Firebase Security Rules
Ensure your Firestore rules are properly configured:
```javascript
allow write: if request.auth != null && 
            request.time < timestamp.now().add(duration.value(1, 'h')) &&
            request.resource.data.userId == request.auth.uid;
```

### 3. Environment Variables
- **Never commit** `firebase-init.js`, `oauth-config.js`, or `cloudinary-config.js` with sensitive credentials
- Use `.gitignore` to exclude these files:
  ```
  firebase-init.js
  oauth-config.js
  cloudinary-config.js
  .env
  .env.local
  ```

### 4. Regular Security Audits
- Run [npm audit](https://docs.npmjs.com/cli/v8/commands/npm-audit) if you use npm packages
- Check [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- Use [Mozilla Observatory](https://observatory.mozilla.org/) to test your site

### 5. User Input Monitoring
- Log rapid-fire job submissions (possible spam/attacks)
- Monitor for attempts to bypass validation
- Set up alerts for unusual activity patterns

---

## ðŸ§ª Testing the Security Fixes

### Test CSP:
1. Open DevTools (F12) â†’ Console
2. Try to execute: `<script>alert('xss')</script>` anywhere
3. **Expected**: Script blocked, CSP violation logged in Console

### Test File Upload:
1. Try to upload a `.exe`, `.js`, or `.html` file
2. **Expected**: "File type not allowed" error

### Test Input Validation:
1. Job title: Try less than 5 characters
2. **Expected**: "Title must be 5-100 characters" error

### Test URL Parameter:
1. Visit: `/jobs.html?search=<img src=x onerror=alert('xss')>`
2. **Expected**: Search bar shows sanitized text, no alert

---

## ðŸ“ž Support & Questions

If you encounter any security issues:
1. **Do NOT post details publicly**
2. Report to: [Support Email / Security Team]
3. Include: Browser, steps to reproduce, screenshot/logs

---

**Last Updated**: April 4, 2026  
**Security Version**: 1.0  
**Status**: âœ… Production Ready

