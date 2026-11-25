import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../../core/auth/AuthContext.jsx';
import { USER_STATUS, ROLES } from '../../../core/permissions/permissions.js';
import { DonorsListPage } from './DonorsListPage.jsx';
import { donorService } from '../services/donorService.js';

vi.mock('../services/donorService.js', () => ({
  donorService: { listDonors: vi.fn() },
}));
// The page also reads the funding register for its Agreements / Committed columns.
vi.mock('../../funding-agreements/services/fundingService.js', () => ({
  fundingService: {
    list: vi.fn().mockResolvedValue([
      { key: 'fp-1', profileId: 1, donorId: 1, href: '/funding/1', stage: 'approved', hasSchedule: true, committed: 250000 },
      { key: 'fp-2', profileId: 2, donorId: 1, href: '/funding/2', stage: 'pending', hasSchedule: true, committed: 50000 },
    ]),
  },
}));

function renderPage(user) {
  window.sessionStorage.setItem('zariya.session.v1', JSON.stringify(user));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter>
          <DonorsListPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('DonorsListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it('renders donors from the service with fund source chips', async () => {
    donorService.listDonors.mockResolvedValue([
      {
        id: 1,
        donorCode: 'DNR-001',
        donorName: 'Tata Foundation',
        donorTypeId: 3,
        donorTypeLabel: 'Foundation',
        fundSourceDomicile: 'DOMESTIC',
        fundSourceDomicileLabel: 'Domestic',
        isActive: true,
        email: 'grants@tata.org',
      },
    ]);
    renderPage({ name: 'T', role: ROLES.FINANCE_OFFICER, status: USER_STATUS.APPROVED });

    expect(await screen.findByText('Tata Foundation')).toBeInTheDocument();
    // The fund source chip in the table row ("Domestic" also labels a count in the summary strip).
    expect(within(screen.getByRole('table')).getByText('Domestic')).toBeInTheDocument();
    // Funding from the register: 2 agreements (1 approved), ₹3,00,000 committed.
    const row = within(screen.getByRole('table')).getByText('Tata Foundation').closest('tr');
    expect(await within(row).findByText('₹3,00,000')).toBeInTheDocument();
    expect(within(row).getByText('1 approved')).toBeInTheDocument();
    // Finance officer holds EDIT → the create action is visible.
    expect(screen.getByRole('button', { name: /new donor/i })).toBeInTheDocument();
  }, 20000); // a full MUI table render; slow when the whole suite runs in parallel

  it('hides the create action from view-only roles (CEO)', async () => {
    donorService.listDonors.mockResolvedValue([]);
    renderPage({ name: 'C', role: ROLES.CEO, status: USER_STATUS.APPROVED });

    expect(await screen.findByText(/no donors registered/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new donor/i })).not.toBeInTheDocument();
  });
});
