import React from 'react';
import { registerRootComponent } from 'expo';
import { Text, TextInput, StyleSheet } from 'react-native';

const resolveStylesWithFont = (style: any): any => {
  if (!style) {
    return { fontFamily: 'PlusJakartaSans-Regular' };
  }

  const flattened = StyleSheet.flatten(style) || {};
  if (flattened.fontFamily && flattened.fontFamily !== 'System' && flattened.fontFamily !== 'normal') {
    return style;
  }

  let font = 'PlusJakartaSans-Regular';
  const weight = flattened.fontWeight;
  if (weight === 'bold' || weight === '700' || weight === '800' || weight === '900') {
    font = 'PlusJakartaSans-Bold';
  } else if (weight === '600') {
    font = 'PlusJakartaSans-SemiBold';
  } else if (weight === '500') {
    font = 'PlusJakartaSans-Medium';
  }

  if (Array.isArray(style)) {
    return [...style, { fontFamily: font, fontWeight: 'normal' }];
  }
  return [style, { fontFamily: font, fontWeight: 'normal' }];
};

const ReactNative = require('react-native');

// Wrap Text component globally
const OriginalText = ReactNative.Text;
const CustomText = React.forwardRef((props: any, ref: any) => {
  const newStyle = resolveStylesWithFont(props.style);
  return React.createElement(OriginalText, { ...props, style: newStyle, ref });
});
Object.assign(CustomText, OriginalText);
try {
  Object.defineProperty(ReactNative, 'Text', {
    get: () => CustomText,
    configurable: true
  });
} catch (e) {
  console.warn("Failed to redefine Text getter, falling back to direct assignment:", e);
  ReactNative.Text = CustomText;
}

// Wrap TextInput component globally
const OriginalTextInput = ReactNative.TextInput;
const CustomTextInput = React.forwardRef((props: any, ref: any) => {
  const newStyle = resolveStylesWithFont(props.style);
  return React.createElement(OriginalTextInput, { ...props, style: newStyle, ref });
});
Object.assign(CustomTextInput, OriginalTextInput);
try {
  Object.defineProperty(ReactNative, 'TextInput', {
    get: () => CustomTextInput,
    configurable: true
  });
} catch (e) {
  console.warn("Failed to redefine TextInput getter, falling back to direct assignment:", e);
  ReactNative.TextInput = CustomTextInput;
}

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
