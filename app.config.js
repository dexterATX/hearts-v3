// app.config.js — app.json stays the source of truth; this only resolves the
// files that are deliberately NOT in git.
//
// google-services.json carries the FCM api key, so .gitignore keeps it local.
// EAS builds from a git archive, which means the cloud builder never sees it —
// without this, a cloud build silently produces an app with no push at all.
// So on EAS it comes from a file-type environment variable, and locally it
// keeps using the copy sitting next to this file.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
});
