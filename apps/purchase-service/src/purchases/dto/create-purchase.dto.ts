import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreatePurchaseDto {
  @ApiProperty({ example: 'usr_amc5k2n9xq01' })
  @IsString()
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
  bankAccountNumber?: string;

  @ApiProperty({ example: '058', required: false })
  @IsOptional()
  @IsString()
  bankCode?: string;

  @ApiProperty({ example: 500000 })
  @IsInt()
  @Min(1)
  amountKobo!: number;
}
