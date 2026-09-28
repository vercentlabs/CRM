import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { LEAD_STATUSES } from '@crm/validation';
import { createApiClient } from '@crm/api-client';

test('jest-expo renders and resolves workspace packages', () => {
  render(<Text>{LEAD_STATUSES.join(',')}</Text>);
  expect(screen.getByText(/New,Contacted/)).toBeTruthy();
  expect(typeof createApiClient).toBe('function');
});
