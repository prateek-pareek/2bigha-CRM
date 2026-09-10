import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Deliberately loose: `answers` is keyed by whatever `FormField.key`s the
 * form happens to have, so it can't be a fixed class-validator shape.
 * `FormSubmissionsService.submit` validates required/known keys against the
 * live `FormDefinition` instead.
 */
export class SubmitFormDto {
  @IsObject()
  answers: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  utm?: Record<string, string>;

  /**
   * Honeypot — a field name real visitors never see or fill (the public
   * form page renders it visually hidden). Any non-empty value here means
   * the submission came from a bot filling every field it can find; the
   * public controller acks 200 without processing it further.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  _hp?: string;
}
