'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, Video, Plus, Trash2, PhoneCall } from 'lucide-react';
import api from '@/lib/pm/api';
import { Button } from '@/components/pm/ui/button';
import { Input } from '@/components/pm/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/pm/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { jiraClasses, jiraLayout } from '@/lib/pm/jira-ui';

type VirtualOfficeRoom = {
  name: string;
  mode: 'external' | 'huddle';
  provider?: string;
  link?: string;
  huddleRoomId?: string;
  purpose?: string;
  alwaysLive?: boolean;
  updatedAt?: string;
};

function normalizeLink(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function createHuddleRoomId(name: string, purpose: string, alwaysLive: boolean) {
  const seed = `${name}-${purpose}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${alwaysLive ? 'live' : 'huddle'}-${seed || 'room'}-${suffix}`;
}

/** Shared Virtual Office UI; mount under `/pm`, `/hrms`, or `/crm` so AppShell + module layout apply. */
export default function VirtualOfficePage() {
  const queryClient = useQueryClient();
  const [roomName, setRoomName] = useState('');
  const [roomMode, setRoomMode] = useState<'external' | 'huddle'>('external');
  const [roomProvider, setRoomProvider] = useState<'google-meet' | 'zoom' | 'teams' | 'other'>(
    'google-meet',
  );
  const [roomLink, setRoomLink] = useState('');
  const [roomPurpose, setRoomPurpose] = useState('');
  const [roomAlwaysLive, setRoomAlwaysLive] = useState(false);

  const { data } = useQuery({
    queryKey: ['pm-virtual-office-rooms'],
    queryFn: async () => (await api.get('/projects/virtual-office-rooms')).data,
  });

  const rooms: VirtualOfficeRoom[] = useMemo(
    () =>
      Array.isArray((data as any)?.virtualOfficeRooms)
        ? (data as any).virtualOfficeRooms
        : [],
    [data],
  );

  const updateRoomsMutation = useMutation({
    mutationFn: async (virtualOfficeRooms: VirtualOfficeRoom[]) =>
      (await api.patch('/projects/virtual-office-rooms', { virtualOfficeRooms })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pm-virtual-office-rooms'] });
      setRoomName('');
      setRoomMode('external');
      setRoomProvider('google-meet');
      setRoomLink('');
      setRoomPurpose('');
      setRoomAlwaysLive(false);
      toast.success('Virtual office updated');
    },
    onError: () => toast.error('Failed to update virtual office'),
  });

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Meeting link copied');
    } catch {
      toast.error('Could not copy link');
    }
  };

  return (
    <div className={cn(jiraLayout.page, 'max-w-[1180px] space-y-4')}>
      <div className={jiraLayout.pageHeader}>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#dfe1e6] bg-[#deebff]">
            <Users className="h-5 w-5 text-[#0c66e4]" aria-hidden />
          </div>
          <div>
            <h1 className={jiraLayout.title}>Virtual office</h1>
            <p className={jiraLayout.lead}>
              Company-wide rooms for video links and internal Quick Chat huddles.
            </p>
          </div>
        </div>
      </div>

      <div className={cn(jiraClasses.panel, 'p-4 sm:p-5')}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4 items-end">
            <div>
              <label className={cn(jiraClasses.label, 'mb-1 block')}>Room name</label>
              <Input
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="Engineering Standup"
                className={jiraClasses.input}
              />
            </div>
            <div>
              <label className={cn(jiraClasses.label, 'mb-1 block')}>Room type</label>
              <Select
                value={roomMode}
                onValueChange={(value) => setRoomMode(value as 'external' | 'huddle')}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select room type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="external">External Link</SelectItem>
                  <SelectItem value="huddle">Internal Huddle</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {roomMode === 'external' ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Provider</label>
                <Select
                  value={roomProvider}
                  onValueChange={(value) =>
                    setRoomProvider(value as 'google-meet' | 'zoom' | 'teams' | 'other')
                  }
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google-meet">Google Meet</SelectItem>
                    <SelectItem value="zoom">Zoom</SelectItem>
                    <SelectItem value="teams">Microsoft Teams</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Internal room</label>
                <Input value="Auto-created private huddle room" className="h-9" disabled />
                <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-slate-300"
                    checked={roomAlwaysLive}
                    onChange={(e) => setRoomAlwaysLive(e.target.checked)}
                  />
                  Always live (room stays available; invites still control who can join)
                </label>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {roomMode === 'external' ? 'Meeting link' : 'Purpose'}
              </label>
              {roomMode === 'external' ? (
                <Input
                  value={roomLink}
                  onChange={(e) => setRoomLink(e.target.value)}
                  placeholder="https://meet.google.com/..."
                  className="h-9"
                />
              ) : (
                <Input
                  value={roomPurpose}
                  onChange={(e) => setRoomPurpose(e.target.value)}
                  placeholder="Daily sync"
                  className="h-9"
                />
              )}
            </div>
            <Button
              type="button"
              size="sm"
              className="h-9 text-xs bg-[var(--hs-link)] hover:bg-[var(--hs-link-hover)]"
              disabled={
                updateRoomsMutation.isPending ||
                !roomName.trim() ||
                (roomMode === 'external' ? !roomLink.trim() : false)
              }
              onClick={() => {
                const name = roomName.trim();
                const link = roomMode === 'external' ? normalizeLink(roomLink) : undefined;
                const purpose = roomPurpose.trim();
                const huddleRoomId =
                  roomMode === 'huddle' ? createHuddleRoomId(name, purpose, roomAlwaysLive) : undefined;
                if (roomMode === 'external' && !link) return;
                const duplicate = rooms.some(
                  (r) =>
                    String(r?.name || '').trim().toLowerCase() === name.toLowerCase() && r?.mode === roomMode,
                );
                if (duplicate) {
                  toast.info('This room is already added');
                  return;
                }
                updateRoomsMutation.mutate([
                  ...rooms,
                  {
                    name,
                    mode: roomMode,
                    provider: roomMode === 'external' ? roomProvider : 'huddle',
                    link,
                    huddleRoomId,
                    purpose,
                    alwaysLive: roomMode === 'huddle' ? roomAlwaysLive : false,
                    updatedAt: new Date().toISOString(),
                  },
                ]);
              }}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Room
            </Button>
          </div>
      </div>

      <div className={cn(jiraClasses.panel, 'p-4')}>
          <h2 className="mb-3 text-sm font-semibold text-[#172b4d]">Available rooms</h2>
          {rooms.length === 0 ? (
            <p className="text-xs text-slate-500">No virtual office rooms added yet.</p>
          ) : (
            <div className="space-y-2">
              {rooms.map((room, index) => {
                const isLinkValidToday = !!(
                  room.link &&
                  room.updatedAt &&
                  new Date(room.updatedAt).toDateString() === new Date().toDateString()
                );
                return room.mode === 'external' ? (
                  <div
                    key={`${room.name}-${room.link}-${index}`}
                    className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">{room.name}</p>
                        <p className="truncate text-xs text-slate-500">
                          {room.provider || 'Meeting'} {room.purpose ? `- ${room.purpose}` : ''}
                        </p>
                      </div>
                      <Video className="h-5 w-5 shrink-0 text-[#0c66e4]" />
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      {isLinkValidToday ? (
                        <Link
                          href={normalizeLink(room.link || '')}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-8 items-center rounded-md bg-[#0c66e4] px-3 text-xs font-semibold text-white hover:bg-[#0a57c0]"
                        >
                          Join now
                        </Link>
                      ) : (
                        <button
                          disabled
                          title="No active link generated for today"
                          className="inline-flex h-8 items-center rounded-md bg-slate-100 border border-slate-200 px-3 text-xs font-semibold text-slate-400 cursor-not-allowed"
                        >
                          Join now
                        </button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        disabled={!isLinkValidToday}
                        title={isLinkValidToday ? undefined : "No active link generated for today"}
                        onClick={() => {
                          const normalized = normalizeLink(room.link || '');
                          if (!normalized) return;
                          void copyToClipboard(normalized);
                        }}
                      >
                        Copy link
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="ml-auto h-8 text-xs text-red-600 hover:text-red-600"
                        onClick={() => updateRoomsMutation.mutate(rooms.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Remove
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    key={`${room.name}-${room.huddleRoomId}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <Link
                      href="#"
                      className="inline-flex min-w-0 items-center gap-2 text-sm text-[#0c66e4] hover:underline"
                      onClick={(e) => {
                        e.preventDefault();
                        const roomId = String(room.huddleRoomId || '').trim();
                        if (!roomId) return;
                        window.dispatchEvent(
                          new CustomEvent('quick-chat:join-huddle-room', {
                            detail: { roomId },
                          }),
                        );
                        toast.success('Opening Quick Chat huddle...');
                      }}
                    >
                      <PhoneCall className="h-4 w-4 shrink-0" />
                      <span className="truncate">{room.name}</span>
                      <span className="truncate text-xs text-slate-500">[Huddle]</span>
                      {room.purpose ? (
                        <span className="truncate text-xs text-slate-500">- {room.purpose}</span>
                      ) : null}
                      <span className="truncate rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                        Invite only
                      </span>
                      {room.alwaysLive ? (
                        <span className="truncate rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
                          Always Live
                        </span>
                      ) : null}
                    </Link>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-red-600 hover:text-red-600"
                      onClick={() => updateRoomsMutation.mutate(rooms.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Remove
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}
