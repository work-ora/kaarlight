# Security Headers Deployment Guide

## Overview
The `.htaccess` file configuration needs to be deployed to your web server based on what you're using.

---

## Apache (Recommended - Uses `.htaccess`)

**Status**: âœ… Ready to deploy  
**File**: `.htaccess` (in root directory)

### Steps:
1. Upload `.htaccess` to your site's root directory via FTP/SFTP
2. Ensure Apache has `mod_headers` and `mod_rewrite` enabled
   - Ask your hosting provider to enable these if they're not
3. Test with: [Mozilla Observatory](https://observatory.mozilla.org/) or [securityheaders.com](https://securityheaders.com)

### Verify:
```bash
curl -I https://kaarlight.github.io/kaarlight/
# Look for headers like:
# Content-Security-Policy: ...
# X-Content-Type-Options: nosniff
```

---

## Nginx

**Status**: âš ï¸ Manual conversion needed

### Create/Update `nginx.conf`:
```nginx
server {
    listen 443 ssl http2;
    server_name kaarlight.github.io;

    # SSL configuration (required)
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Security Headers
    add_header Content-Security-Policy "default-src 'self' https:; script-src 'self' https://www.gstatic.com https://apis.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=()" always;

    # Disable directory listing
    autoindex off;

    # Protect sensitive files
    location ~ /\. {
        deny all;
    }
    location ~ /(firebase-init|oauth-config|cloudinary-config|\.git) {
        deny all;
    }

    # Root directory
    root /var/www/kaarlight;
    index index.html;

    # Try file or directory, else 404
    try_files $uri $uri/ =404;
}
```

### Reload Nginx:
```bash
sudo nginx -t          # Test config
sudo systemctl reload nginx
```

---

## Microsoft IIS (Windows)

**Status**: âš ï¸ Manual conversion needed

### Via IIS Manager:

1. Open **IIS Manager**
2. Select your website
3. Double-click **HTTP Response Headers**
4. Click **Add** for each header:

| Header | Value |
|--------|-------|
| `Content-Security-Policy` | `default-src 'self' https:; script-src 'self' https://www.gstatic.com https://apis.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `X-XSS-Protection` | `1; mode=block` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=(), payment=()` |

### Via `web.config`:

Add to `<system.webServer>` section:

```xml
<httpProtocol>
    <customHeaders>
        <add name="Content-Security-Policy" value="default-src 'self' https:; script-src 'self' https://www.gstatic.com https://apis.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';" />
        <add name="X-Content-Type-Options" value="nosniff" />
        <add name="X-Frame-Options" value="DENY" />
        <add name="X-XSS-Protection" value="1; mode=block" />
        <add name="Strict-Transport-Security" value="max-age=31536000; includeSubDomains; preload" />
        <add name="Referrer-Policy" value="strict-origin-when-cross-origin" />
        <add name="Permissions-Policy" value="geolocation=(), microphone=(), camera=(), payment=()" />
    </customHeaders>
</httpProtocol>
```

---

## Cloudflare (All Server Types)

If your site is behind Cloudflare, you can set headers there:

1. Log in to **Cloudflare Dashboard**
2. Select your site
3. Go to **Rules** â†’ **Transform Rules** â†’ **Modify Response Header**
4. Create a rule to add each security header

### Example Rule:
```
Field: Response Headers
Operation: Add
Header Name: X-Content-Type-Options
Header Value: nosniff
```

Repeat for each header listed in the `.htaccess` file.

---

## Verification Checklist

After deploying headers, verify they're active:

### Online Tools:
- [Security Headers](https://securityheaders.com) - Scans your site and grades security
- [Mozilla Observatory](https://observatory.mozilla.org/) - Mozilla's security audit tool
- [SSL Labs](https://www.ssllabs.com/ssltest/) - Tests SSL/TLS configuration

### Command Line:
```bash
# Check all headers
curl -I https://kaarlight.github.io/kaarlight/

# Should see output like:
# HTTP/2 200
# Content-Security-Policy: default-src 'self' https:; ...
# X-Content-Type-Options: nosniff
# X-Frame-Options: DENY
```

### Browser DevTools:
1. Open Browser DevTools (F12)
2. Go to **Network** tab
3. Load a page on your site
4. Click any request
5. Go to **Response Headers** tab
6. Verify security headers are present

---

## Troubleshooting

### Headers not appearing?
- **Apache**: Check if `mod_headers` is enabled: `apache2ctl -M | grep headers`
- **Nginx**: Reload with `sudo systemctl reload nginx` (not restart)
- **IIS**: Restart IIS: `iisreset`
- **Cloudflare**: Wait 5-10 minutes for changes to propagate

### CSP too strict?
If legitimate features break:
1. Check browser console for CSP violations
2. Identify the blocked resource
3. Add it to the appropriate CSP directive
4. Test and re-deploy

Example: If Google Analytics doesn't load, add to `script-src`:
```
script-src 'self' https://www.gstatic.com https://www.googletagmanager.com https://apis.google.com https://www.google-analytics.com;
```

---

## Next Steps

1. **Deploy** security headers for your server type
2. **Test** using online tools
3. **Monitor** browser console for CSP violations
4. **Update** CSP as needed for new resources

**Questions?** Check the main `SECURITY.md` file for more details.

