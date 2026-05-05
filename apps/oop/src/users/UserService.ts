import type { DbUser, PublicUser, UserToSave } from './UserTypes';
import type { UserRepository } from './UserRepository';

export interface IPasswordService {
  hash(plain: string): Promise<string>;
  compare(plain: string, hashed: string): Promise<boolean>;
}

export interface ITokenService {
  sign(payload: { userId: string; email: string }): string;
}

type RegisterDto = { name: string; surname: string; email: string; password: string };
type LoginDto = { email: string; password: string };
type AuthResult = { user: PublicUser; token: string };

const toPublicUser = ({ password, ...rest }: DbUser): PublicUser => rest;

export class UserService {
  constructor(
    private userRepository: Pick<UserRepository, 'findByEmail' | 'save'>,
    private passwordService: IPasswordService,
    private tokenService: ITokenService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.userRepository.findByEmail(dto.email);
    if (existing) throw new Error('UserAlreadyExists');

    const hashed = await this.passwordService.hash(dto.password);
    const saved = await this.userRepository.save({ ...dto, password: hashed } as UserToSave);
    const token = this.tokenService.sign({ userId: String(saved.id), email: saved.email });

    return { user: toPublicUser(saved), token };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) throw new Error('InvalidCredentials');

    const isValid = await this.passwordService.compare(dto.password, user.password);
    if (!isValid) throw new Error('InvalidCredentials');

    const token = this.tokenService.sign({ userId: String(user.id), email: user.email });

    return { user: toPublicUser(user), token };
  }
}
