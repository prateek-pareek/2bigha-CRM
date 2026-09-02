import { IsIn, IsOptional, IsString } from 'class-validator';

export class AssignPmStaffDto {
  @IsIn(['manager', 'legal', 'field'])
  role: 'manager' | 'legal' | 'field';

  @IsIn(['twobigha', 'crm'])
  source: 'twobigha' | 'crm';

  @IsString()
  id: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class UnassignPmStaffDto {
  @IsIn(['manager', 'legal', 'field'])
  role: 'manager' | 'legal' | 'field';
}
