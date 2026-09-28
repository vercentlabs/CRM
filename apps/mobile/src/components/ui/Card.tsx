import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

type CardProps = {
  children: React.ReactNode;
  style?: object;
};

const Card = ({ children, style }: CardProps) => {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border
        },
        style
      ]}
    >
      {children}
    </View>
  );
};

export default Card;

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#11182b',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1f2645'
  }
});
