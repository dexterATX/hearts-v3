// plugins/withReleaseSigning.js — sign release builds with a real key.
//
// The generated app/build.gradle ships `signingConfig signingConfigs.debug`
// inside buildTypes.release, with a comment telling you not to ship that. But
// android/ is CNG-generated and gitignored, so hand-editing it is erased by the
// next `expo prebuild --clean`. This plugin re-applies the change every time.
//
// The key itself lives in credentials/ (gitignored), NOT in this file. If the
// properties file is missing the build falls back to the debug key, so a fresh
// clone still builds rather than failing on a secret it cannot have.
const { withAppBuildGradle } = require('@expo/config-plugins');

const LOADER = `
// injected by plugins/withReleaseSigning.js
def heartsKeystorePropsFile = rootProject.file('../credentials/keystore.properties')
def heartsKeystoreProps = new Properties()
if (heartsKeystorePropsFile.exists()) {
    heartsKeystorePropsFile.withInputStream { heartsKeystoreProps.load(it) }
}

`;

const RELEASE_SIGNING = `        release {
            if (heartsKeystorePropsFile.exists()) {
                storeFile rootProject.file('../credentials/' + heartsKeystoreProps['HEARTS_STORE_FILE'])
                storePassword heartsKeystoreProps['HEARTS_STORE_PASSWORD']
                keyAlias heartsKeystoreProps['HEARTS_KEY_ALIAS']
                keyPassword heartsKeystoreProps['HEARTS_KEY_PASSWORD']
            }
        }
`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;

    if (src.includes('heartsKeystorePropsFile')) return cfg; // already applied

    // 1. load the properties before the android {} block
    src = src.replace(/^android \{/m, `${LOADER}android {`);

    // 2. add a release signingConfig next to the generated debug one
    src = src.replace(
      /(signingConfigs \{\n(?:.*\n)*?        \}\n)/,
      `$1${RELEASE_SIGNING}`,
    );

    // 3. point buildTypes.release at it. Match the generated comment so this
    //    cannot accidentally rewrite buildTypes.debug's identical line.
    src = src.replace(
      /(\/\/ see https:\/\/reactnative\.dev\/docs\/signed-apk-android\.\n\s*)signingConfig signingConfigs\.debug/,
      '$1signingConfig heartsKeystorePropsFile.exists() ? signingConfigs.release : signingConfigs.debug',
    );

    cfg.modResults.contents = src;
    return cfg;
  });
};
