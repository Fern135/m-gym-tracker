/**
 * @file NumberField.tsx
 * @description Numeric text input that keeps the raw text while typing
 * (so "62." isn't snapped to "62") and reports the parsed number.
 */
import { useState } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { TextInput } from 'react-native-paper';
import { parseNum } from '../lib/workout';

type Props = {
  label: string;
  value: number | null;
  onChange: (n: number | null) => void;
  integer?: boolean;
  /** Unit shown inside the field, e.g. "lbs". */
  suffix?: string;
  style?: StyleProp<TextStyle>;
  dense?: boolean;
};

/**
 * Number input. Its text is seeded from `value` on mount; give it a `key` to reseed.
 * @param props - Label, value, change handler and options
 * @returns The input
 */
export function NumberField({ label, value, onChange, integer, suffix, style, dense }: Props) {
  const [text, setText] = useState(value === null ? '' : String(value));
  return (
    <TextInput
      mode="outlined"
      dense={dense}
      label={label}
      value={text}
      keyboardType={integer ? 'number-pad' : 'decimal-pad'}
      onChangeText={(t) => { setText(t); onChange(parseNum(t, integer)); }}
      right={suffix ? <TextInput.Affix text={suffix} /> : undefined}
      style={style}
      selectTextOnFocus
    />
  );
}
