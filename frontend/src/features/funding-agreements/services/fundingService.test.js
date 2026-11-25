import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fundingService } from './fundingService.js';
import { fundingApi } from '../api/fundingApi.js';

vi.mock('../api/fundingApi.js', () => ({
  fundingApi: { statusStep: vi.fn(), list: vi.fn() },
}));

describe('fundingService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends a status step to PATCH /funding/{id}/{step} with who did it', async () => {
    await fundingService.statusStep(419, 'complete', undefined, 'Meera');
    expect(fundingApi.statusStep).toHaveBeenCalledWith(419, 'complete', undefined, 'Meera');
  });

  it('only approve and hold carry remarks', async () => {
    await fundingService.statusStep(419, 'approve', { remarks: 'Checked', approvedBy: 4 }, 'Meera');
    expect(fundingApi.statusStep).toHaveBeenLastCalledWith(419, 'approve', { approvedBy: 4, remarks: 'Checked' }, 'Meera');

    await fundingService.statusStep(419, 'hold', { remarks: 'Paused' }, 'Meera');
    expect(fundingApi.statusStep).toHaveBeenLastCalledWith(419, 'hold', { remarks: 'Paused' }, 'Meera');

    await fundingService.statusStep(419, 'close', { remarks: 'ignored' }, 'Meera');
    expect(fundingApi.statusStep).toHaveBeenLastCalledWith(419, 'close', undefined, 'Meera');
  });

  it('lists a donor’s records through GET /funding?donorId=', async () => {
    fundingApi.list.mockResolvedValue([{ profileId: 5, grantId: 9, profileCode: 'FP-1', stage: 'APPROVED', active: true }]);
    const rows = await fundingService.list({ donorId: 3 });
    expect(fundingApi.list).toHaveBeenCalledWith({ donorId: 3 });
    expect(rows[0]).toEqual(expect.objectContaining({ profileId: 5, grantId: 9, stage: 'approved', active: true }));
  });
});
