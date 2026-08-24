import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  Matches,
  IsBoolean,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  @Matches(/^[a-zA-Z0-9._%+-]+@mathionix\.com$/, {
    message: 'Security Pulse: Only @mathionix.com email addresses are allowed.',
  })
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsString()
  @IsOptional()
  role?: string;

  @IsString()
  @IsOptional()
  profileImage?: string;

  @IsOptional()
  permissions?: string[];

  @IsOptional()
  permittedTools?: string[];

  @IsOptional()
  crmPermissions?: string[];

  @IsOptional()
  pmProjects?: string[];

  @IsOptional()
  pmSpaces?: string[];

  @IsOptional()
  pmPermissions?: string[];

  @IsString()
  @IsOptional()
  assignedLeadsPipeline?: string;

  @IsOptional()
  accessibleEmailAccounts?: string[];

  @IsOptional()
  salesWorkspaceAccessibleEmployees?: string[];

  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @IsBoolean()
  useRoleOverrides?: boolean;

  /** Manager/Team Lead this user reports to — RBAC/workspace-isolation "my team" scope. */
  @IsOptional()
  @IsString()
  reportsTo?: string | null;
}
