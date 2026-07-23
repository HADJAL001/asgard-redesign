module.exports = function (api) {
  const isTest = api.env('test');
  api.cache.using(() => isTest);

  // nativewind pinned to 4.1.23 (see package.json): 4.2.x pulls in
  // react-native-css-interop 0.2.x, which unconditionally injects the
  // "react-native-worklets/plugin" babel plugin (reanimated 4 / RN 0.83+
  // only) and breaks bundling on this project's reanimated 3.16 / RN 0.76.9.
  // Skip nativewind/babel under Jest, where no class transform is needed.
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: isTest ? undefined : 'nativewind' }],
      ...(isTest ? [] : ['nativewind/babel']),
    ],
  };
};
