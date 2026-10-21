import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
  ValidateBy,
} from 'class-validator';

function IsBcryptPassword(): PropertyDecorator {
  return ValidateBy({
    name: 'isBcryptPassword',
    validator: {
      validate(value: unknown) {
        if (typeof value !== 'string') return false;
        const encoded = Buffer.from(value, 'utf8');
        return encoded.length <= 72 && encoded.toString('utf8') === value;
      },
      defaultMessage: () =>
        'Password must be valid Unicode and at most 72 UTF-8 bytes',
    },
  });
}

class EmailDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class SignUpDto extends EmailDto {
  @IsString()
  @MinLength(8)
  @IsBcryptPassword()
  password!: string;
}

export class LoginDto extends EmailDto {
  @IsString()
  @MinLength(1)
  @IsBcryptPassword()
  password!: string;
}
