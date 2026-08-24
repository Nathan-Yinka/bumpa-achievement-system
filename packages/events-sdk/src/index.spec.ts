import { createDomainEvent, createReadableId, DomainEventName, EntityIdPrefix, EventVersion } from './index';

describe('events-sdk', () => {
  it('creates readable prefixed ids', () => {
    expect(createReadableId(EntityIdPrefix.Purchase)).toMatch(/^pur_[a-z0-9]{12}$/);
  });

  it('creates versioned domain events', () => {
    const event = createDomainEvent(
      DomainEventName.AchievementUnlocked,
      {
        achievement_name: 'First Purchase',
        user: {
          id: 'usr_test_user',
          email: 'customer@getbumpa.com',
          name: 'Customer',
        },
      },
      'corr_test',
      'evt_test',
    );

    expect(event).toMatchObject({
      eventId: 'evt_test',
      type: DomainEventName.AchievementUnlocked,
      version: EventVersion.V1,
      correlationId: 'corr_test',
    });
  });
});
