import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class CopilotHistoryItem {
  @IsString()
  role!: 'user' | 'assistant';

  @IsString()
  content!: string;
}

export class QuerySalesCopilotDto {
  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CopilotHistoryItem)
  history?: CopilotHistoryItem[];
}
