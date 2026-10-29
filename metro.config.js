// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);
// changelog.md ships with the app as a file, shown under Settings > What's new.
config.resolver.assetExts.push('md');

module.exports = config;
