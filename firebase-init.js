// Firebase initialization (compat SDK for non-module scripts)
// This file is safe to share; the config keys are public by design.
(() => {
  if (!window.firebase || !window.firebase.initializeApp) return;

  const firebaseConfig = window.KAARLIGHT_FIREBASE_CONFIG || {
    apiKey: "AIzaSyDRbPwm5CPavdvkXiy6SKKzEQpd2oh_ths",
    authDomain: "afgjobs-cef9f.firebaseapp.com",
    projectId: "afgjobs-cef9f",
    storageBucket: "afgjobs-cef9f.firebasestorage.app",
    messagingSenderId: "21300041233",
    appId: "1:21300041233:web:9231769b8027105f9703b0"
  };

  window.KAARLIGHT_FIREBASE_CONFIG = firebaseConfig;
  window.firebaseApp = window.firebase.initializeApp(firebaseConfig);
})();
