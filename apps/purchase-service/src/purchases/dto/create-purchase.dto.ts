import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, Min, ValidateIf } from 'class-validator';

// ₦100,000,000 (100,000,000 * 100 kobo) — a generous ceiling for a single purchase that still
// rejects obviously malformed/overflowing input (e.g. typos adding extra digits) before it hits the DB.
const MAX_AMOUNT_KOBO = 100_000_000_00;

export class CreatePurchaseDto {
  @ApiProperty({ example: 'usr_amc5k2n9xq01' })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ example: 'customer@getbumpa.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Amina Bello' })
  @IsString()
  name!: string;

  @ApiProperty({ example: '0123456789', required: false })
  @IsOptional()
  @IsString()
  @ValidateIf((dto) => dto.bankAccountNumber !== undefined)
  @Matches(/^\d{10}$/, { message: 'bankAccountNumber must be a 10-digit NUBAN account number' })
  bankAccountNumber?: string;

  @ApiProperty({ example: '058', required: false })
  @IsOptional()
  @IsString()
  @ValidateIf((dto) => dto.bankCode !== undefined)
  @Matches(/^\d{3,6}$/, { message: 'bankCode must be a 3-6 digit numeric bank code' })
  bankCode?: string;

  @ApiProperty({ example: 500000 })
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_KOBO)
  amountKobo!: number;
}
