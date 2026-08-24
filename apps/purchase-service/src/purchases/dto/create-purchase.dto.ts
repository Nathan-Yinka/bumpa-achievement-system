import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, Min, ValidateIf } from 'class-validator';

// High but bounded purchase amount in kobo.
const MAX_AMOUNT_KOBO = 100_000_000_00;

export class CreatePurchaseDto {
  @ApiProperty({ example: 'usr_amc5k2n9xq01' })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ example: 'oludarenathaniel@gmail.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Nathaniel Adeyinka Oludare' })
  @IsString()
  name!: string;

  @ApiProperty({ example: '2152454812', required: false })
  @IsOptional()
  @IsString()
  @ValidateIf((dto) => dto.bankAccountNumber !== undefined)
  @Matches(/^\d{10}$/, { message: 'bankAccountNumber must be a 10-digit NUBAN account number' })
  bankAccountNumber?: string;

  @ApiProperty({ example: '033', required: false })
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
