import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreatePurchaseDto {
  @ApiProperty({ example: 'usr_amc5k2n9xq01' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  userId!: string;

  @ApiProperty({ example: 'oludarenathaniel@gmail.com' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ example: 'Nathaniel Adeyinka Oludare' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: '2152454812', required: false })
  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @ApiProperty({ example: '033', required: false })
  @IsOptional()
  @IsString()
  bankCode?: string;

  @ApiProperty({ example: 500000 })
  @IsInt()
  @Min(1)
  amountKobo!: number;
}
