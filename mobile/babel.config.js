module.exports = function (api) {
  const isTest = api.env('test');
  api.cache.using(() => isTest);

  // nativewind/babel (react-native-css-interop) unconditionally injects the
  // "react-native-worklets/plugin" babel plugin, which requires reanimated 4 /
  // RN 0.83+ and isn't compatible with this project's RN 0.76.9. Skip it under
  // Jest, where no NativeWind class transform is needed for logic-level tests.
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: isTest ? undefined : 'nativewind' }],
      ...(isTest ? [] : ['nativewind/babel']),
    ],
  };
};
