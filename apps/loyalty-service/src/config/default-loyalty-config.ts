import type { AchievementRule } from '../rules/rule.types';

export interface AchievementSeed {
  id: string;
  name: string;
  description: string;
  groupKey: string;
  sortOrder: number;
  rule: AchievementRule;
  imageUrl?: string;
}

export interface BadgeSeed {
  id: string;
  name: string;
  description: string;
  sortOrder: number;
  requiredAchievementCount: number;
  requiredAchievementIds?: string[];
  rewardAmountKobo?: number;
  rewardCurrency?: string;
  imageUrl?: string;
}

export const DEFAULT_ACHIEVEMENTS: AchievementSeed[] = [
  {
    id: 'ach_first_purchase',
    name: 'First Purchase',
    description: 'Make your first purchase and start your Bumpa loyalty journey.',
    groupKey: 'purchases',
    sortOrder: 1,
    imageUrl: 'https://placehold.co/512x512/png?text=First+Purchase',
    rule: { type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 1 },
  },
  {
    id: 'ach_5_purchases',
    name: '5 Purchases',
    description: 'Complete 5 purchases on Bumpa.',
    groupKey: 'purchases',
    sortOrder: 2,
    imageUrl: 'https://placehold.co/512x512/png?text=5+Purchases',
    rule: { type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 5 },
  },
  {
    id: 'ach_10_purchases',
    name: '10 Purchases',
    description: 'Complete 10 purchases and prove consistent buying activity.',
    groupKey: 'purchases',
    sortOrder: 3,
    imageUrl: 'https://placehold.co/512x512/png?text=10+Purchases',
    rule: { type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 10 },
  },
  {
    id: 'ach_big_spender',
    name: 'Big Spender',
    description: 'Spend at least 100,000 Naira in total purchases.',
    groupKey: 'spend',
    sortOrder: 1,
    imageUrl: 'https://placehold.co/512x512/png?text=Big+Spender',
    rule: { type: 'SUM', field: 'total_spend_kobo', operator: 'GTE', value: 10000000 },
  },
  {
    id: 'ach_loyal_shopper',
    name: 'Loyal Shopper',
    description: 'Complete 5 purchases, spend at least 25,000 Naira, and unlock the key purchase milestones.',
    groupKey: 'milestones',
    sortOrder: 1,
    imageUrl: 'https://placehold.co/512x512/png?text=Loyal+Shopper',
    rule: {
      type: 'COMBINATION',
      operator: 'AND',
      rules: [
        { type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 5 },
        { type: 'SUM', field: 'total_spend_kobo', operator: 'GTE', value: 2500000 },
        { type: 'ACHIEVEMENT_SET', achievementIds: ['ach_first_purchase', 'ach_5_purchases'] },
      ],
    },
  },
  {
    id: 'ach_power_customer',
    name: 'Power Customer',
    description: 'Unlock at least 4 major achievement milestones.',
    groupKey: 'milestones',
    sortOrder: 2,
    imageUrl: 'https://placehold.co/512x512/png?text=Power+Customer',
    rule: {
      type: 'ACHIEVEMENT_SET',
      achievementIds: ['ach_first_purchase', 'ach_5_purchases', 'ach_10_purchases', 'ach_big_spender', 'ach_loyal_shopper'],
      minRequired: 4,
    },
  },
];

export const DEFAULT_BADGES: BadgeSeed[] = [
  {
    id: 'bdg_beginner',
    name: 'Beginner',
    description: 'Awarded after the customer makes their first purchase.',
    sortOrder: 1,
    requiredAchievementCount: 1,
    requiredAchievementIds: ['ach_first_purchase'],
    rewardAmountKobo: 30000,
    rewardCurrency: 'NGN',
    imageUrl: 'https://placehold.co/512x512/png?text=Beginner',
  },
  {
    id: 'bdg_intermediate',
    name: 'Intermediate',
    description: 'Awarded after the customer completes core purchase loyalty milestones.',
    sortOrder: 2,
    requiredAchievementCount: 3,
    requiredAchievementIds: ['ach_first_purchase', 'ach_5_purchases', 'ach_loyal_shopper'],
    rewardAmountKobo: 30000,
    rewardCurrency: 'NGN',
    imageUrl: 'https://placehold.co/512x512/png?text=Intermediate',
  },
  {
    id: 'bdg_advanced',
    name: 'Advanced',
    description: 'Awarded to high-value customers with strong purchase and spend history.',
    sortOrder: 3,
    requiredAchievementCount: 5,
    requiredAchievementIds: [
      'ach_first_purchase',
      'ach_5_purchases',
      'ach_10_purchases',
      'ach_big_spender',
      'ach_loyal_shopper',
    ],
    rewardAmountKobo: 30000,
    rewardCurrency: 'NGN',
    imageUrl: 'https://placehold.co/512x512/png?text=Advanced',
  },
  {
    id: 'bdg_elite',
    name: 'Elite',
    description: 'Awarded to top customers who complete every configured loyalty milestone.',
    sortOrder: 4,
    requiredAchievementCount: 6,
    requiredAchievementIds: [
      'ach_first_purchase',
      'ach_5_purchases',
      'ach_10_purchases',
      'ach_big_spender',
      'ach_loyal_shopper',
      'ach_power_customer',
    ],
    rewardAmountKobo: 30000,
    rewardCurrency: 'NGN',
    imageUrl: 'https://placehold.co/512x512/png?text=Elite',
  },
];
