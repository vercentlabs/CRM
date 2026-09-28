import type { Customer, Lead, Member, Opportunity } from '@crm/types';

let seq = 100;

export const lead = (overrides: Partial<Lead> = {}): Lead => ({
  id: ++seq,
  full_name: `Lead ${seq}`,
  mobile_number: '9876543210',
  alternate_number: null,
  email: `lead${seq}@example.test`,
  source: 'website',
  notes: null,
  age: null,
  address: null,
  occupation: null,
  monthly_income: null,
  is_aware_of_digital_gold: false,
  status: 'New',
  next_call_at: null,
  created_by: 10,
  assigned_to: 10,
  location_id: null,
  created_at: '2026-09-01T10:00:00.000Z',
  updated_at: '2026-09-01T10:00:00.000Z',
  assigned_user_name: 'Ana Admin',
  location_name: null,
  ...overrides,
});

export const customer = (overrides: Partial<Customer> = {}): Customer => ({
  id: ++seq,
  name: `Customer ${seq}`,
  email: `c${seq}@example.test`,
  phone: null,
  address: null,
  assigned_to: 10,
  created_by: 10,
  created_at: '2026-09-01T10:00:00.000Z',
  updated_at: '2026-09-01T10:00:00.000Z',
  ...overrides,
});

export const opportunity = (overrides: Partial<Opportunity> = {}): Opportunity => ({
  id: ++seq,
  lead_id: 1,
  title: `Deal ${seq}`,
  description: null,
  value: '5000',
  stage: 'Prospecting',
  probability: 20,
  expected_close_date: null,
  created_by: 10,
  assigned_to: 10,
  created_at: '2026-09-01T10:00:00.000Z',
  updated_at: '2026-09-01T10:00:00.000Z',
  lead_name: 'Lead One',
  lead_email: null,
  assigned_to_name: 'Ana Admin',
  ...overrides,
});

export const member = (overrides: Partial<Member> = {}): Member => ({
  id: ++seq,
  full_name: `Member ${seq}`,
  email: `m${seq}@example.test`,
  username: `m${seq}`,
  role_key: 'sales',
  role_name: 'Sales',
  membership_id: seq,
  membership_status: 'active',
  is_active: true,
  ...overrides,
});
