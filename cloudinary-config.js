// Cloudinary configuration for browser-based uploads
// Setup:
// 1) Sign up free at https://cloudinary.com
// 2) Get your Cloud Name from the Dashboard
// 3) Create an unsigned upload preset (Dashboard → Settings → Upload)
// 4) Update the values below
(function () {
  window.CLOUDINARY_CONFIG = {
    cloudName: "dbbp3cusz", // Replace with your Cloudinary cloud name
    uploadPreset: "kaarlight_unsigned", // Create this in your Cloudinary dashboard
    apiBase: "https://api.cloudinary.com/v1_1",
    maxFileSizeMb: 3 // Cloudinary free tier allows up to 100MB, we limit to 3MB
  };
})();
