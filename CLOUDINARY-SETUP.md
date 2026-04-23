# Cloudinary Setup Guide

Your site uses **Cloudinary** for image and video uploads.

## What Changed
- Removed the old Cloudflare R2 Worker dependency
- Uploads now go directly from the browser to Cloudinary
- Media stays in Cloudinary while app data stays lightweight

## Complete Setup

### Step 1: Create an unsigned upload preset
1. Go to [Cloudinary Dashboard](https://cloudinary.com/console/dashboard).
2. Open `Settings -> Upload`.
3. Scroll to the `Upload presets` section.
4. Click `Create upload preset`.
5. Set:
   - `Name`: `kaarlight_unsigned`
   - `Signing mode`: `Unsigned`
6. Save the preset.

### Step 2: Confirm your Cloud Name
Your current Cloud Name in `cloudinary-config.js` is:

```text
dbbp3cusz
```

### Step 3: Test an upload
1. Open the profile page.
2. Upload a profile image.
3. Post a job with media if needed.
4. Confirm the file uploads successfully and the returned URL is saved.

## Config Example

```javascript
window.CLOUDINARY_CONFIG = {
  cloudName: "dbbp3cusz",
  uploadPreset: "kaarlight_unsigned",
  apiBase: "https://api.cloudinary.com/v1_1",
  maxFileSizeMb: 3
};
```

## Troubleshooting

### Upload preset not found
Make sure the preset name is exactly `kaarlight_unsigned`.

### Invalid upload preset
Make sure the preset is set to `Unsigned` in Cloudinary.

### Upload fails silently
Open browser DevTools and inspect the Console and Network tabs.

## Need Help
- [Cloudinary Docs](https://cloudinary.com/documentation)
- [Upload Presets](https://cloudinary.com/documentation/upload_presets)
