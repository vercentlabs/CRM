import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

type InputProps = TextInputProps & {
  label?: string;
  helperText?: string;
  error?: string;
  rightIcon?: React.ReactNode;
  onRightPress?: () => void;
};

const Input = ({ label, helperText, error, rightIcon, onRightPress, style, ...props }: InputProps) => {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View style={styles.container}>
      {label ? <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text> : null}
      <View style={styles.inputWrapper}>
        <TextInput
          {...props}
          placeholderTextColor={colors.mutedForeground}
          style={[
            styles.input,
            {
              backgroundColor: colors.inputBg,
              borderColor: colors.inputBorder,
              color: colors.foreground
            },
            error ? { borderColor: colors.destructive } : null,
            rightIcon ? styles.inputWithIcon : null,
            style as object
          ]}
        />
        {rightIcon ? (
          <Pressable
            onPress={onRightPress}
            style={styles.rightIcon}
            hitSlop={8}
          >
            {rightIcon}
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
      ) : helperText ? (
        <Text style={[styles.helperText, { color: colors.mutedForeground }]}>{helperText}</Text>
      ) : null}
    </View>
  );
};

export default Input;

const styles = StyleSheet.create({
  container: {
    width: '100%'
  },
  inputWrapper: {
    position: 'relative'
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 6
  },
  input: {
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13
  },
  inputWithIcon: {
    paddingRight: 40
  },
  rightIcon: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center'
  },
  helperText: {
    marginTop: 6,
    fontSize: 11
  },
  errorText: {
    marginTop: 6,
    fontSize: 11
  }
});
