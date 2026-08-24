import type { PageTourEntry } from './types';

export const HRMS_PAGE_TOURS: PageTourEntry[] = [
  {
    prefix: '/hrms/dashboard',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'HR dashboard',
        description:
          'At-a-glance widgets—headcount, leave balances, upcoming holidays, and pending approvals. Content reflects your role and permissions.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/hrms/virtual-office',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Virtual office',
        description:
          'See colleagues online and stay connected without leaving HRMS.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/hrms/employees/',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Employee profile',
        description:
          'Individual employee record—personal details, job info, documents, leave history, and performance. HR admins can edit; others may see a limited view.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/hrms/employees',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Employees',
        description:
          'Organisation directory. Invite new joiners, add employees, switch between directory/access/performance views, and open any profile.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/hrms/leaves/short-duration',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Short duration leave',
        description:
          'Apply for or approve partial-day and short leave requests separate from full-day leave policies.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/hrms/leaves/apply',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Apply for leave',
        description:
          'Submit a new leave request—pick type, dates, and reason. Track approval status after submitting.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/hrms/leaves/approvals',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Leave approvals',
        description:
          'Managers review pending leave requests from their team. Approve, reject, or request changes.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/hrms/leaves',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Leave management',
        description:
          'View balances, apply for time off, and track request history. Managers see team calendars and approval queues.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/hrms/holidays',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Holiday calendar',
        description:
          'Company-wide public holidays and optional days. Plan leave around official closures.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/hrms/timesheets',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Timesheets',
        description:
          'Log hours against projects or categories. Submit weekly timesheets for manager approval.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/hrms/payroll',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Payroll',
        description:
          'Run pay cycles, manage salary structures, generate payslips, and handle advances or gratuity. HR finance admins use this hub.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/hrms/expenses/new',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'New expense claim',
        description:
          'Submit receipts and amounts for reimbursement. Add line items, attach proofs, and send for approval.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/hrms/expenses',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Expenses',
        description:
          'Submit and track reimbursement claims. Managers approve pending claims; finance sees organisation-wide totals.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/hrms/benefits',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Employee benefits',
        description:
          'View and manage benefit programmes—insurance, allowances, and enrolment status for employees.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/hrms/recruitment/new',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Create job opening',
        description:
          'Post a new vacancy—title, description, requirements, and pipeline stages for applicants.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/hrms/recruitment',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Recruitment',
        description:
          'Hiring pipeline dashboard—open roles, applicant stages, and hiring metrics. Create jobs and move candidates through stages.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/hrms/announcements',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Announcements',
        description:
          'Company-wide news and updates. HR publishes; all employees see announcements on login.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/hrms/notifications',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'HR notifications',
        description:
          'Leave approvals, policy updates, payroll alerts, and other HR-specific notifications.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/hrms/policies',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Company policies',
        description:
          'Published HR policies employees must acknowledge. Admins upload and version policy documents.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/hrms/sops',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Standard operating procedures',
        description:
          'Step-by-step internal procedures with assigned owners. Track who has read and confirmed each SOP.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/hrms/my-vault',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'My Vault',
        description:
          'Personal credential storage for employees—separate from the team Vault product.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/hrms/hr-settings',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'HR admin settings',
        description:
          'Configure leave policies, departments, grades, payroll rules, and organisation structure. Restricted to HR administrators.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/hrms/roles',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Role manager',
        description:
          'Define HRMS roles and attach module permissions. Controls what each role can view, create, or approve.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/hrms/audit-logs',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Audit logs',
        description:
          'Immutable trail of sensitive HR actions—who changed what and when—for compliance and troubleshooting.',
        side: 'top',
      },
    ],
  },
  {
    prefix: '/hrms/tech-services',
    steps: [
      {
        element: '[data-tour="main-content"]',
        title: 'Tech services',
        description:
          'Internal IT/service requests and asset tracking for the organisation.',
        side: 'top',
      },
    ],
  },
];
