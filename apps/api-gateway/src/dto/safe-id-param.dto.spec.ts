import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AchievementIdParamDto, BadgeIdParamDto, UserIdParamDto } from './safe-id-param.dto';

describe('safe id param DTOs', () => {
  it('accepts a safe alphanumeric id', async () => {
    const dto = plainToInstance(UserIdParamDto, { userId: 'usr_amc5k2n9xq01' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it.each(['../etc/passwd', 'abc/def', 'id?x=1', 'id#frag', 'id with space'])(
    'rejects a userId path segment containing unsafe characters: %s',
    async (unsafeId) => {
      const dto = plainToInstance(UserIdParamDto, { userId: unsafeId });
      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'userId')).toBe(true);
    },
  );

  it('rejects an unsafe achievement id param', async () => {
    const dto = plainToInstance(AchievementIdParamDto, { id: 'ach/../secret' });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'id')).toBe(true);
  });

  it('rejects an unsafe badge id param', async () => {
    const dto = plainToInstance(BadgeIdParamDto, { id: 'bdg?admin=true' });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'id')).toBe(true);
  });

  it('accepts a safe badge id param', async () => {
    const dto = plainToInstance(BadgeIdParamDto, { id: 'bdg_elite-01' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
