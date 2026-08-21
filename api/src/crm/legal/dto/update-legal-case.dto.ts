import { PartialType } from '@nestjs/mapped-types';
import { CreateLegalCaseDto } from './create-legal-case.dto';

export class UpdateLegalCaseDto extends PartialType(CreateLegalCaseDto) {}
