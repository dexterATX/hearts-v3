// babel.config.js — SDK 54+: babel-preset-expo auto-injects the worklets
// plugin (research §reanimated); nothing manual needed here.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
