import type { AchievementRule } from '../rules/rule.types';

export interface AchievementSeed {
  id: string;
  name: string;
  groupKey: string;
  sortOrder: number;
  rule: AchievementRule;
  imageUrl?: string;
}

export interface BadgeSeed {
  id: string;
  name: string;
  sortOrder: number;
  requiredAchievementCount: number;
  imageUrl?: string;
}

export const DEFAULT_ACHIEVEMENTS: AchievementSeed[] = [
  {
    id: 'ach_first_purchase',
    name: 'First Purchase',
    groupKey: 'purchases',
    sortOrder: 1,
    imageUrl: 'https://placehold.co/512x512/png?text=First+Purchase',
    rule: { type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 1 },
  },
  {
    id: 'ach_5_purchases',
    name: '5 Purchases',
    groupKey: 'purchases',
    sortOrder: 2,
    imageUrl: 'https://placehold.co/512x512/png?text=5+Purchases',
    rule: { type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 5 },
  },
  {
    id: 'ach_10_purchases',
    name: '10 Purchases',
    groupKey: 'purchases',
    sortOrder: 3,
    imageUrl: 'https://placehold.co/512x512/png?text=10+Purchases',
    rule: { type: 'COUNT', field: 'purchase_count', operator: 'GTE', value: 10 },
  },
  {
    id: 'ach_big_spender',
    name: 'Big Spender',
    groupKey: 'spend',
    sortOrder: 1,
    imageUrl: 'https://placehold.co/512x512/png?text=Big+Spender',
    rule: { type: 'SUM', field: 'total_spend_kobo', operator: 'GTE', value: 10000000 },
  },
];

export const DEFAULT_BADGES: BadgeSeed[] = [
  {
    id: 'bdg_beginner',
    name: 'Beginner',
    sortOrder: 1,
    requiredAchievementCount: 1,
    imageUrl: 'https://placehold.co/512x512/png?text=Beginner',
  },
  {
    id: 'bdg_intermediate',
    name: 'Intermediate',
    sortOrder: 2,
    requiredAchievementCount: 3,
    imageUrl: 'https://placehold.co/512x512/png?text=Intermediate',
  },
  {
    id: 'bdg_advanced',
    name: 'Advanced',
    sortOrder: 3,
    requiredAchievementCount: 5,
    imageUrl: 'https://placehold.co/512x512/png?text=Advanced',
  },
];
