import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import axios, { AxiosInstance } from 'axios';
import { createHmac, randomUUID } from 'crypto';
import { CRMUser, CRMUserDocument } from '../../crm-users/schemas/user.schema';
import { Role, RoleDocument } from '../../crm-users/schemas/role.schema';
import { User, UserDocument } from '../../../users/schemas/user.schema';
import { crmPermissionNamesFromRole } from '../../shared/crm-role-permissions.util';
import {
  CrmRoleSnapshot,
  CrmToHrmsEventType,
  CrmUserSnapshot,
} from './hrms-sync.types';

/**
 * CRM → HRMS half of the two-way RBAC sync. Role edits, CRM admin grants/role changes
 * and team (reportsTo) changes are pushed to `{HRMS_API_URL}/api/webhooks/crm`.
 *
 * All notify* methods are fire-and-forget: a down HRMS never blocks a CRM admin action.
 * HRMS never pushes back in response to these events, so there is no sync loop.
 */
@Injectable()
export class HrmsOutboundService {
  private readonly logger = new Logger(HrmsOutboundService.name);
  private readonly http: AxiosInstance;

  constructor(
    @InjectModel(Role.name, 'crmConnection')
    private readonly roleModel: Model<RoleDocument>,
    @InjectModel(CRMUser.name, 'crmConnection')
    private readonly crmUserModel: Model<CRMUserDocument>,
    @InjectModel(User.name)
    private readonly platformUserModel: Model<UserDocument>,
  ) {
    const baseURL = process.env.HRMS_API_URL || 'http://127.0.0.1:4000';
    this.http = axios.create({ baseURL: baseURL.replace(/\/$/, ''), timeout: 15000 });
  }

  private secret(): string {
    return process.env.CRM_TO_HRMS_WEBHOOK_SECRET || process.env.HRMS_WEBHOOK_SECRET || '';
  }

  isConfigured(): boolean {
    return !!process.env.HRMS_API_URL || !!this.secret();
  }

  /** Shared login: ask HRMS whether these credentials are the employee's HRMS login. */
  async verifyCredentials(
    email: string,
    password: string,
  ): Promise<'ok' | 'invalid' | 'inactive' | 'no_user' | 'unreachable'> {
    const secret = this.secret();
    if (!secret) return 'unreachable';
    try {
      const { data } = await this.http.post(
        '/api/webhooks/crm/verify-credentials',
        { email, password },
        { headers: { 'x-crm-secret': secret }, timeout: 5000 },
      );
      const status = String(data?.status || '');
      return (['ok', 'invalid', 'inactive', 'no_user'] as const).includes(status as any)
        ? (status as 'ok' | 'invalid' | 'inactive' | 'no_user')
        : 'unreachable';
    } catch (err: any) {
      this.logger.warn(`HRMS credential check failed: ${err?.message || err}`);
      return 'unreachable';
    }
  }

  /** With HRMS connected, people are added/removed only in HRMS (CRM still grants access + roles). */
  employeesManagedInHrms(): boolean {
    return this.isConfigured() && process.env.CRM_ALLOW_LOCAL_USER_MANAGEMENT !== 'true';
  }

  hrmsPortalUrl(): string {
    return (process.env.HRMS_PORTAL_URL || 'http://localhost:3000').replace(/\/$/, '');
  }

  assertCrmUserManagementAllowed(action: 'add' | 'remove') {
    if (!this.employeesManagedInHrms()) return;
    throw new ForbiddenException(
      action === 'add'
        ? 'Employees are managed in HRMS. Add the employee in HRMS → Employees (in a CRM-enabled department); they then appear in Users & access → Pending to grant a CRM role.'
        : 'Employees are managed in HRMS. Remove or deactivate the employee in HRMS, or remove their CRM access here instead of deleting them.',
    );
  }

  // ---------------------------------------------------------------------------
  // Snapshots (also returned synchronously from the HRMS webhook)
  // ---------------------------------------------------------------------------

  roleSnapshot(role: any): CrmRoleSnapshot {
    const obj = typeof role?.toObject === 'function' ? role.toObject() : role;
    return {
      crmRoleId: String(obj._id),
      hrmsRoleId: obj.hrmsRoleId || undefined,
      name: obj.name,
      description: obj.description || '',
      isActive: obj.isActive !== false,
      isSystem: !!obj.isSystem,
      crmPermissions: crmPermissionNamesFromRole(obj),
      workspaceModule: obj.workspaceModule || 'ALL',
    };
  }

  async roleSnapshotById(id: unknown): Promise<CrmRoleSnapshot | null> {
    const role = await this.roleModel.findById(id).populate('permissions').exec();
    return role ? this.roleSnapshot(role) : null;
  }

  /** Email of the platform User this CRM user reports to (CRM team lead). */
  async reportsToEmailFor(email: string): Promise<string | null> {
    const platform: any = await this.platformUserModel
      .findOne({ email: String(email || '').toLowerCase() })
      .select('reportsTo')
      .lean()
      .exec();
    if (!platform?.reportsTo) return null;
    const lead: any = await this.platformUserModel
      .findById(platform.reportsTo)
      .select('email')
      .lean()
      .exec();
    return lead?.email ? String(lead.email).toLowerCase() : null;
  }

  async userSnapshot(user: any): Promise<CrmUserSnapshot> {
    const doc: any =
      user?.roleId && typeof user.roleId === 'object' && user.roleId.name !== undefined
        ? user
        : await this.crmUserModel.findById(user._id).populate('roleId').lean().exec();
    const role = doc?.roleId && typeof doc.roleId === 'object' ? doc.roleId : null;
    return {
      crmUserId: String(doc._id),
      email: String(doc.email || '').toLowerCase(),
      hrmsEmployeeId: doc.hrmsEmployeeId || undefined,
      firstName: doc.firstName,
      lastName: doc.lastName,
      crmRoleId: role?._id ? String(role._id) : undefined,
      // Older CRM users only carry the role label (no Role link) — still show it in HRMS.
      crmRoleName:
        role?.name ||
        (doc.role && !['user', 'unassigned'].includes(String(doc.role).toLowerCase())
          ? String(doc.role)
          : undefined),
      provisioningStatus: doc.provisioningStatus || 'manual',
      isActive: !!doc.isActive,
      reportsToEmail: await this.reportsToEmailFor(doc.email),
      department: doc.department || undefined,
      designation: doc.designation || undefined,
      phone: doc.agentMobile || undefined,
    };
  }

  // ---------------------------------------------------------------------------
  // Push
  // ---------------------------------------------------------------------------

  async push<T>(eventType: CrmToHrmsEventType, payload: T): Promise<{ ok: boolean; detail?: string }> {
    if (!this.isConfigured()) return { ok: false, detail: 'not_configured' };
    const envelope = {
      eventId: randomUUID(),
      eventType,
      occurredAt: new Date().toISOString(),
      origin: 'crm' as const,
      payload,
    };
    const secret = this.secret();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (secret) {
      headers['x-crm-secret'] = secret;
      headers['x-crm-signature'] = createHmac('sha256', secret)
        .update(JSON.stringify(envelope))
        .digest('hex');
    }
    try {
      await this.http.post('/api/webhooks/crm', envelope, { headers });
      return { ok: true };
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'HRMS webhook failed';
      this.logger.warn(`HRMS push ${eventType} failed: ${msg}`);
      return { ok: false, detail: msg };
    }
  }

  private fire(task: () => Promise<unknown>, label: string) {
    void task().catch((err) => this.logger.warn(`${label} failed: ${err?.message || err}`));
  }

  notifyRoleUpserted(roleId: unknown) {
    this.fire(async () => {
      const snap = await this.roleSnapshotById(roleId);
      if (snap) await this.push('role.upserted', snap);
    }, 'notifyRoleUpserted');
  }

  notifyRoleDeleted(role: any) {
    if (!role?._id) return;
    this.fire(
      () =>
        this.push('role.deleted', {
          crmRoleId: String(role._id),
          hrmsRoleId: role.hrmsRoleId || undefined,
          name: role.name,
        }),
      'notifyRoleDeleted',
    );
  }

  notifyUserAccess(crmUserId: unknown) {
    if (!crmUserId || !Types.ObjectId.isValid(String(crmUserId))) return;
    this.fire(async () => {
      const doc = await this.crmUserModel.findById(crmUserId).populate('roleId').lean().exec();
      if (doc) await this.push('user.access_changed', await this.userSnapshot(doc));
    }, 'notifyUserAccess');
  }

  notifyReportsTo(email: string) {
    if (!email) return;
    this.fire(async () => {
      const crm: any = await this.crmUserModel
        .findOne({ email: String(email).toLowerCase() })
        .select('hrmsEmployeeId')
        .lean()
        .exec();
      await this.push('user.reports_to_changed', {
        email: String(email).toLowerCase(),
        hrmsEmployeeId: crm?.hrmsEmployeeId || undefined,
        reportsToEmail: await this.reportsToEmailFor(email),
      });
    }, 'notifyReportsTo');
  }
}
