import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Contact, ContactDocument } from '../schemas/contact.schema';
import { hasCrmAdminJwtBypass } from '../shared/crm-admin-access.util';
import {
  CONTACT_DUPLICATE_PROJECTION,
  CONTACT_DUPLICATE_SCAN_LIMIT,
  ContactDuplicateIndex,
  ContactDuplicateMatch,
} from '../shared/crm-contact-duplicate.util';
import { DuplicatesService } from './duplicates.service';

/** Max clusters merged by a single bulk request. */
const BULK_MERGE_MAX_GROUPS = 500;

/**
 * Contact duplicate detection (name + email + phone) and merging. Detection is
 * in `crm-contact-duplicate.util`; the merge itself (field back-fill, reference
 * re-pointing, soft delete) lives in `DuplicatesService.mergeContacts`.
 */
@Injectable()
export class ContactDuplicatesService {
  constructor(
    @InjectModel(Contact.name, 'crmConnection')
    private readonly contactModel: Model<ContactDocument>,
    private readonly duplicatesService: DuplicatesService,
  ) {}

  private assertAdmin(actor: unknown, action: string): void {
    if (!hasCrmAdminJwtBypass(actor)) {
      throw new ForbiddenException(`${action} is restricted to administrators.`);
    }
  }

  private async loadIndex(): Promise<{ index: ContactDuplicateIndex; truncated: boolean; scanned: number }> {
    const rows = await this.contactModel
      .find({ converted: { $ne: true } }, CONTACT_DUPLICATE_PROJECTION)
      .sort({ createdAt: 1 })
      .limit(CONTACT_DUPLICATE_SCAN_LIMIT + 1)
      .lean()
      .exec();
    const truncated = rows.length > CONTACT_DUPLICATE_SCAN_LIMIT;
    const slice = truncated ? rows.slice(0, CONTACT_DUPLICATE_SCAN_LIMIT) : rows;
    return { index: new ContactDuplicateIndex(slice as any[]), truncated, scanned: slice.length };
  }

  /** Live check used by the Add Contact form: who already looks like this contact? */
  async check(query: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    mobileNo?: string;
    excludeId?: string;
  }): Promise<{ duplicates: ContactDuplicateMatch[] }> {
    const { index } = await this.loadIndex();
    return {
      duplicates: index.findMatches(
        {
          firstName: query.firstName,
          lastName: query.lastName,
          email: query.email,
          phone: query.phone,
          mobileNo: query.mobileNo,
        },
        query.excludeId ? String(query.excludeId) : '',
      ),
    };
  }

  /** Banner + row-highlight data for the contacts list (admin only). */
  async summary(actor: unknown) {
    this.assertAdmin(actor, 'Managing duplicate contacts');
    const { index, truncated, scanned } = await this.loadIndex();
    return {
      records: index.duplicateRecordCount,
      groups: index.duplicateGroupCount,
      scanned,
      truncated,
      byContactId: index.infoById(),
    };
  }

  /** Every duplicate cluster with a suggested master (admin only). */
  async listGroups(actor: unknown) {
    this.assertAdmin(actor, 'Managing duplicate contacts');
    const { index, truncated, scanned } = await this.loadIndex();
    const groups = index.groups();
    return { groups, total: groups.length, scanned, truncated };
  }

  async merge(
    masterId: string,
    duplicateIds: string[],
    actor: unknown,
  ) {
    this.assertAdmin(actor, 'Merging contacts');
    return this.duplicatesService.mergeContacts(masterId, duplicateIds || [], actor);
  }

  /**
   * Merge many clusters in one call. Each cluster is merged independently so
   * one failure never blocks the rest.
   */
  async mergeGroups(
    groups: Array<{ masterId: string; duplicateIds: string[] }>,
    actor: unknown,
  ) {
    this.assertAdmin(actor, 'Merging contacts');
    if (!Array.isArray(groups) || !groups.length) {
      throw new BadRequestException('At least one duplicate group is required');
    }
    const results: Array<{ masterId: string; merged: number; error?: string }> = [];
    for (const g of groups.slice(0, BULK_MERGE_MAX_GROUPS)) {
      try {
        const r = await this.duplicatesService.mergeContacts(
          g?.masterId,
          g?.duplicateIds || [],
          actor,
        );
        results.push({ masterId: String(g.masterId), merged: r.removedIds.length });
      } catch (e: any) {
        results.push({
          masterId: String(g?.masterId),
          merged: 0,
          error: e?.message || 'Merge failed',
        });
      }
    }
    return {
      ok: results.every((r) => !r.error),
      groupsMerged: results.filter((r) => !r.error).length,
      recordsMerged: results.reduce((n, r) => n + r.merged, 0),
      results,
    };
  }
}
