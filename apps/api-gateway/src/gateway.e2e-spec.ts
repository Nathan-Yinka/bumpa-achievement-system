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

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface Paginated<TItem> {
  items: TItem[];
  meta: PaginationMeta;
}

interface ErrorEnvelope {
  success: boolean;
  statusCode: number;
  error: string;
  message: string;
}

interface AchievementGroupResponse {
  key: string;
  name: string;
  sortOrder: number;
}

interface AchievementConfigResponse {
  id: string;
  name: string;
  groupKey: string;
  sortOrder: number;
  active: boolean;
}

interface BadgeConfigResponse {
  id: string;
  name: string;
  sortOrder: number;
  requiredAchievementCount: number;
  active: boolean;
}

const gatewayUrl = process.env.E2E_GATEWAY_URL ?? 'http://localhost:3000';
const apiKey = process.env.E2E_ADMIN_API_KEY ?? 'bumpa-local-admin-key';

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

    expect(achievementState.data.unlocked_achievements).toEqual(
      expect.arrayContaining(['First Purchase', '5 Purchases', 'Loyal Shopper']),
    );
    expect(achievementState.data.current_badge).toBe('Intermediate');
    expect(achievementState.data.next_badge).toBe('Advanced');
    expect(achievementState.data.remaining_to_unlock_next_badge).toBe(2);
    expect(achievementState.data.next_available_achievements).toEqual(
      expect.arrayContaining(['10 Purchases', 'Big Spender']),
    );

    const cashbacks = await waitFor(
      async () => getAdminEnvelope<Paginated<CashbackTransactionResponse>>(`/cashbacks?userId=${userId}`),
      (body) =>
        body.data.items.some(
          (transaction) =>
            transaction.userId === userId &&
            transaction.badgeName === 'Beginner' &&
            transaction.amountKobo === 30000 &&
            transaction.status === PaymentStatus.Successful,
        ),
      60000,
    );

    expect(cashbacks.data.items).toEqual(
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

  it('rejects admin and cashback requests without a valid x-api-key', async () => {
    await request(gatewayUrl).get('/admin/achievements').expect(401);
    await request(gatewayUrl).get('/cashbacks').expect(401);
    await request(gatewayUrl).get('/admin/achievements').set('x-api-key', 'wrong-key').expect(401);
  });

  it('routes Paystack webhooks through the gateway to cashback signature verification', async () => {
    const response = await request(gatewayUrl)
      .post('/webhooks/paystack')
      .send({ event: 'transfer.success', data: { reference: 'ref_unsigned' } })
      .expect(401);

    const body = response.body as ErrorEnvelope;
    expect(body.success).toBe(false);
    expect(body.message).toEqual(expect.stringContaining('signature'));
  });

  it('returns a 404 for an unknown route', async () => {
    await request(gatewayUrl).get('/this-route-does-not-exist').expect(404);
  });

  it('rejects a purchase missing required fields with a clean error envelope', async () => {
    const response = await request(gatewayUrl)
      .post('/purchases')
      .send({ userId: 'usr_missing_fields' })
      .expect(400);

    const body = response.body as ErrorEnvelope;
    expect(body.success).toBe(false);
    expect(body.statusCode).toBe(400);
    expect(body.message).toEqual(expect.stringContaining('amountKobo'));
  });

  it('rejects a purchase with amountKobo below the minimum', async () => {
    await request(gatewayUrl)
      .post('/purchases')
      .send({ userId: 'usr_bad_amount', email: 'bad@getbumpa.com', name: 'Bad', amountKobo: 0 })
      .expect(400);
  });

  it('rejects a purchase with an invalid email', async () => {
    await request(gatewayUrl)
      .post('/purchases')
      .send({ userId: 'usr_bad_email', email: 'not-an-email', name: 'Bad', amountKobo: 1000 })
      .expect(400);
  });

  it('rejects a purchase with an unknown extra field', async () => {
    await request(gatewayUrl)
      .post('/purchases')
      .send({ userId: 'usr_extra', email: 'extra@getbumpa.com', name: 'Extra', amountKobo: 1000, hacker: true })
      .expect(400);
  });

  it('forwards x-idempotency-key through the gateway so a repeat request does not create a duplicate purchase', async () => {
    const idempotencyKey = `idem_e2e_${Date.now()}`;
    const userId = `usr_idem_e2e_${Date.now()}`;
    const body = { userId, email: `${userId}@getbumpa.com`, name: 'Idempotency Test', amountKobo: 500000 };

    const first = await request(gatewayUrl).post('/purchases').set('x-idempotency-key', idempotencyKey).send(body).expect(201);
    const second = await request(gatewayUrl).post('/purchases').set('x-idempotency-key', idempotencyKey).send(body).expect(201);

    expect((second.body as ApiEnvelope<PurchaseResponse>).data.purchaseId).toBe(
      (first.body as ApiEnvelope<PurchaseResponse>).data.purchaseId,
    );
  });

  it('returns an empty achievement state for a user who has never purchased anything', async () => {
    const state = await getEnvelope<AchievementState>(`/users/usr_never_purchased_${Date.now()}/achievements`);
    expect(state.data.unlocked_achievements).toEqual([]);
    expect(state.data.current_badge).toBe('');
    expect(state.data.next_badge).toBe('Beginner');
  });

  it('supports the full achievement/badge admin CRUD lifecycle', async () => {
    const suffix = Date.now();
    const groupKey = `e2e_${suffix}`;
    const achievementId = `ach_e2e_${suffix}`;
    const badgeId = `bdg_e2e_${suffix}`;

    // groupKey is a real foreign key now — the group has to exist before an achievement can
    // reference it.
    await request(gatewayUrl)
      .post('/admin/achievement-groups')
      .set('x-api-key', apiKey)
      .send({ key: groupKey, name: 'E2E Group' })
      .expect(201);

    const createdAchievement = await request(gatewayUrl)
      .post('/admin/achievements')
      .set('x-api-key', apiKey)
      .send({
        id: achievementId,
        name: `E2E Achievement ${suffix}`,
        description: 'Created by the e2e suite.',
        groupKey,
        sortOrder: 1,
        rule: { type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 100 },
        active: true,
      })
      .expect(201);
    expect((createdAchievement.body as ApiEnvelope<AchievementConfigResponse>).data.id).toBe(achievementId);

    const listedAchievements = await getAdminEnvelope<Paginated<AchievementConfigResponse>>(
      `/admin/achievements?search=${encodeURIComponent(`E2E Achievement ${suffix}`)}`,
    );
    expect(listedAchievements.data.items.some((achievement) => achievement.id === achievementId)).toBe(true);
    expect(listedAchievements.data.meta).toMatchObject({ page: 1, limit: 20, total: 1, totalPages: 1 });

    const updatedAchievement = await request(gatewayUrl)
      .patch(`/admin/achievements/${achievementId}`)
      .set('x-api-key', apiKey)
      .send({ active: false })
      .expect(200);
    expect((updatedAchievement.body as ApiEnvelope<AchievementConfigResponse>).data.active).toBe(false);

    const createdBadge = await request(gatewayUrl)
      .post('/admin/badges')
      .set('x-api-key', apiKey)
      .send({
        id: badgeId,
        name: `E2E Badge ${suffix}`,
        description: 'Created by the e2e suite.',
        sortOrder: 99,
        requiredAchievementCount: 1,
        requiredAchievementIds: [achievementId],
        active: true,
      })
      .expect(201);
    expect((createdBadge.body as ApiEnvelope<BadgeConfigResponse>).data.id).toBe(badgeId);

    const listedBadges = await getAdminEnvelope<Paginated<BadgeConfigResponse>>('/admin/badges?limit=5&page=1');
    expect(listedBadges.data.items.some((badge) => badge.id === badgeId)).toBe(true);
    expect(listedBadges.data.meta.limit).toBe(5);

    const updatedBadge = await request(gatewayUrl)
      .patch(`/admin/badges/${badgeId}`)
      .set('x-api-key', apiKey)
      .send({ requiredAchievementCount: 2 })
      .expect(200);
    expect((updatedBadge.body as ApiEnvelope<BadgeConfigResponse>).data.requiredAchievementCount).toBe(2);

    const catalog = await getAdminEnvelope<{
      groups: AchievementGroupResponse[];
      achievements: AchievementConfigResponse[];
      badges: BadgeConfigResponse[];
    }>('/admin/catalog');
    expect(catalog.data.groups.some((group) => group.key === groupKey)).toBe(true);
    expect(catalog.data.achievements.some((achievement) => achievement.id === achievementId)).toBe(true);
    expect(catalog.data.badges.some((badge) => badge.id === badgeId)).toBe(true);
  });

  it('supports the achievement-group lifecycle and rejects an achievement referencing an unknown group', async () => {
    const suffix = Date.now();
    const groupKey = `e2e_groups_${suffix}`;

    const created = await request(gatewayUrl)
      .post('/admin/achievement-groups')
      .set('x-api-key', apiKey)
      .send({ key: groupKey, name: 'E2E Groups Test' })
      .expect(201);
    expect((created.body as ApiEnvelope<AchievementGroupResponse>).data.key).toBe(groupKey);

    const listed = await getAdminEnvelope<AchievementGroupResponse[]>('/admin/achievement-groups');
    expect(listed.data.some((group) => group.key === groupKey)).toBe(true);

    const updated = await request(gatewayUrl)
      .patch(`/admin/achievement-groups/${groupKey}`)
      .set('x-api-key', apiKey)
      .send({ name: 'E2E Groups Test (renamed)' })
      .expect(200);
    expect((updated.body as ApiEnvelope<AchievementGroupResponse>).data.name).toBe('E2E Groups Test (renamed)');

    // The actual point of the FK: an achievement can't reference a group that was never created.
    const rejected = await request(gatewayUrl)
      .post('/admin/achievements')
      .set('x-api-key', apiKey)
      .send({
        id: `ach_bad_group_${suffix}`,
        name: 'Bad Group',
        description: 'Should be rejected.',
        groupKey: `does_not_exist_${suffix}`,
        sortOrder: 1,
        rule: { type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 1 },
        active: true,
      })
      .expect(400);
    expect((rejected.body as ErrorEnvelope).message).toContain('unknown achievement group');
  });

  it('rejects an achievement with a malformed rule instead of silently accepting it', async () => {
    const response = await request(gatewayUrl)
      .post('/admin/achievements')
      .set('x-api-key', apiKey)
      .send({
        id: `ach_bad_rule_${Date.now()}`,
        name: 'Bad Rule',
        description: 'Should be rejected.',
        groupKey: 'purchases', // a real, seeded group — this test is about the rule, not groupKey
        sortOrder: 1,
        rule: { type: 'NONSENSE', foo: 'bar' },
        active: true,
      })
      .expect(400);

    expect((response.body as ErrorEnvelope).success).toBe(false);
  });

  it('rejects a badge that references a nonexistent achievement id', async () => {
    await request(gatewayUrl)
      .post('/admin/badges')
      .set('x-api-key', apiKey)
      .send({
        id: `bdg_bad_ref_${Date.now()}`,
        name: 'Bad Reference Badge',
        description: 'Should be rejected.',
        sortOrder: 1,
        requiredAchievementCount: 1,
        requiredAchievementIds: ['ach_does_not_exist'],
        active: true,
      })
      .expect(400);
  });

  it('resumes a FAILED cashback transaction via the retry endpoint once bank details are supplied', async () => {
    const userId = `usr_e2e_retry_${Date.now()}`;

    // No bank details supplied, so the badge unlocks but the payout fails immediately.
    await request(gatewayUrl)
      .post('/purchases')
      .send({ userId, email: `${userId}@getbumpa.com`, name: 'Retry Customer', amountKobo: 500000 })
      .expect(201);

    const failedList = await waitFor(
      async () => getAdminEnvelope<Paginated<CashbackTransactionResponse>>(`/cashbacks?userId=${userId}&status=FAILED`),
      (body) => body.data.items.length > 0,
      60000,
    );
    const failedTransaction = failedList.data.items[0];
    expect(failedTransaction.status).toBe(PaymentStatus.Failed);

    await request(gatewayUrl)
      .post(`/cashbacks/${failedTransaction.id}/retry`)
      .set('x-api-key', apiKey)
      .send({ bankAccountNumber: '0123456789', bankCode: '058' })
      .expect(202);

    await waitFor(
      async () => getAdminEnvelope<Paginated<CashbackTransactionResponse>>(`/cashbacks?userId=${userId}&status=SUCCESSFUL`),
      (body) => body.data.items.some((transaction) => transaction.id === failedTransaction.id),
      60000,
    );
  });
});

async function getEnvelope<TData>(path: string): Promise<ApiEnvelope<TData>> {
  const response = await request(gatewayUrl).get(path).expect(200);
  return response.body as ApiEnvelope<TData>;
}

async function getAdminEnvelope<TData>(path: string): Promise<ApiEnvelope<TData>> {
  const response = await request(gatewayUrl).get(path).set('x-api-key', apiKey).expect(200);
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
