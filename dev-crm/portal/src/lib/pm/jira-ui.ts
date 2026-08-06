/** Atlassian Jira Software design tokens for PM tool UI. */

import { suiteSidebarChrome } from '@/components/suite/shell/sidebar-chrome';

export const JIRA = {
    link: '#0c66e4',
    linkHover: '#0055cc',
    text: '#172b4d',
    textSubtle: '#5e6c84',
    textMuted: '#42526e',
    textDisabled: '#97a0af',
    border: '#dfe1e6',
    surface: '#f4f5f7',
    column: '#ebecf0',
    selected: '#deebff',
    selectedBorder: '#b3d4ff',
    white: '#ffffff',
} as const;

/** Atlassian/Jira Cloud UI font stack (system UI — not Inter / editorial serif). */
export const JIRA_FONT_FAMILY =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, "Fira Sans", "Droid Sans", "Helvetica Neue", Arial, sans-serif';

export const jiraFontClass = 'pm-jira-font';

/** Authenticated suite shells (PM, CRM, HRMS, Vault, Executive, Social, …). */
export const jiraSuiteShellClassName =
    'theme-crm-hubspot theme-collab-slack pm-jira-font min-h-screen bg-background text-text-main';

export const jiraClasses = {
    text: 'text-[var(--text-main)]',
    textSubtle: 'text-[var(--text-muted)]',
    textMuted: 'text-[var(--text-muted)]',
    link: 'text-[#0c66e4] hover:text-[#0055cc]',
    border: 'border-[var(--border-color)]',
    surface: 'bg-[var(--surface-hover)]',
    panel: 'rounded-[3px] border border-[var(--border-color)] bg-[var(--card-bg)] shadow-sm',
    input:
        'h-8 rounded-[3px] border border-[var(--border-color)] bg-[var(--card-bg)] px-3 text-sm text-[var(--text-main)] placeholder:text-[#97a0af] focus-visible:border-[#0c66e4] focus-visible:ring-1 focus-visible:ring-[#0c66e4]/30',
    btnPrimary:
        'h-8 rounded-[3px] bg-[#0c66e4] px-3 text-sm font-medium text-white shadow-none hover:bg-[#0055cc] focus-visible:ring-2 focus-visible:ring-[#0c66e4]/40',
    btnSecondary:
        'h-8 rounded-[3px] border border-[var(--border-color)] bg-[var(--card-bg)] px-3 text-sm font-medium text-[var(--text-muted)] shadow-none hover:bg-[var(--surface-hover)] hover:text-[var(--text-main)]',
    btnGhost:
        'h-8 rounded-[3px] px-3 text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-main)]',
    tabActive: 'border-[#0c66e4] text-[#0c66e4]',
    tabInactive: 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-hover)]',
    chip:
        'rounded-full border border-[var(--border-color)] bg-[var(--card-bg)] px-2.5 py-0.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-hover)]',
    chipActive: 'rounded-full border border-[#0c66e4] bg-[var(--primary-light)] px-2.5 py-0.5 text-xs font-medium text-[#0c66e4]',
    tableHead: 'text-xs font-semibold text-[var(--text-muted)] normal-case tracking-normal',
    issueKey: 'pm-issue-key font-mono text-xs font-semibold text-[#0c66e4] hover:underline',
    label: 'text-xs font-semibold text-[var(--text-muted)]',
} as const;

/** Shared page layout — Jira 14px type, 16–24px gutters, compact sections. */
export const jiraLayout = {
    page: 'pm-page mx-auto w-full max-w-[1280px] flex flex-col gap-4 pb-6',
    pageWide: 'pm-page pm-page-wide mx-auto w-full max-w-[1400px] flex flex-col gap-4 pb-6',
    pageHeader:
        'pm-page-header flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between',
    eyebrow: 'pm-eyebrow flex items-center gap-2 text-xs font-semibold text-[#5e6c84]',
    title: 'text-xl font-semibold text-[#172b4d] sm:text-2xl',
    lead: 'mt-1 max-w-2xl text-sm leading-relaxed text-[#5e6c84]',
    section: 'pm-section space-y-4',
    contentX: 'pm-content-x',
    toolbar: 'flex flex-wrap items-center gap-2',
    cardGrid: 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
    filterBar: 'flex flex-wrap items-center gap-2 border-b border-[#dfe1e6] bg-white px-4 py-2 sm:px-5',
} as const;

/** Jira Cloud global app header (search bar, product mark, actions). */
export const jiraAppChrome = {
    header:
        'pm-jira-app-header pm-jira-font z-50 flex h-14 shrink-0 items-center border-b border-[#dfe1e6] bg-white px-3 md:px-4',
    inner: 'flex w-full min-w-0 items-center gap-3 md:gap-4',
    left: 'flex min-w-0 shrink-0 items-center gap-2',
    mobileMenuBtn:
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] text-[#44546f] hover:bg-[#f4f5f7] hover:text-[#172b4d] lg:hidden',
    productLink: 'flex min-w-0 items-center gap-2 rounded-[3px] pr-2 outline-none hover:opacity-90',
    productLogo:
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] bg-[#0c66e4] text-white',
    productName: 'hidden truncate text-sm font-semibold text-[#172b4d] sm:block',
    search: 'min-w-0 flex-1 max-w-none md:max-w-xl lg:max-w-2xl',
    actions: 'ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1',
    iconBtn:
        'pm-jira-header-icon inline-flex h-8 w-8 items-center justify-center rounded-[3px] text-[#44546f] hover:bg-[#f4f5f7] hover:text-[#172b4d]',
    divider: 'mx-1 hidden h-6 w-px shrink-0 bg-[#ebecf0] sm:block',
    profileBtn:
        'flex cursor-pointer items-center gap-2 rounded-[3px] p-1 hover:bg-[#f4f5f7]',
    avatar:
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0c66e4] text-[11px] font-semibold text-white',
    profileName: 'hidden max-w-[120px] truncate text-sm font-medium text-[#172b4d] md:block',
} as const;

/** Suite sidebar — app / workspace switcher (Jira “Switch apps” pattern). */
export const jiraSidebarChrome = {
    workspaceSection: 'shrink-0 border-b border-[#dfe1e6]',
    workspaceTrigger:
        'suite-workspace-trigger flex w-full outline-none transition-colors rounded-[3px] border border-[#dfe1e6] bg-[#fafbfc] hover:bg-[#f4f5f7] hover:border-[#c1c7d0] focus-visible:ring-2 focus-visible:ring-[#0c66e4]/30 focus-visible:ring-offset-1',
    workspaceTriggerExpanded: 'items-center gap-2 px-2 py-1.5 text-left',
    workspaceTriggerCollapsed: 'flex-col items-center gap-1 px-1 py-2',
    workspaceIcon: 'flex shrink-0 items-center justify-center rounded-[3px] text-white',
    workspaceEyebrow: 'block text-[11px] font-semibold leading-4 text-[#5e6c84]',
    workspaceName: 'block truncate text-sm font-medium leading-tight text-[#172b4d]',
    workspaceChevron: 'shrink-0 text-[#5e6c84]',
    workspaceMenu:
        'suite-workspace-menu z-50 w-[min(17.5rem,calc(100vw-4rem))] rounded-[3px] border border-[#dfe1e6] bg-white p-1 shadow-[0_4px_8px_rgba(9,30,66,0.15)]',
    workspaceMenuLabel: 'px-2 py-1.5 text-[11px] font-semibold text-[#5e6c84]',
    workspaceMenuItem:
        'suite-workspace-item flex w-full items-center gap-2 rounded-[3px] px-2 py-1.5 outline-none transition-colors hover:bg-[#f4f5f7] focus-visible:ring-2 focus-visible:ring-[#0c66e4]/30',
    workspaceMenuItemActive: 'bg-[#deebff] hover:bg-[#deebff]',
    workspaceMenuIcon: 'flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px]',
    workspaceMenuIconActive: 'bg-[#0c66e4] text-white',
    workspaceMenuIconIdle: 'bg-[#ebecf0] text-[#42526e]',
    workspaceMenuTitle: 'text-sm font-medium text-[#172b4d]',
    workspaceMenuTitleActive: 'font-medium text-[#0c66e4]',
    workspaceMenuTagline: 'line-clamp-1 text-xs leading-snug text-[#5e6c84]',
    /** Sidebar rail — global suite soft-pill + icon tiles (same as CRM/HRMS). */
    ...suiteSidebarChrome,
    rail: 'suite-jira-sidebar suite-sidebar-rail',
    productLine: 'text-[11px] font-semibold text-[#5e6c84]',
} as const;

/** App shell — Jira canvas + content gutters. */
export const jiraShellLayout = {
    shell: 'suite-jira-shell pm-jira-font flex h-full min-h-0 overflow-hidden bg-[#f4f5f7]',
    main: 'suite-jira-main flex-1 overflow-y-auto bg-[#f4f5f7]',
    mainPadded: 'pm-page-padded',
} as const;

/** Jira Software project / board view chrome (title, tabs, toolbar). */
export const jiraBoardChrome = {
    header: 'pm-board-header pm-jira-font shrink-0 bg-white',
    titleRow:
        'pm-board-title-row flex min-w-0 items-center gap-3 px-6 pb-2 pt-3',
    projectAvatar:
        'pm-board-avatar flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] bg-[#0c66e4] text-[11px] font-bold uppercase text-white',
    titleBlock: 'min-w-0 flex-1 flex flex-col gap-0.5',
    eyebrow: 'pm-board-eyebrow text-xs font-normal leading-4 text-[#5e6c84] hover:text-[#0c66e4] hover:underline',
    projectTitle:
        'pm-board-project-title m-0 min-w-0 p-0',
    projectTitleButton:
        'flex min-w-0 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left text-[#172b4d] transition-colors hover:text-[#0c66e4]',
    projectTitleText: 'pm-board-project-title-text truncate text-[24px] font-medium leading-8 tracking-normal text-[#172b4d]',
    titleMeta: 'flex min-w-0 items-center gap-1',
    titleIconBtn:
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] text-[#5e6c84] hover:bg-[#f4f5f7] hover:text-[#172b4d]',
    titleMoreBtn:
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] border border-[#dfe1e6] bg-white text-[#44546f] hover:bg-[#f4f5f7] hover:text-[#172b4d]',
    titleActions: 'ml-auto flex shrink-0 items-center gap-2',
    tabBar:
        'pm-board-tab-bar pm-jira-font flex shrink-0 items-stretch gap-0 overflow-x-auto border-b border-[#dfe1e6] bg-white px-6',
    tab: 'pm-board-tab inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 border-0 border-b-2 border-transparent bg-transparent px-3 py-0 text-sm font-normal text-[#42526e] shadow-none outline-none transition-colors hover:text-[#172b4d] focus-visible:outline-none',
    tabActive: '!border-[#0052cc] !text-[#0052cc] font-medium',
    tabInactive: 'hover:border-transparent',
    toolbar:
        'pm-board-toolbar pm-jira-font flex w-full min-w-0 shrink-0 flex-wrap items-center gap-2 border-b border-[#dfe1e6] bg-white px-6 py-2',
    toolbarSearch: 'pm-board-toolbar-search relative w-[200px] shrink-0 sm:w-[220px]',
    toolbarSearchInput:
        'pm-board-toolbar-search-input h-8 w-full rounded-[3px] border border-[#dfe1e6] bg-[#fafbfc] pl-8 pr-3 text-sm font-normal text-[#172b4d] shadow-none placeholder:text-[#7a869a] focus-visible:border-[#0052cc] focus-visible:ring-1 focus-visible:ring-[#0052cc]/25',
    toolbarFilterBtn:
        'pm-board-toolbar-filter inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[3px] border border-[#dfe1e6] bg-white px-2.5 text-sm font-normal text-[#42526e] shadow-none hover:bg-[#f4f5f7]',
    toolbarJql:
        'pm-board-toolbar-jql inline-flex h-8 shrink-0 items-center px-1 text-sm font-normal text-[#42526e] hover:text-[#172b4d] hover:underline',
    toolbarIconBtn:
        'pm-board-toolbar-icon inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] border border-[#dfe1e6] bg-white text-[#42526e] shadow-none hover:bg-[#f4f5f7] hover:text-[#172b4d]',
    toolbarIconBtnActive:
        'border-[#0052cc] bg-[#deebff] text-[#0052cc]',
    toolbarDivider: 'mx-0.5 hidden h-6 w-px shrink-0 bg-[#ebecf0] sm:block',
    toolbarSpacer: 'min-w-2 flex-1',
    /** Scrollable tab body below toolbar — 24px horizontal, 12px top, 24px bottom (Jira board rhythm). */
    tabContent:
        'pm-board-tab-content flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent',
    tabContentScroll:
        'pm-board-tab-content min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-transparent custom-scrollbar',
    dropdownContent:
        'z-50 rounded-[3px] border border-[#dfe1e6] bg-white p-1 shadow-lg',
    dropdownLabel: 'px-2 py-1.5 text-xs font-semibold text-[#5e6c84]',
} as const;

/** Jira Software issue list / table cells */
export const jiraList = {
    selectTrigger:
        'h-7 border-none bg-transparent p-0 shadow-none hover:bg-[#f4f5f7] rounded-[3px] focus:ring-0',
    selectContent: 'z-[300] rounded-[3px] border border-[#dfe1e6] bg-white p-1 shadow-lg',
    selectItem: 'rounded-[3px] text-sm text-[#172b4d] focus:bg-[#deebff] focus:text-[#172b4d]',
    avatar:
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0c66e4] text-[10px] font-semibold leading-none text-white',
    avatarMuted:
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#dfe1e6] text-[10px] font-semibold leading-none text-[#5e6c84]',
    metaText: 'text-xs font-normal text-[#5e6c84]',
    typeCell: 'flex items-center gap-1.5 text-xs font-normal text-[#42526e]',
    addRow: 'cursor-pointer border-t border-dashed border-[#dfe1e6] hover:bg-[#f4f5f7]',
    emptyState: 'py-16 text-center',
    inlineInput:
        'w-full border-none bg-transparent text-sm text-[#172b4d] placeholder:text-[#97a0af] focus:ring-0',
} as const;

export function jiraFormatStatusLabel(status: string): string {
    const s = (status || '').replace(/-/g, ' ').trim();
    if (!s) return 'Unknown';
    return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function jiraStatusLozengeClass(status: string): string {
    const n = (status || '').toUpperCase().replace(/\s+/g, '-');
    if (n === 'DONE' || n === 'COMPLETED') {
        return 'inline-flex max-w-full items-center truncate rounded-[3px] bg-[#e3fcef] px-2 py-0.5 text-xs font-medium text-[#216e4e]';
    }
    if (n === 'IN-PROGRESS') {
        return 'inline-flex max-w-full items-center truncate rounded-[3px] bg-[#deebff] px-2 py-0.5 text-xs font-medium text-[#0052cc]';
    }
    if (n === 'BACKLOG') {
        return 'inline-flex max-w-full items-center truncate rounded-[3px] bg-[#ebecf0] px-2 py-0.5 text-xs font-medium text-[#42526e]';
    }
    return 'inline-flex max-w-full items-center truncate rounded-[3px] bg-[#ebecf0] px-2 py-0.5 text-xs font-medium text-[#42526e]';
}

export function jiraUserInitials(name?: string, email?: string, fallback = '?'): string {
    const fullName = (name || '').trim();
    const isId = /^[0-9a-fA-F]{24}$/.test(fullName);
    if (!fullName || isId) {
        const e = (email || '').trim();
        return e ? e.slice(0, 2).toUpperCase() : fallback;
    }
    const parts = fullName.split(' ').filter((p) => !!p.trim());
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return fullName.slice(0, 2).toUpperCase();
}

export function jiraIssueTypeIconColor(type: string | undefined): string {
    const t = (type || '').toLowerCase();
    if (t.includes('bug')) return 'text-[#e34935]';
    if (t.includes('story')) return 'text-[#36b37e]';
    if (t.includes('epic')) return 'text-[#6554c0]';
    return 'text-[#0c66e4]';
}

/** Jira Software kanban column + issue card chrome */
export const jiraKanban = {
    boardScroll: 'relative flex min-h-0 flex-1 flex-col overflow-x-auto overflow-y-hidden custom-scrollbar pm-content-x pb-4 pt-3 [scrollbar-gutter:stable]',
    columnsRow: 'flex flex-1 min-h-0 items-stretch gap-2 pr-1',
    column:
        'pm-board-kanban-column flex w-[272px] shrink-0 cursor-grab flex-col self-stretch rounded-[3px] bg-[#f4f5f7] active:cursor-grabbing',
    columnHeader:
        'pm-board-kanban-column-header sticky top-0 z-10 flex shrink-0 items-center justify-between gap-2 px-2 pb-2 pt-3',
    columnTitle: 'truncate text-xs font-semibold uppercase tracking-wide text-[#5e6c84]',
    columnCount:
        'shrink-0 rounded-[3px] bg-[#dfe1e6] px-1.5 py-0.5 text-[11px] font-semibold leading-none text-[#42526e]',
    columnBody:
        'custom-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden px-2 pb-2 [scrollbar-gutter:stable]',
    card:
        'pm-board-kanban-card issue-card group relative flex w-full min-w-0 shrink-0 flex-col overflow-hidden rounded-[3px] border border-[#dfe1e6] bg-white shadow-[0_1px_1px_rgba(9,30,66,0.13)] transition-[box-shadow,background-color] duration-150 hover:bg-[#fafbfc]',
    cardDragging: 'shadow-md ring-2 ring-[#0c66e4]/30',
    cardBody: 'px-3 py-2',
    cardSummary: 'line-clamp-3 text-sm font-normal leading-snug text-[#172b4d]',
    cardFooter: 'mt-auto flex shrink-0 items-center gap-2 border-t border-[#ebecf0] px-3 py-1.5',
    addIssue:
        'pm-board-add-issue-btn flex w-full items-center gap-1.5 rounded-[3px] px-2 py-2 text-sm font-medium text-[#42526e] transition-colors hover:bg-[#ebecf0] hover:text-[#172b4d]',
    addColumn:
        'flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-[3px] text-[#5e6c84] transition-colors hover:bg-[#ebecf0] hover:text-[#172b4d]',
    dropHighlight: 'bg-[#deebff]/40 ring-2 ring-inset ring-[#0c66e4]/20',
} as const;

/** Jira Cloud login / signup shell */
export const jiraAuthChrome = {
    page: 'jira-auth-page min-h-screen bg-[#f4f5f7] px-4 py-12 font-sans text-[#172b4d]',
    card: 'jira-auth-card w-full max-w-[400px] space-y-8 rounded-[3px] border border-[#dfe1e6] bg-white p-8 shadow-[0_4px_8px_rgba(9,30,66,0.15)]',
    title: 'text-xl font-medium text-[#172b4d]',
    lead: 'mt-1 text-sm text-[#5e6c84]',
    label: 'block text-xs font-semibold text-[#44546f]',
    input:
        'block w-full h-10 rounded-[3px] border border-[#dfe1e6] bg-white px-3 text-sm text-[#172b4d] placeholder:text-[#97a0af] outline-none transition-colors focus:border-[#0052cc] focus:ring-1 focus:ring-[#0052cc]/30',
    inputWithIcon: 'pl-10',
    iconInInput: 'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#97a0af]',
    btnPrimary:
        'flex h-10 w-full items-center justify-center gap-2 rounded-[3px] bg-[#0052cc] text-sm font-medium text-white transition-colors hover:bg-[#0047b3] disabled:opacity-50',
    btnSecondary:
        'flex h-10 w-full items-center justify-center gap-2 rounded-[3px] border border-[#dfe1e6] bg-white text-sm font-medium text-[#172b4d] transition-colors hover:bg-[#f4f5f7] disabled:opacity-50',
    divider: 'relative flex items-center py-1',
    dividerLine: 'flex-grow border-t border-[#dfe1e6]',
    dividerText: 'mx-3 text-xs text-[#5e6c84]',
    error: 'flex items-center gap-2 rounded-[3px] border border-[#ffebe6] bg-[#ffebe6] px-3 py-2 text-xs text-[#de350b]',
    footer: 'text-center text-xs text-[#97a0af]',
} as const;

/** Issue detail panel — activity, links, work log */
export const jiraIssueDetail = {
    panel: 'rounded-[3px] border border-[#dfe1e6] bg-[#fafbfc] p-4',
    sectionTitle: 'text-xs font-semibold text-[#172b4d]',
    meta: 'text-xs text-[#97a0af]',
    author: 'text-xs font-semibold text-[#172b4d]',
    empty: 'text-xs text-[#5e6c84]',
    linkType: 'max-w-[120px] shrink-0 truncate text-xs font-medium text-[#5e6c84]',
    actBadge:
        'rounded-[3px] px-1.5 py-0.5 text-[11px] font-medium capitalize',
    actBadgeComment: 'bg-[#deebff] text-[#0052cc]',
    actBadgeWorklog: 'bg-[#e3fcef] text-[#216e4e]',
    actBadgeHistory: 'bg-[#ebecf0] text-[#42526e]',
    selectTrigger:
        'h-8 rounded-[3px] border border-[#dfe1e6] bg-white text-xs text-[#172b4d]',
    selectContent: 'z-[300] rounded-[3px] border border-[#dfe1e6] bg-white p-1 shadow-lg',
    selectItem: 'rounded-[3px] text-xs text-[#172b4d] focus:bg-[#deebff]',
    input: 'h-8 rounded-[3px] border border-[#dfe1e6] bg-white text-xs text-[#172b4d]',
    btnPrimary: 'h-8 rounded-[3px] bg-[#0052cc] px-4 text-sm font-medium text-white hover:bg-[#0047b3]',
} as const;

/** Create issue page / dialog — Jira form typography */
export const jiraFormChrome = {
    shell: 'pm-create-issue',
    dialog: 'pm-create-issue-dialog left-1/2 top-1/2 z-[200] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[3px] border border-[#dfe1e6] bg-white p-0 shadow-lg',
    header: 'pm-create-issue-header flex items-center gap-3 border-b border-[#dfe1e6] px-5 py-4 sm:px-6',
    title: 'pm-create-issue-title text-[#172b4d]',
    lead: 'pm-create-issue-lead text-[#5e6c84]',
    body: 'pm-create-issue-body max-h-[70vh] overflow-y-auto px-5 py-5 sm:px-6',
    fieldHelp: 'text-xs leading-relaxed text-[#5e6c84]',
    footer: 'flex justify-end gap-3 border-t border-[#dfe1e6] pt-4',
    selectContent: 'z-[300] rounded-[3px] border border-[#dfe1e6] bg-white p-1 shadow-lg',
    parentTrigger:
        'h-8 w-full justify-start gap-2 rounded-md border border-[#dfe1e6] bg-white px-3 text-left text-sm font-normal text-[#172b4d] placeholder:text-[#97a0af] focus-visible:border-[#0c66e4] focus-visible:ring-1 focus-visible:ring-[#0c66e4]/30 flex items-center',
} as const;

/** CRM modal chrome — kept on jira-ui path for legacy imports. */
export { crmModalChrome } from "@/lib/crm/chrome";
