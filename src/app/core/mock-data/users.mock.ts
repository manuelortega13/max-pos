import { User } from '../models';

export const USERS_MOCK: User[] = [
  { id: 'u1', name: 'System Admin', email: 'admin@maxpos.com', role: 'admin', active: true, createdAt: '2025-01-10' },
  { id: 'u2', name: 'Manuel Ortega', email: 'manuel.ortega@synacy.com', role: 'admin', active: true, createdAt: '2025-02-15' },
  { id: 'u3', name: 'Sarah Chen', email: 'sarah.chen@maxpos.com', role: 'cashier', active: true, createdAt: '2025-03-01' },
  { id: 'u4', name: 'Carlos Rivera', email: 'carlos.rivera@maxpos.com', role: 'cashier', active: true, createdAt: '2025-03-15' },
  { id: 'u5', name: 'Priya Patel', email: 'priya.patel@maxpos.com', role: 'cashier', active: true, createdAt: '2025-04-02' },
  { id: 'u6', name: 'Ana Gomez', email: 'ana.gomez@maxpos.com', role: 'cashier', active: false, createdAt: '2024-11-20' },
];

export const CURRENT_CASHIER_ID = 'u3';
