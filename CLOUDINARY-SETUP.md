# Cloudinary Setup Guide

Your site has been migrated from **Cloudflare R2** to **Cloudinary** for image and video uploads.

## What Changed
- ✅ Removed Cloudflare R2 Worker dependency
- ✅ Direct browser uploads to Cloudinary (simpler, faster)
- ✅ Free tier supports up to 100MB files (we limit to 5MB)
- ✅ No more backend uploads needed

## ⚙️ Complete Setup in 3 Steps

### Step 1: Create an Unsigned Upload Preset
1. Go to [Cloudinary Dashboard](https://cloudinary.com/console/dashboard)
2. Navigate to **Settings** → **Upload** tab
3. Scroll to "Upload presets" section
4. Click **Create upload preset**
5. Fill in:
   - **Name**: `afgjobs_unsigned`
   - **Signing mode**: **Unsigned** (IMPORTANT!)
6. Click **Save**

### Step 2: Your Cloud Name
Your Cloud Name is already in `cloudinary-config.js`:
```
Cloud Name: dbbp3cusz
```

### Step 3: Test Upload
1. Go to **Profile** (Click user menu → "My Profile")
2. Click "Upload Photo" button
3. Select an image file
4. Should upload directly without any backend!

## Configuration File
**Location**: `cloudinary-config.js`

```javascript
window.CLOUDINARY_CONFIG = {
    cloudName: "dbbp3cusz",
    uploadPreset: "afgjobs_unsigned",
    apiBase: "https://api.cloudinary.com/v1_1",
    maxFileSizeMb: 5
};
```

## Files Modified
- `cloudinary-config.js` - NEW (Cloudinary settings)
- `script.js` - Added `CloudinaryUploader` object
- `profile.html` - Updated to use Cloudinary
- `post-job.html` - Updated to use Cloudinary

## Troubleshooting

### "Upload Preset not found"
→ Make sure you created the preset with exact name: `afgjobs_unsigned`

### "Invalid upload preset"
→ Make sure the preset is set to **Unsigned** mode in Cloudinary dashboard

### File upload fails silently
→ Open browser DevTools (F12) → Console and check for error messages

## Features
✅ Job media uploads (images & videos)
✅ Profile photo uploads
✅ Automatic image optimization
✅ CloudFront CDN delivery
✅ Free tier (~25GB/month)

## Need Help?
- [Cloudinary Docs](https://cloudinary.com/documentation)
- [Upload Presets](https://cloudinary.com/documentation/upload_presets)
