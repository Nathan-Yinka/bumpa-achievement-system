import request from 'supertest';
import { PaymentStatus } from '@bumpa/events-sdk';

interface ApiEnvelope<TData> {
  success: boolean;
  statusCode: number;
  data: TData;
}

interface HealthResponse {
  status: 'ok';
  service: string;
}

interface PurchaseResponse {
  purchaseId: string;
}

interface AchievementState {
  unlocked_achievements: string[];
  next_available_achievements: string[];
  current_badge: string;
  next_badge: string;
  remaining_to_unlock_next_badge: number;
}

interface CashbackTransactionResponse {
  id: string;
  userId: string;
  badgeName: string;
  amountKobo: number;
  status: PaymentStatus;
  provider: string;
}

const gatewayUrl = process.env.E2E_GATEWAY_URL ?? 'http://localhost:3000';

describe('Bumpa achievement system e2e', () => {
  jest.setTimeout(90000);

  beforeAll(async () => {
    await waitFor(async () => getEnvelope<HealthResponse>('/health'), (body) => body.data.status === 'ok', 60000);
  });

  it('processes purchase, achievement, badge, and cashback flow through Docker services', async () => {
    const userId = `usr_e2e_${Date.now()}`;
    const email = `${userId}@getbumpa.com`;

    const initialState = await getEnvelope<AchievementState>(`/users/${userId}/achievements`);
    expect(initialState.data).toMatchObject({
      unlocked_achievements: [],
      current_badge: '',
      next_badge: 'Beginner',
      remaining_to_unlock_next_badge: 1,
    });
    expect(initialState.data.next_available_achievements).toEqual(
      expect.arrayContaining(['First Purchase', 'Big Spender']),
    );

    for (let index = 0; index < 5; index += 1) {
      const purchase = await request(gatewayUrl)
        .post('/purchases')
        .send({
          userId,
          email,
          name: 'E2E Customer',
          bankAccountNumber: '0123456789',
          bankCode: '058',
          amountKobo: 500000,
        })
        .expect(201);
      const body = purchase.body as ApiEnvelope<PurchaseResponse>;
      expect(body.success).toBe(true);
      expect(body.data.purchaseId).toMatch(/^pur_/);
    }

    const achievementState = await waitFor(
      async () => getEnvelope<AchievementState>(`/users/${userId}/achievements`),
      (body) =>
        body.data.unlocked_achievements.includes('First Purchase') &&
        body.data.unlocked_achievements.includes('5 Purchases'),
      60000,
    );

    expect(achievementState.data.current_badge).toBe('Beginner');
    expect(achievementState.data.next_badge).toBe('Intermediate');
    expect(achievementState.data.remaining_to_unlock_next_badge).toBe(1);
    expect(achievementState.data.next_available_achievements).toEqual(
      expect.arrayContaining(['10 Purchases', 'Big Spender']),
    );

    const cashbacks = await waitFor(
      async () => getEnvelope<CashbackTransactionResponse[]>('/cashbacks'),
      (body) =>
        body.data.some(
          (transaction) =>
            transaction.userId === userId &&
            transaction.badgeName === 'Beginner' &&
            transaction.amountKobo === 30000 &&
            transaction.status === PaymentStatus.Successful,
        ),
      60000,
    );

    expect(cashbacks.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId,
          badgeName: 'Beginner',
          amountKobo: 30000,
          status: PaymentStatus.Successful,
        }),
      ]),
    );
  });
});

async function getEnvelope<TData>(path: string): Promise<ApiEnvelope<TData>> {
  const response = await request(gatewayUrl).get(path).expect(200);
  return response.body as ApiEnvelope<TData>;
}

async function waitFor<TData>(
  action: () => Promise<TData>,
  predicate: (result: TData) => boolean,
  timeoutMs: number,
): Promise<TData> {
  const startedAt = Date.now();
  let lastResult: TData | undefined;

  while (Date.now() - startedAt < timeoutMs) {
    lastResult = await action();
    if (predicate(lastResult)) {
      return lastResult;
    }
    await delay(500);
  }

  throw new Error(`Timed out waiting for e2e condition. Last result: ${JSON.stringify(lastResult)}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
