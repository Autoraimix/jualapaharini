import React, { useCallback, useEffect, useState } from 'react';
import * as xlsx from 'xlsx';
import {
  Sparkles,
  Send,
  Save,
  Clock,
  Trash2,
  Edit3,
  RefreshCw,
  Plus,
  MessageCircle,
  ToggleLeft,
  ToggleRight,
  Link2,
  History,
  Eye,
  EyeOff,
  UserPlus,
  Users,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Check,
  X,
  CalendarClock,
  Bot,
  CheckCircle2,
  XCircle,
  ImagePlus,
  Film,
  Upload,
  Loader2,
  Copy,
  FileSpreadsheet,
  BarChart2,
  TrendingUp,
  RotateCcw,
  Brain,
  Lightbulb,
  BookOpen,
  PauseCircle,
  PlayCircle,
  Tag,
  AlignLeft,
  Download,
} from 'lucide-react';
import { getStoredToken } from '../api';
import { BUILTIN_PERSONAS } from './AdminPersonas';
import { PostNowPreviewPanel, DraftReviewPanel } from './AdminThreadsPreview';
import { AdminThreadsEngage } from './AdminThreadsEngage';
import { ConfirmDialog, ResultDialog } from './ActionModals';

const MYT_TZ = 'Asia/Kuala_Lumpur';
const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;

function toMalaysiaLocalInput(iso) {
  return new Date(new Date(iso).getTime() + MYT_OFFSET_MS).toISOString().slice(0, 16);
}

function fromMalaysiaLocalInput(local) {
  return new Date(new Date(`${local}:00Z`).getTime() - MYT_OFFSET_MS).toISOString();
}

const TIMEZONES = [
  { label: 'UTC', value: 'UTC' },
  { label: 'UTC+8 — Kuala Lumpur / Singapore', value: 'Asia/Kuala_Lumpur' },
  { label: 'UTC+8 — Taipei / Hong Kong', value: 'Asia/Taipei' },
  { label: 'UTC+7 — Jakarta / Bangkok', value: 'Asia/Jakarta' },
  { label: 'UTC+9 — Tokyo / Seoul', value: 'Asia/Tokyo' },
  { label: 'UTC+0 — London', value: 'Europe/London' },
  { label: 'UTC-5 — New York', value: 'America/New_York' },
  { label: 'UTC+10 — Sydney', value: 'Australia/Sydney' },
];

const BUILTIN_NAMES = BUILTIN_PERSONAS.map((p) => p.name);

async function apiFetch(url, opts = {}) {
  const token = getStoredToken();
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const data = res.status === 204 ? null : await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data?.code || '';
    throw err;
  }
  return data;
}

function matchPersona(input, personas) {
  if (!input || !input.trim()) return personas[Math.floor(Math.random() * personas.length)];
  const q = input.toLowerCase().trim();
  const exact = personas.find((p) => p.toLowerCase() === q);
  if (exact) return exact;
  const sub = personas.find((p) => p.toLowerCase().includes(q) || q.includes(p.toLowerCase()));
  if (sub) return sub;
  const qWords = new Set(q.split(/\W+/).filter(Boolean));
  let bestScore = 0;
  let bestPersona = personas[Math.floor(Math.random() * personas.length)];
  for (const p of personas) {
    const overlap = p
      .toLowerCase()
      .split(/\W+/)
      .filter(Boolean)
      .filter((w) => qWords.has(w)).length;
    if (overlap > bestScore) {
      bestScore = overlap;
      bestPersona = p;
    }
  }
  return bestPersona;
}

function resolveCell(row, ...aliases) {
  for (const alias of aliases) {
    const key = Object.keys(row).find(
      (k) => k.toLowerCase().replace(/[\s_-]/g, '') === alias.toLowerCase().replace(/[\s_-]/g, '')
    );
    if (key !== undefined && row[key] !== undefined && row[key] !== null) {
      const val = String(row[key]).trim();
      if (val !== '') return val;
    }
  }
  return '';
}

function CharCount({ value, max = 500 }) {
  const len = (value || '').length;
  const pct = len / max;
  return (
    <span
      className={`text-[11px] font-bold tabular-nums ${
        pct >= 1 ? 'text-rose-600' : pct >= 0.8 ? 'text-amber-700' : 'text-[#8C837A]'
      }`}
    >
      {len}/{max}
    </span>
  );
}

function SecretField({ label, value, onCopied }) {
  const [visible, setVisible] = useState(false);
  if (!value) return <p className="text-[11px] italic text-[#A39A91]">{label}: —</p>;

  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className="w-20 shrink-0 text-[#8C837A]">{label}:</span>
      <span className="flex-1 truncate font-mono text-[#1D1C1A]">{visible ? value : '••••••••'}</span>
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="text-[#8C837A] hover:text-[#1D1C1A]"
      >
        {visible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      </button>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(value);
          onCopied?.(`${label} copied.`);
        }}
        className="text-[#8C837A] hover:text-[#1D1C1A]"
        title={`Copy ${label}`}
      >
        <Copy className="h-3 w-3" />
      </button>
    </div>
  );
}

function CreateAccountModal({ onSave, onCancel, personas }) {
  const [form, setForm] = useState({
    username: '',
    password: '',
    productKey: '',
    apiKey: '',
    persona: 'Professional Marketer',
    postsPerDay: 1,
    timezone: 'Asia/Kuala_Lumpur',
  });
  const [showPwd, setShowPwd] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-extrabold text-[#1D1C1A]">
            <UserPlus className="h-4 w-4 text-[#F58C56]" />
            Add Threads Account
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full p-1 text-[#8C837A] hover:bg-[#FAF7F2]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            const token = getStoredToken();
            window.location.href = `/api/threads/oauth/start?token=${encodeURIComponent(token)}`;
          }}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1E1D1B] py-2.5 text-xs font-bold text-white hover:bg-black"
        >
          <MessageCircle className="h-4 w-4" />
          Connect with Threads
        </button>
        <p className="text-center text-[11px] text-[#8C837A]">
          Or enter account details manually below:
        </p>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="mb-1 block text-xs font-bold text-[#6E655D]">Username *</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="@handle"
                className="w-full rounded-xl bg-[#FAF7F2] px-3 py-2 text-xs font-semibold"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-[#6E655D]">Password *</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full rounded-xl bg-[#FAF7F2] px-3 py-2 pr-8 text-xs font-semibold"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8C837A]"
                >
                  {showPwd ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-[#6E655D]">Product Key</label>
            <input
              type="text"
              value={form.productKey}
              onChange={(e) => setForm((f) => ({ ...f, productKey: e.target.value }))}
              placeholder="Optional"
              className="w-full rounded-xl bg-[#FAF7F2] px-3 py-2 text-xs font-semibold"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-[#6E655D]">
              API Key (Threads access token)
            </label>
            <input
              type="text"
              value={form.apiKey}
              onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
              placeholder="Required to publish"
              className="w-full rounded-xl bg-[#FAF7F2] px-3 py-2 text-xs font-semibold"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="mb-1 block text-xs font-bold text-[#6E655D]">Persona</label>
              <select
                value={form.persona}
                onChange={(e) => setForm((f) => ({ ...f, persona: e.target.value }))}
                className="w-full rounded-xl bg-[#FAF7F2] px-3 py-2 text-xs font-bold"
              >
                {personas.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-[#6E655D]">Posts/Day</label>
              <input
                type="number"
                min={1}
                max={50}
                value={form.postsPerDay}
                onChange={(e) => setForm((f) => ({ ...f, postsPerDay: Number(e.target.value) }))}
                className="w-full rounded-xl bg-[#FAF7F2] px-3 py-2 text-xs font-semibold"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-[#6E655D]">Timezone</label>
            <select
              value={form.timezone}
              onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
              className="w-full rounded-xl bg-[#FAF7F2] px-3 py-2 text-xs font-bold"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2 border-t border-[#EFE9E0] pt-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl bg-[#FAF7F2] py-2.5 text-xs font-bold text-[#6E655D]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!form.username.trim() || !form.password.trim()}
            onClick={() => onSave(form)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#F58C56] py-2.5 text-xs font-bold text-white disabled:opacity-50"
          >
            <UserPlus className="h-3.5 w-3.5" /> Add Account
          </button>
        </div>
      </div>
    </div>
  );
}

function AccountCard({ account, selected, onSelect, onUpdate, onDelete, personas, onStatusBanner }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    username: account.username,
    password: account.password,
    productKey: account.productKey ?? '',
    apiKey: account.apiKey ?? '',
    persona: account.persona,
    postsPerDay: account.postsPerDay,
    timezone: account.timezone ?? 'Asia/Kuala_Lumpur',
    proxyUrl: account.proxyUrl ?? '',
    labels: account.labels ?? '',
    writingInstructions: account.writingInstructions ?? '',
    autoPostEnabled: account.autoPostEnabled ?? false,
    autoPostMaxPerDay: account.autoPostMaxPerDay ?? 1,
    autoPostMode: account.autoPostMode ?? 'draft',
    autoPostWindowStart: account.autoPostWindowStart ?? '08:00',
    autoPostWindowEnd: account.autoPostWindowEnd ?? '22:00',
  });

  const handleSave = () => {
    onUpdate({
      ...form,
      postsPerDay: Number(form.postsPerDay),
      autoPostMaxPerDay: Number(form.autoPostMaxPerDay),
    });
    setEditing(false);
  };

  const autoPostSummary = account.autoPostEnabled
    ? `${account.autoPostMaxPerDay === 2 ? '1–2' : '1'}/day · ${account.autoPostWindowStart}–${
        account.autoPostWindowEnd
      } · ${account.autoPostMode === 'publish' ? 'Auto-publish' : 'Draft'}`
    : null;

  return (
    <div
      className={`space-y-2.5 rounded-2xl border p-3.5 transition ${
        selected ? 'border-[#F58C56] bg-[#FFF9F5]' : 'border-[#EFE9E0] bg-white'
      }`}
    >
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          className="h-4 w-4 accent-[#F58C56]"
        />
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            account.strikes === 0
              ? 'bg-emerald-100 text-emerald-700'
              : account.strikes <= 3
                ? 'bg-amber-100 text-amber-800'
                : 'bg-rose-100 text-rose-700'
          }`}
        >
          {account.strikes === 0 ? '● healthy' : `${account.strikes}✕`}
        </span>
        <span className="flex flex-1 items-center gap-1 truncate text-xs font-extrabold text-[#1D1C1A]">
          @{account.username}
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(account.username);
              onStatusBanner?.({ type: 'success', text: 'Username copied.' });
            }}
            className="text-[#8C837A] hover:text-[#1D1C1A]"
          >
            <Copy className="h-3 w-3" />
          </button>
        </span>
        <span className="rounded-full bg-[#FAF7F2] px-2 py-0.5 text-[10px] font-bold text-[#6E655D]">
          {account.postsPerDay}/day
        </span>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className="rounded-lg p-1 text-[#6E655D] hover:bg-[#FAF7F2]"
        >
          <Edit3 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-lg p-1 text-rose-600 hover:bg-rose-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {!editing ? (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-[#FFF0E6] px-2.5 py-0.5 text-[11px] font-bold text-[#C85A21]">
              {account.persona}
            </span>
            {account.labels &&
              account.labels
                .split(',')
                .map((l) => l.trim())
                .filter(Boolean)
                .map((l) => (
                  <span
                    key={l}
                    className="rounded-full bg-[#FAF7F2] px-2 py-0.5 text-[10px] font-bold text-[#6E655D]"
                  >
                    #{l}
                  </span>
                ))}
          </div>

          <div
            className={`flex items-center gap-2 rounded-xl px-3 py-2 ${
              account.autoPostEnabled ? 'bg-sky-50 text-sky-900' : 'bg-[#FAF7F2] text-[#6E655D]'
            }`}
          >
            <Bot className="h-3.5 w-3.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-extrabold">Auto-Post</div>
              {autoPostSummary && <div className="truncate text-[10px] opacity-80">{autoPostSummary}</div>}
            </div>
            {account.autoPostEnabled && (
              <button
                type="button"
                onClick={() =>
                  onUpdate({ autoPostMode: account.autoPostMode === 'publish' ? 'draft' : 'publish' })
                }
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                  account.autoPostMode === 'publish'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {account.autoPostMode === 'publish' ? 'Auto-publish' : 'Draft Mode'}
              </button>
            )}
            <button
              type="button"
              onClick={() => onUpdate({ autoPostEnabled: !account.autoPostEnabled })}
              title={account.autoPostEnabled ? 'Turn off auto-post' : 'Turn on auto-post'}
            >
              {account.autoPostEnabled ? (
                <ToggleRight className="h-5 w-5 text-sky-600" />
              ) : (
                <ToggleLeft className="h-5 w-5" />
              )}
            </button>
          </div>

          <div className="space-y-1 border-t border-[#EFE9E0] pt-2">
            <SecretField
              label="Password"
              value={account.password}
              onCopied={(t) => onStatusBanner?.({ type: 'success', text: t })}
            />
            <SecretField
              label="Product Key"
              value={account.productKey}
              onCopied={(t) => onStatusBanner?.({ type: 'success', text: t })}
            />
            <SecretField
              label="API Key"
              value={account.apiKey}
              onCopied={(t) => onStatusBanner?.({ type: 'success', text: t })}
            />
          </div>
        </>
      ) : (
        <div className="space-y-2 border-t border-[#EFE9E0] pt-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              placeholder="Username"
              className="rounded-xl bg-[#FAF7F2] px-2.5 py-1.5 text-xs"
            />
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Password"
              className="rounded-xl bg-[#FAF7F2] px-2.5 py-1.5 text-xs"
            />
          </div>
          <input
            type="text"
            value={form.apiKey}
            onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
            placeholder="Threads API Key / Access Token"
            className="w-full rounded-xl bg-[#FAF7F2] px-2.5 py-1.5 text-xs"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={form.persona}
              onChange={(e) => setForm((f) => ({ ...f, persona: e.target.value }))}
              className="rounded-xl bg-[#FAF7F2] px-2.5 py-1.5 text-xs font-bold"
            >
              {personas.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              max={50}
              value={form.postsPerDay}
              onChange={(e) => setForm((f) => ({ ...f, postsPerDay: Number(e.target.value) }))}
              className="rounded-xl bg-[#FAF7F2] px-2.5 py-1.5 text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={form.labels}
              onChange={(e) => setForm((f) => ({ ...f, labels: e.target.value }))}
              placeholder="Labels (comma separated)"
              className="rounded-xl bg-[#FAF7F2] px-2.5 py-1.5 text-xs"
            />
            <select
              value={form.timezone}
              onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
              className="rounded-xl bg-[#FAF7F2] px-2.5 py-1.5 text-xs font-bold"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>
          <input
            type="text"
            value={form.writingInstructions}
            onChange={(e) => setForm((f) => ({ ...f, writingInstructions: e.target.value }))}
            placeholder="Standing writing instructions (optional)"
            className="w-full rounded-xl bg-[#FAF7F2] px-2.5 py-1.5 text-xs"
          />
          <div className="space-y-2 rounded-xl bg-[#FAF7F2] p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">Auto-Post</span>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, autoPostEnabled: !f.autoPostEnabled }))}
              >
                {form.autoPostEnabled ? (
                  <ToggleRight className="h-5 w-5 text-sky-600" />
                ) : (
                  <ToggleLeft className="h-5 w-5 text-[#8C837A]" />
                )}
              </button>
            </div>
            {form.autoPostEnabled && (
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={form.autoPostMaxPerDay}
                  onChange={(e) => setForm((f) => ({ ...f, autoPostMaxPerDay: Number(e.target.value) }))}
                  className="rounded-xl bg-white px-2 py-1 text-xs"
                >
                  <option value={1}>1 post / day</option>
                  <option value={2}>Up to 2 posts / day</option>
                </select>
                <select
                  value={form.autoPostMode}
                  onChange={(e) => setForm((f) => ({ ...f, autoPostMode: e.target.value }))}
                  className="rounded-xl bg-white px-2 py-1 text-xs"
                >
                  <option value="draft">Draft (review first)</option>
                  <option value="publish">Auto-publish</option>
                </select>
                <input
                  type="time"
                  value={form.autoPostWindowStart}
                  onChange={(e) => setForm((f) => ({ ...f, autoPostWindowStart: e.target.value }))}
                  className="rounded-xl bg-white px-2 py-1 text-xs"
                />
                <input
                  type="time"
                  value={form.autoPostWindowEnd}
                  onChange={(e) => setForm((f) => ({ ...f, autoPostWindowEnd: e.target.value }))}
                  className="rounded-xl bg-white px-2 py-1 text-xs"
                />
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-1 rounded-xl bg-[#FAF7F2] py-1.5 text-xs font-bold"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 rounded-xl bg-[#1E1D1B] py-1.5 text-xs font-bold text-white"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MediaUploader({ value, onChange, onStatusBanner }) {
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const remaining = 10 - value.length;
    if (remaining <= 0) {
      onStatusBanner?.({ type: 'error', text: 'Maximum 10 media files allowed.' });
      return;
    }
    const files = Array.from(fileList).slice(0, remaining);
    setUploading(true);
    try {
      const fileData = await Promise.all(
        files.map(
          (file) =>
            new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve({ name: file.name, type: file.type, data: reader.result });
              reader.onerror = reject;
              reader.readAsDataURL(file);
            })
        )
      );
      const data = await apiFetch('/api/media/upload', {
        method: 'POST',
        body: JSON.stringify({ files: fileData }),
      });
      onChange([...value, ...(data.files || [])]);
      onStatusBanner?.({ type: 'success', text: `Uploaded ${data.files?.length || 0} file(s).` });
    } catch (err) {
      onStatusBanner?.({ type: 'error', text: err.message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2.5">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-[#E6DFD5] bg-[#FAF7F2] p-4 text-center hover:border-[#F58C56]">
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          disabled={uploading}
        />
        {uploading ? (
          <Loader2 className="h-5 w-5 animate-spin text-[#F58C56]" />
        ) : (
          <Upload className="h-5 w-5 text-[#8C837A]" />
        )}
        <span className="text-xs font-bold text-[#1D1C1A]">
          {uploading ? 'Uploading...' : 'Click to attach images or videos'}
        </span>
        <span className="text-[10px] text-[#8C837A]">JPG, PNG, GIF, WebP, MP4, MOV · up to 10 files</span>
      </label>

      {value.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {value.map((file, i) => (
            <div key={i} className="relative aspect-square overflow-hidden rounded-xl border border-[#EFE9E0] bg-[#FAF7F2]">
              {file.type === 'image' ? (
                <img src={file.url} alt={file.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center p-1 text-[10px] text-[#6E655D]">
                  <Film className="h-4 w-4" />
                  <span className="truncate">{file.name}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduledRow({ post, onCancel, onSave, onApprove, onImageChange, onStatusBanner }) {
  const [editing, setEditing] = useState(false);
  const [draftContent, setDraftContent] = useState(post.content);
  const [draftTime, setDraftTime] = useState(post.scheduledAt ? toMalaysiaLocalInput(post.scheduledAt) : '');
  const [comment, setComment] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);

  const isPending = post.status === 'pending';
  const isDraft = post.status === 'draft';
  const isEditable = isPending || isDraft;
  const wasEdited = draftContent.trim() !== post.content.trim();

  const handleImageUpload = async (file) => {
    setUploadingImage(true);
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await apiFetch('/api/media/upload', {
        method: 'POST',
        body: JSON.stringify({ files: [{ name: file.name, type: file.type, data }] }),
      });
      onImageChange(post.id, result.files[0].url);
    } catch (err) {
      onStatusBanner?.({ type: 'error', text: err.message });
    } finally {
      setUploadingImage(false);
    }
  };

  return (
    <div
      className={`space-y-2 rounded-2xl border p-3.5 ${
        isDraft ? 'border-sky-200 bg-sky-50/50' : 'border-[#EFE9E0] bg-white'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isDraft ? (
            <Bot className="h-3.5 w-3.5 text-sky-600" />
          ) : (
            <Clock className="h-3.5 w-3.5 text-amber-600" />
          )}
          <span className="text-xs font-extrabold text-[#1D1C1A]">@{post.username}</span>
          <span className="rounded-full bg-[#FAF7F2] px-2 py-0.5 text-[10px] font-bold text-[#6E655D]">
            {post.persona}
          </span>
          {isDraft && (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">
              Needs review
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-[#8C837A]">
            {new Date(post.scheduledAt).toLocaleString([], {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: MYT_TZ,
            })}{' '}
            MYT
          </span>
          {isDraft && !editing && (
            <button
              type="button"
              onClick={onApprove}
              title="Approve"
              className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-50"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          )}
          {isEditable && !editing && (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-lg p-1 text-[#6E655D] hover:bg-[#FAF7F2]"
              >
                <Edit3 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg p-1 text-rose-600 hover:bg-rose-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {post.imageUrl ? (
        <div className="relative inline-block">
          <img src={post.imageUrl} alt="" className="h-14 w-14 rounded-xl object-cover" />
          {isEditable && (
            <button
              type="button"
              onClick={() => onImageChange(post.id, null)}
              className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-white"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      ) : (
        isEditable && (
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-dashed border-[#D6CFC7] px-2.5 py-1 text-[11px] font-bold text-[#6E655D]">
            {uploadingImage ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
            {uploadingImage ? 'Uploading...' : 'Attach image'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImageUpload(f);
                e.target.value = '';
              }}
            />
          </label>
        )
      )}

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            maxLength={500}
            className="min-h-[85px] w-full rounded-xl bg-[#FAF7F2] p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#F58C56]"
          />
          <div className="flex justify-between text-[11px]">
            <CharCount value={draftContent} />
          </div>
          <input
            type="datetime-local"
            value={draftTime}
            onChange={(e) => setDraftTime(e.target.value)}
            className="w-full rounded-xl bg-[#FAF7F2] px-3 py-1.5 text-xs"
          />
          {wasEdited && (
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Why did you edit this? (optional — helps AI learn)"
              maxLength={200}
              className="w-full rounded-xl bg-[#FAF7F2] px-3 py-1.5 text-xs"
            />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-1 rounded-xl bg-[#FAF7F2] py-1.5 text-xs font-bold"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => {
                onSave(
                  post.id,
                  draftContent,
                  fromMalaysiaLocalInput(draftTime),
                  wasEdited ? { originalContent: post.content, comment } : undefined
                );
                setEditing(false);
              }}
              className="flex-1 rounded-xl bg-[#1E1D1B] py-1.5 text-xs font-bold text-white"
            >
              Save Changes
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-[#6E655D]">{post.content}</p>
      )}

      {post.errorMessage && <p className="text-[11px] font-semibold text-rose-600">{post.errorMessage}</p>}
    </div>
  );
}

export function AdminThreadsPosting({ products = [], onStatusBanner, onApiError }) {
  const [tab, setTab] = useState('compose'); // compose | automate | engage | drafts | history | analytics

  // Personas
  const [customPersonas, setCustomPersonas] = useState([]);
  const PERSONAS = [
    ...BUILTIN_NAMES,
    ...customPersonas.filter((p) => p.isEnabled === 'true').map((p) => p.name),
  ];

  // Compose state
  const [topic, setTopic] = useState('');
  const [selectedPersonas, setSelectedPersonas] = useState([]);
  const [postType, setPostType] = useState('single');
  const [links, setLinks] = useState([]);
  const [linkInput, setLinkInput] = useState('');
  const [generatedPosts, setGeneratedPosts] = useState([]);
  const [summary, setSummary] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [composeMedia, setComposeMedia] = useState([]);
  const [generatingCompose, setGeneratingCompose] = useState(false);
  const [publishingCompose, setPublishingCompose] = useState(false);

  // Automate state
  const [automateView, setAutomateView] = useState('setup');
  const [accounts, setAccounts] = useState([]);
  const [accountsTotal, setAccountsTotal] = useState(0);
  const [accountsPages, setAccountsPages] = useState(1);
  const [accountsPage, setAccountsPage] = useState(1);
  const [showAllAccounts, setShowAllAccounts] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState([]);
  const [labelFilter, setLabelFilter] = useState(null);
  const [showCreateAccount, setShowCreateAccount] = useState(false);

  const [autoTopic, setAutoTopic] = useState('');
  const [autoPostType, setAutoPostType] = useState('single');
  const [autoLinks, setAutoLinks] = useState([]);
  const [autoLinkInput, setAutoLinkInput] = useState('');
  const [postLength, setPostLength] = useState('medium');
  const [postMode, setPostMode] = useState('now');
  const [scheduleDays, setScheduleDays] = useState(1);
  const [suggestLocation, setSuggestLocation] = useState('Selangor, Malaysia');
  const [topicSuggestions, setTopicSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [topicTemplates, setTopicTemplates] = useState([]);

  const [previewItems, setPreviewItems] = useState(null);
  const [draftPosts, setDraftPosts] = useState(null);
  const [postNowResults, setPostNowResults] = useState(null);
  const [busyPreview, setBusyPreview] = useState(false);
  const [busyPublish, setBusyPublish] = useState(false);
  const [automationPaused, setAutomationPaused] = useState(false);
  const [scheduledPosts, setScheduledPosts] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyShowAll, setHistoryShowAll] = useState(false);
  const [queueStats, setQueueStats] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [resultModal, setResultModal] = useState(null);

  const loadPersonas = useCallback(async () => {
    try {
      const rows = await apiFetch('/api/personas');
      setCustomPersonas(Array.isArray(rows) ? rows : []);
    } catch {
      // Non-fatal
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      const data = await apiFetch(
        `/api/threads/accounts?${showAllAccounts ? 'all=true' : `page=${accountsPage}`}`
      );
      setAccounts(data.accounts || []);
      setAccountsTotal(data.total || 0);
      setAccountsPages(data.pages || 1);
    } catch (err) {
      onApiError?.(err);
    }
  }, [accountsPage, showAllAccounts, onApiError]);

  const loadScheduled = useCallback(async () => {
    try {
      const [sched, pause] = await Promise.all([
        apiFetch('/api/threads/scheduled'),
        apiFetch('/api/threads/scheduled/pause-status'),
      ]);
      setScheduledPosts(Array.isArray(sched) ? sched : []);
      setAutomationPaused(Boolean(pause?.paused));
    } catch (err) {
      onApiError?.(err);
    }
  }, [onApiError]);

  const loadTemplates = useCallback(async () => {
    try {
      const rows = await apiFetch('/api/threads/topic-templates');
      setTopicTemplates(Array.isArray(rows) ? rows : []);
    } catch {
      // Non-fatal
    }
  }, []);

  const loadDrafts = useCallback(async () => {
    try {
      const rows = await apiFetch('/api/threads/drafts');
      setDrafts(Array.isArray(rows) ? rows : []);
    } catch (err) {
      onApiError?.(err);
    }
  }, [onApiError]);

  const loadHistory = useCallback(async () => {
    try {
      const rows = await apiFetch('/api/threads/history');
      setHistory(Array.isArray(rows) ? rows : []);
    } catch (err) {
      onApiError?.(err);
    }
  }, [onApiError]);

  const loadStats = useCallback(async () => {
    try {
      const data = await apiFetch('/api/threads/queue/stats');
      setQueueStats(data);
    } catch (err) {
      onApiError?.(err);
    }
  }, [onApiError]);

  useEffect(() => {
    loadPersonas();
    loadTemplates();
  }, [loadPersonas, loadTemplates]);

  useEffect(() => {
    if (tab === 'automate') {
      loadAccounts();
      loadScheduled();
    } else if (tab === 'drafts') {
      loadDrafts();
    } else if (tab === 'history') {
      loadHistory();
    } else if (tab === 'analytics') {
      loadStats();
    }
  }, [tab, loadAccounts, loadScheduled, loadDrafts, loadHistory, loadStats]);

  // Strip noisy catalog tags/pack weights so Post Topic stays focused on what the product is
  const cleanProductTopicName = (rawTitle = '') =>
    String(rawTitle)
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/【[^】]*】/g, ' ')
      .replace(
        /\([^)]*(?:\b\d+(?:\.\d+)?\s*(?:g|kg|mg|ml|l|oz|pcs?|pc|pack|packs|box|boxes|tin|tins|botol|sachet|capsules?|tablets?|tabs?|x\s*\d+|rm|exp|warranty|year|yrs?|bulan|month|months)\b|\bx\s*\d+|\bexp\b|\brm\b)[^)]*(?:\)|$)/gi,
        ' '
      )
      .replace(/\s+[-–—]+\s+/g, ' ')
      .replace(/^[\s\-–—/|:,]+|[\s\-–—/|:,]+$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

  // Helper: fill topic from BeliApaHarini catalog product (clean item name + replace with all product store links)
  const handlePickProductForTopic = (productId, targetMode) => {
    const p = products.find((item) => String(item.id) === String(productId));
    if (!p) return;
    const text = cleanProductTopicName(p.title) || String(p.title || '').trim();
    const productLinks = Array.from(
      new Set(
        [p.shopee_url, p.tiktok_url, p.lazada_url, p.pinduoduo_url]
          .map((u) => String(u || '').trim())
          .filter(Boolean)
      )
    );
    if (targetMode === 'compose') {
      setTopic(text);
      setLinks(productLinks);
    } else {
      setAutoTopic(text);
      setAutoLinks(productLinks);
    }
  };

  // Compose actions
  const handleGenerateCompose = async () => {
    if (!topic.trim()) {
      onStatusBanner?.({ type: 'error', text: 'Enter a post topic first.' });
      return;
    }
    setGeneratingCompose(true);
    try {
      const data = await apiFetch('/api/ai/generate-threads', {
        method: 'POST',
        body: JSON.stringify({ topic, personas: selectedPersonas, postType, links }),
      });
      setGeneratedPosts((data.posts || []).map((p) => ({ ...p, cta: '' })));
      setSummary(data.summary || '');
      onStatusBanner?.({
        type: 'success',
        text: `Generated ${data.posts?.length || 0} post(s)${
          data._debug?.model ? ` via ${data._debug.model}` : ''
        }.`,
      });
    } catch (err) {
      onApiError?.(err);
    } finally {
      setGeneratingCompose(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!topic.trim() || generatedPosts.length === 0) return;
    try {
      await apiFetch('/api/threads/drafts', {
        method: 'POST',
        body: JSON.stringify({
          topic,
          posts: generatedPosts,
          personas: selectedPersonas,
          postType,
          scheduledAt: scheduledAt || null,
        }),
      });
      onStatusBanner?.({ type: 'success', text: 'Draft saved.' });
      loadDrafts();
    } catch (err) {
      onApiError?.(err);
    }
  };

  const executePublishCompose = async () => {
    setConfirmBusy(true);
    setPublishingCompose(true);
    try {
      const data = await apiFetch('/api/threads/publish', {
        method: 'POST',
        body: JSON.stringify({
          topic,
          posts: generatedPosts,
          personas: selectedPersonas,
          postType,
          scheduledAt: scheduledAt || null,
          media: composeMedia,
        }),
      });
      const isOk = data.status === 'success';
      onStatusBanner?.({
        type: isOk ? 'success' : 'error',
        text: data.message,
      });
      setConfirmDialog(null);
      setResultModal({
        status: isOk ? 'success' : 'error',
        title: isOk
          ? scheduledAt
            ? 'Post Scheduled Successfully'
            : 'Post Published Successfully'
          : 'Failed to Publish Post',
        message: isOk
          ? data.message || 'Your post has been published to Threads.'
          : data.errorMessage || data.message || 'Threads could not publish this post.',
        details: [
          { label: 'Topic', value: topic, ok: isOk },
          {
            label: 'Post Type',
            value: postType === 'thread' ? `Thread (${generatedPosts.length} parts)` : 'Single Post',
          },
          ...(data.threadsPostId ? [{ label: 'Threads Post ID', value: data.threadsPostId, ok: true }] : []),
        ],
      });
      if (isOk) {
        setGeneratedPosts([]);
        setTopic('');
        setSummary('');
        setScheduledAt('');
        setComposeMedia([]);
      }
    } catch (err) {
      setConfirmDialog(null);
      if (err?.status === 401) {
        onApiError?.(err);
      } else {
        onApiError?.(err);
        setResultModal({
          status: 'error',
          title: 'Failed to Publish Post',
          message: err?.message || 'An unexpected error occurred while publishing to Threads.',
        });
      }
    } finally {
      setConfirmBusy(false);
      setPublishingCompose(false);
    }
  };

  const handlePublishCompose = () => {
    if (generatedPosts.length === 0) return;
    const isScheduled = Boolean(scheduledAt);
    setConfirmDialog({
      title: isScheduled ? 'Confirm Scheduled Post' : 'Confirm Publish to Threads',
      description: isScheduled
        ? 'Are you sure you want to schedule this post for Threads?'
        : 'Are you sure you want to publish this post to Threads now? It will be visible immediately once published.',
      confirmLabel: isScheduled ? 'Yes, Schedule Post' : 'Yes, Publish Now',
      variant: isScheduled ? 'primary' : 'success',
      details: [
        { label: 'Topic', value: topic || 'Untitled Post' },
        {
          label: 'Format',
          value: postType === 'thread' ? `Thread (${generatedPosts.length} posts)` : 'Single Post',
        },
        ...(composeMedia.length > 0
          ? [{ label: 'Media Attached', value: `${composeMedia.length} file(s)` }]
          : []),
        ...(isScheduled
          ? [{ label: 'Scheduled For', value: scheduledAt.replace('T', ' ') }]
          : []),
      ],
      onConfirm: executePublishCompose,
    });
  };

  // Automate account actions
  const handleExcelImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = xlsx.read(evt.target?.result, { type: 'binary' });
        const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        const toImport = rows
          .map((row) => ({
            username: resolveCell(row, 'username'),
            password: resolveCell(row, 'password'),
            productKey: resolveCell(row, 'productkey', 'product key', 'product_key') || null,
            apiKey: resolveCell(row, 'apikey', 'api key', 'api_key') || null,
            postsPerDay: Math.max(
              1,
              Math.round(Number(resolveCell(row, 'postperday', 'postsperday', 'post per day', 'posts per day')) || 1)
            ),
            persona: matchPersona(resolveCell(row, 'persona', 'voice', 'character'), PERSONAS),
          }))
          .filter((a) => a.username && a.password);

        if (toImport.length === 0) {
          onStatusBanner?.({ type: 'error', text: 'No valid rows (Username and Password required).' });
          return;
        }
        await apiFetch('/api/threads/accounts/bulk', {
          method: 'POST',
          body: JSON.stringify(toImport),
        });
        onStatusBanner?.({ type: 'success', text: `Imported ${toImport.length} account(s).` });
        await loadAccounts();
      } catch (err) {
        onApiError?.(err);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleExcelExport = async () => {
    try {
      const { accounts: allAccounts } = await apiFetch('/api/threads/accounts?all=true');
      if (!allAccounts?.length) {
        onStatusBanner?.({ type: 'error', text: 'No accounts to export.' });
        return;
      }
      const rows = allAccounts.map((a) => ({
        Username: a.username,
        Password: a.password,
        'Product Key': a.productKey ?? '',
        'API Key': a.apiKey ?? '',
        'Posts Per Day': a.postsPerDay,
        Persona: a.persona,
      }));
      const ws = xlsx.utils.json_to_sheet(rows);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, 'Accounts');
      xlsx.writeFile(wb, `thread-accounts-${new Date().toISOString().slice(0, 10)}.xlsx`);
      onStatusBanner?.({ type: 'success', text: `Exported ${allAccounts.length} account(s).` });
    } catch (err) {
      onApiError?.(err);
    }
  };

  const handlePostNowPreview = async () => {
    if (!autoTopic.trim() || selectedAccountIds.length === 0) return;
    setBusyPreview(true);
    setPostNowResults(null);
    try {
      const data = await apiFetch('/api/threads/preview', {
        method: 'POST',
        body: JSON.stringify({
          topic: autoTopic,
          links: autoLinks,
          postType: autoPostType,
          accountIds: selectedAccountIds,
          postLength,
        }),
      });
      setPreviewItems(data);
    } catch (err) {
      onApiError?.(err);
    } finally {
      setBusyPreview(false);
    }
  };

  const executePublishFromPreview = async (approved) => {
    setConfirmBusy(true);
    setBusyPublish(true);
    try {
      for (const item of approved) {
        if (item.edited && item.content.trim() !== item.originalContent.trim()) {
          apiFetch('/api/threads/content-edits', {
            method: 'POST',
            body: JSON.stringify({
              accountId: item.accountId,
              persona: accounts.find((a) => a.id === item.accountId)?.persona,
              topic: autoTopic,
              originalContent: item.originalContent,
              editedContent: item.content,
              userComment: item.comment || null,
            }),
          }).catch(() => {});
        }
      }
      setConfirmDialog(null);
      setPreviewItems(null);
      const res = await apiFetch('/api/threads/post-now', {
        method: 'POST',
        body: JSON.stringify({
          topic: autoTopic,
          links: autoLinks,
          postType: autoPostType,
          accountIds: approved.map((a) => a.accountId),
          preGeneratedContent: approved.map((a) => ({ accountId: a.accountId, content: a.content })),
          postLength,
        }),
      });
      const results = res.results || [];
      setPostNowResults(results);
      const total = results.length;
      const allOk = res.failCount === 0 && res.successCount > 0;
      onStatusBanner?.({
        type: res.failCount > 0 ? 'error' : 'success',
        text: `Posted to ${res.successCount}/${total} account(s).`,
      });
      setResultModal({
        status: allOk ? 'success' : 'error',
        title: allOk
          ? 'Posts Published Successfully'
          : res.successCount > 0
            ? 'Published with Partial Errors'
            : 'Failed to Publish Posts',
        message: allOk
          ? `All ${res.successCount} selected account(s) published your post to Threads.`
          : `Published to ${res.successCount} of ${total} account(s). Check the account results below for details.`,
        details: results.map((r) => ({
          label: `@${r.username}`,
          value: r.status === 'success' ? 'Published' : r.error || 'Failed',
          ok: r.status === 'success',
        })),
      });
    } catch (err) {
      setConfirmDialog(null);
      if (err?.status === 401) {
        onApiError?.(err);
      } else {
        onApiError?.(err);
        setResultModal({
          status: 'error',
          title: 'Failed to Publish Posts',
          message: err?.message || 'An unexpected error occurred while publishing.',
        });
      }
    } finally {
      setConfirmBusy(false);
      setBusyPublish(false);
    }
  };

  const handlePublishFromPreview = (approved) => {
    setConfirmDialog({
      title: 'Confirm Bulk Publish to Threads',
      description: `Are you sure you want to publish now to ${approved.length} selected Threads account(s)?`,
      confirmLabel: `Yes, Publish (${approved.length})`,
      variant: 'success',
      details: [
        { label: 'Topic', value: autoTopic },
        { label: 'Accounts', value: `${approved.length} account(s)` },
        { label: 'Format', value: autoPostType === 'thread' ? 'Thread' : 'Single Post' },
      ],
      onConfirm: () => executePublishFromPreview(approved),
    });
  };

  const handleAutomatePreview = async () => {
    if (!autoTopic.trim() || selectedAccountIds.length === 0) return;
    setBusyPreview(true);
    try {
      const data = await apiFetch('/api/threads/automate/preview', {
        method: 'POST',
        body: JSON.stringify({
          topic: autoTopic,
          links: autoLinks,
          postType: autoPostType,
          accountIds: selectedAccountIds,
          days: scheduleDays,
          postLength,
        }),
      });
      setDraftPosts(data.previews || []);
    } catch (err) {
      onApiError?.(err);
    } finally {
      setBusyPreview(false);
    }
  };

  const executeScheduleFromDraft = async (approvedPosts) => {
    setConfirmBusy(true);
    setBusyPublish(true);
    try {
      const data = await apiFetch('/api/threads/automate', {
        method: 'POST',
        body: JSON.stringify({
          topic: autoTopic,
          links: autoLinks,
          postType: autoPostType,
          accountIds: selectedAccountIds,
          days: scheduleDays,
          postLength,
          preGeneratedPosts: approvedPosts.map((p) => ({
            accountId: p.accountId,
            content: p.content,
            scheduledAt: p.scheduledAt,
          })),
        }),
      });
      setConfirmDialog(null);
      setDraftPosts(null);
      onStatusBanner?.({ type: 'success', text: data.message });
      await loadScheduled();
      setAutomateView('queue');
      setResultModal({
        status: 'success',
        title: 'Campaign Scheduled Successfully',
        message:
          data.message ||
          `${approvedPosts.length} post(s) have been queued for automated publishing.`,
        details: [
          { label: 'Topic', value: autoTopic },
          { label: 'Queued Posts', value: `${approvedPosts.length} post(s)`, ok: true },
          { label: 'Duration', value: `${scheduleDays} day(s)` },
        ],
      });
    } catch (err) {
      setConfirmDialog(null);
      if (err?.status === 401) {
        onApiError?.(err);
      } else {
        onApiError?.(err);
        setResultModal({
          status: 'error',
          title: 'Failed to Schedule Campaign',
          message: err?.message || 'An unexpected error occurred while scheduling posts.',
        });
      }
    } finally {
      setConfirmBusy(false);
      setBusyPublish(false);
    }
  };

  const handleScheduleFromDraft = (approvedPosts) => {
    setConfirmDialog({
      title: 'Confirm Automated Schedule',
      description: `Are you sure you want to schedule ${approvedPosts.length} post(s) across ${scheduleDays} day(s)?`,
      confirmLabel: `Yes, Schedule (${approvedPosts.length})`,
      variant: 'primary',
      details: [
        { label: 'Topic', value: autoTopic },
        { label: 'Total Posts', value: `${approvedPosts.length} post(s)` },
        { label: 'Schedule Window', value: `${scheduleDays} day(s)` },
      ],
      onConfirm: () => executeScheduleFromDraft(approvedPosts),
    });
  };

  const allLabels = Array.from(
    new Set(
      accounts.flatMap((a) =>
        (a.labels || '')
          .split(',')
          .map((l) => l.trim())
          .filter(Boolean)
      )
    )
  );
  const filteredAccounts = labelFilter
    ? accounts.filter((a) =>
        (a.labels || '')
          .split(',')
          .map((l) => l.trim())
          .includes(labelFilter)
      )
    : accounts;

  const pendingCount = scheduledPosts.filter((p) => p.status === 'pending').length;
  const draftReviewCount = scheduledPosts.filter((p) => p.status === 'draft').length;
  const publishedCount = scheduledPosts.filter((p) => p.status === 'published').length;
  const failedCount = scheduledPosts.filter((p) => p.status === 'failed').length;
  const queueVisiblePosts = scheduledPosts.filter((p) => p.status === 'pending' || p.status === 'draft');

  // History filter & pagination
  const filteredHistory = history.filter((h) => {
    if (historyFilter === 'published') return h.status === 'success';
    if (historyFilter === 'failed') return h.status !== 'success';
    return true;
  });
  const historyPages = Math.max(1, Math.ceil(filteredHistory.length / 10));
  const visibleHistory = historyShowAll
    ? filteredHistory
    : filteredHistory.slice((historyPage - 1) * 10, historyPage * 10);

  return (
    <div className="space-y-4">
      {previewItems && (
        <PostNowPreviewPanel
          items={previewItems}
          topic={autoTopic}
          isPending={busyPublish}
          onPublish={handlePublishFromPreview}
          onCancel={() => setPreviewItems(null)}
        />
      )}
      {draftPosts && (
        <DraftReviewPanel
          drafts={draftPosts}
          days={scheduleDays}
          isPending={busyPublish}
          onSchedule={handleScheduleFromDraft}
          onCancel={() => setDraftPosts(null)}
        />
      )}
      {showCreateAccount && (
        <CreateAccountModal
          personas={PERSONAS}
          onSave={async (data) => {
            try {
              const acc = await apiFetch('/api/threads/accounts', {
                method: 'POST',
                body: JSON.stringify(data),
              });
              setShowCreateAccount(false);
              onStatusBanner?.({ type: 'success', text: `Account @${acc.username} added.` });
              await loadAccounts();
            } catch (err) {
              onApiError?.(err);
            }
          }}
          onCancel={() => setShowCreateAccount(false)}
        />
      )}

      {/* Sub-navigation bar */}
      <section className="rounded-[28px] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-extrabold text-[#1D1C1A]">
              <MessageCircle className="h-5 w-5 text-[#F58C56]" />
              AI Marketing Posting
            </h3>
            <p className="mt-0.5 text-xs text-[#8C837A]">
              Generate, schedule, and publish persona-crafted content to Threads via OpenRouter.
            </p>
          </div>
          <div className="flex flex-wrap gap-1 rounded-full bg-[#FAF7F2] p-1">
            {[
              { id: 'compose', label: 'Compose', icon: Sparkles },
              { id: 'automate', label: 'Automate Post', icon: Bot },
              { id: 'engage', label: 'Engage', icon: MessageCircle },
              { id: 'drafts', label: 'Drafts', icon: Save },
              { id: 'history', label: 'History', icon: History },
              { id: 'analytics', label: 'Analytics', icon: BarChart2 },
            ].map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                    tab === t.id ? 'bg-[#1E1D1B] text-white' : 'text-[#6E655D] hover:text-[#1D1C1A]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── COMPOSE ── */}
      {tab === 'compose' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="rounded-[24px] bg-white p-4 shadow-sm">
              <div className="mb-2 text-xs font-extrabold text-[#1D1C1A]">Post Type</div>
              <div className="flex gap-2">
                {['single', 'thread'].map((pt) => (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => setPostType(pt)}
                    className={`flex-1 rounded-2xl border p-3 text-left transition ${
                      postType === pt
                        ? 'border-[#F58C56] bg-[#FFF9F5]'
                        : 'border-[#EFE9E0] bg-[#FAF7F2]'
                    }`}
                  >
                    <div className="text-xs font-extrabold text-[#1D1C1A]">
                      {pt === 'single' ? 'Single Post' : 'Thread'}
                    </div>
                    <div className="text-[11px] text-[#8C837A]">
                      {pt === 'single' ? 'One standalone post' : 'Multiple connected posts'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] bg-white p-4 shadow-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-extrabold text-[#1D1C1A]">
                  Writing Personas ({selectedPersonas.length}/10)
                </span>
              </div>
              <p className="mb-2.5 text-[11px] text-[#8C837A]">AI blends selected voices together</p>
              <div className="flex flex-wrap gap-1.5">
                {PERSONAS.map((p) => {
                  const active = selectedPersonas.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() =>
                        setSelectedPersonas((prev) =>
                          prev.includes(p)
                            ? prev.filter((x) => x !== p)
                            : prev.length < 10
                              ? [...prev, p]
                              : prev
                        )
                      }
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${
                        active
                          ? 'border-[#F58C56] bg-[#FFF0E6] text-[#C85A21]'
                          : 'border-[#EFE9E0] bg-[#FAF7F2] text-[#6E655D] hover:border-[#D6CFC7]'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 rounded-[24px] bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-extrabold text-[#1D1C1A]">Post Topic *</label>
                {products.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) handlePickProductForTopic(e.target.value, 'compose');
                      e.target.value = '';
                    }}
                    className="max-w-[220px] rounded-xl bg-[#FAF7F2] px-2.5 py-1 text-[11px] font-bold text-[#6E655D]"
                  >
                    <option value="">Promote a catalog product...</option>
                    {products.slice(0, 50).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Describe what you want to post about..."
                className="min-h-[85px] w-full rounded-xl bg-[#FAF7F2] p-3 text-xs font-semibold text-[#1D1C1A] focus:outline-none focus:ring-2 focus:ring-[#F58C56]"
              />
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-bold text-[#6E655D]">
                  <Link2 className="h-3 w-3" /> Links (optional)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={linkInput}
                    onChange={(e) => setLinkInput(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 rounded-xl bg-[#FAF7F2] px-3 py-2 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (linkInput.trim() && !links.includes(linkInput.trim())) {
                        setLinks((prev) => [...prev, linkInput.trim()]);
                        setLinkInput('');
                      }
                    }}
                    className="rounded-xl bg-[#FAF7F2] px-3 py-2 text-xs font-bold text-[#1D1C1A]"
                  >
                    Add
                  </button>
                </div>
                {links.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {links.map((l) => (
                      <span
                        key={l}
                        className="inline-flex items-center gap-1 rounded-full bg-[#FAF7F2] px-2.5 py-0.5 text-[11px] font-bold"
                      >
                        {l.replace(/^https?:\/\//, '').slice(0, 28)}
                        <button type="button" onClick={() => setLinks((p) => p.filter((x) => x !== l))}>
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2 rounded-[24px] bg-white p-4 shadow-sm">
              <div className="text-xs font-extrabold text-[#1D1C1A]">Attach Media</div>
              <MediaUploader value={composeMedia} onChange={setComposeMedia} onStatusBanner={onStatusBanner} />
            </div>

            <div className="space-y-1.5 rounded-[24px] bg-white p-4 shadow-sm">
              <label className="flex items-center gap-1 text-xs font-extrabold text-[#1D1C1A]">
                <Clock className="h-3.5 w-3.5" /> Schedule (optional)
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full rounded-xl bg-[#FAF7F2] px-3 py-2 text-xs"
              />
            </div>

            <button
              type="button"
              disabled={generatingCompose || !topic.trim()}
              onClick={handleGenerateCompose}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#F58C56] py-3 text-xs font-bold text-white shadow-sm hover:bg-[#e57c45] disabled:opacity-50"
            >
              {generatingCompose ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generatingCompose ? 'Generating...' : 'Generate with AI'}
            </button>
          </div>

          <div className="space-y-4">
            <div className="min-h-[380px] rounded-[24px] bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-extrabold text-[#1D1C1A]">Preview & Edit</div>
                  {summary && <div className="text-xs text-[#8C837A]">{summary}</div>}
                </div>
                {generatedPosts.length > 0 && (
                  <button
                    type="button"
                    disabled={generatingCompose}
                    onClick={handleGenerateCompose}
                    className="inline-flex items-center gap-1 rounded-xl bg-[#FAF7F2] px-2.5 py-1 text-xs font-bold"
                  >
                    <RefreshCw className="h-3 w-3" /> Regenerate
                  </button>
                )}
              </div>

              {generatedPosts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-[#8C837A]">
                  <MessageCircle className="mb-2 h-8 w-8 opacity-30" />
                  <p className="text-xs font-bold">Generated posts will appear here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {generatedPosts.map((post, i) => (
                    <div key={i} className="space-y-2 rounded-2xl bg-[#FAF7F2] p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-[#C85A21]">Post {i + 1}</span>
                        <button
                          type="button"
                          onClick={() => setGeneratedPosts((prev) => prev.filter((_, j) => j !== i))}
                          className="text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <textarea
                        value={post.content}
                        onChange={(e) =>
                          setGeneratedPosts((prev) =>
                            prev.map((p, j) => (j === i ? { ...p, content: e.target.value } : p))
                          )
                        }
                        maxLength={500}
                        className="min-h-[85px] w-full rounded-xl bg-white p-2.5 text-xs text-[#1D1C1A]"
                      />
                      <div className="flex justify-between text-[11px]">
                        <CharCount value={post.content} />
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setGeneratedPosts((p) => [...p, { content: '', hashtags: [], cta: '' }])}
                    className="inline-flex w-full items-center justify-center gap-1 rounded-2xl border border-dashed border-[#D6CFC7] py-2 text-xs font-bold text-[#6E655D]"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Post
                  </button>
                </div>
              )}
            </div>

            {generatedPosts.length > 0 && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white py-3 text-xs font-bold text-[#1D1C1A] shadow-sm"
                >
                  <Save className="h-4 w-4" /> Save Draft
                </button>
                <button
                  type="button"
                  disabled={publishingCompose}
                  onClick={handlePublishCompose}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#1E1D1B] py-3 text-xs font-bold text-white"
                >
                  {publishingCompose ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {scheduledAt ? 'Schedule' : 'Publish to Threads'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── AUTOMATE POST ── */}
      {tab === 'automate' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1 rounded-full bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setAutomateView('setup')}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${
                  automateView === 'setup' ? 'bg-[#1E1D1B] text-white' : 'text-[#6E655D]'
                }`}
              >
                Setup
              </button>
              <button
                type="button"
                onClick={() => setAutomateView('queue')}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold ${
                  automateView === 'queue' ? 'bg-[#1E1D1B] text-white' : 'text-[#6E655D]'
                }`}
              >
                <CalendarClock className="h-3.5 w-3.5" />
                Queue
                {pendingCount > 0 && (
                  <span className="rounded-full bg-[#F58C56] px-1.5 py-0.5 text-[10px] text-white">
                    {pendingCount}
                  </span>
                )}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                id="beliapaharini-threads-excel"
                className="hidden"
                accept=".xlsx,.xls,.csv"
                onChange={handleExcelImport}
              />
              <button
                type="button"
                onClick={() => document.getElementById('beliapaharini-threads-excel')?.click()}
                className="inline-flex items-center gap-1.5 rounded-2xl bg-white px-3.5 py-2 text-xs font-bold text-[#1D1C1A] shadow-sm"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" /> Import Excel
              </button>
              <button
                type="button"
                onClick={handleExcelExport}
                className="inline-flex items-center gap-1.5 rounded-2xl bg-white px-3.5 py-2 text-xs font-bold text-[#1D1C1A] shadow-sm"
              >
                <Download className="h-3.5 w-3.5" /> Export Excel
              </button>
              <button
                type="button"
                onClick={() => setShowCreateAccount(true)}
                className="inline-flex items-center gap-1.5 rounded-2xl bg-[#F58C56] px-3.5 py-2 text-xs font-bold text-white shadow-sm"
              >
                <UserPlus className="h-3.5 w-3.5" /> Add Account
              </button>
            </div>
          </div>

          {automateView === 'setup' ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-4">
                <div className="rounded-[24px] bg-white p-4 shadow-sm">
                  <div className="mb-2 text-xs font-extrabold text-[#1D1C1A]">Post Type</div>
                  <div className="flex gap-2">
                    {['single', 'thread'].map((pt) => (
                      <button
                        key={pt}
                        type="button"
                        onClick={() => setAutoPostType(pt)}
                        className={`flex-1 rounded-2xl border p-3 text-left ${
                          autoPostType === pt ? 'border-[#F58C56] bg-[#FFF9F5]' : 'border-[#EFE9E0] bg-[#FAF7F2]'
                        }`}
                      >
                        <div className="text-xs font-extrabold">{pt === 'single' ? 'Single Post' : 'Thread'}</div>
                        <div className="text-[11px] text-[#8C837A]">
                          {pt === 'single' ? 'One standalone post' : 'Multiple connected posts'}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 rounded-[24px] bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-[#1D1C1A]">Post Topic *</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {products.length > 0 && (
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) handlePickProductForTopic(e.target.value, 'automate');
                            e.target.value = '';
                          }}
                          className="max-w-[160px] rounded-xl bg-[#FAF7F2] px-2 py-1 text-[11px] font-bold text-[#6E655D]"
                        >
                          <option value="">Pick product...</option>
                          {products.slice(0, 50).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.code} — {p.title}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        disabled={suggesting}
                        onClick={async () => {
                          setSuggesting(true);
                          try {
                            const r = await apiFetch('/api/threads/suggest-topics', {
                              method: 'POST',
                              body: JSON.stringify({
                                personas: accounts
                                  .filter((a) => selectedAccountIds.includes(a.id))
                                  .map((a) => a.persona),
                                location: suggestLocation,
                              }),
                            });
                            setTopicSuggestions(r.topics || []);
                            setShowSuggestions(true);
                          } catch (err) {
                            onApiError?.(err);
                          } finally {
                            setSuggesting(false);
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-xl bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800"
                      >
                        {suggesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lightbulb className="h-3 w-3" />}
                        Suggest
                      </button>
                      {topicTemplates.length > 0 && (
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            const t = topicTemplates.find((x) => String(x.id) === e.target.value);
                            if (t) {
                              setAutoTopic(t.topic);
                              if (t.links?.length) setAutoLinks(t.links);
                              if (t.postLength) setPostLength(t.postLength);
                            }
                            e.target.value = '';
                          }}
                          className="rounded-xl bg-[#FAF7F2] px-2 py-1 text-[11px] font-bold"
                        >
                          <option value="">Load template...</option>
                          {topicTemplates.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>

                  <textarea
                    value={autoTopic}
                    onChange={(e) => setAutoTopic(e.target.value)}
                    placeholder="What should all selected accounts post about?"
                    className="min-h-[85px] w-full rounded-xl bg-[#FAF7F2] p-3 text-xs font-semibold"
                  />

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-[#8C837A]">Market:</span>
                    <input
                      type="text"
                      value={suggestLocation}
                      onChange={(e) => setSuggestLocation(e.target.value)}
                      className="flex-1 rounded-xl bg-[#FAF7F2] px-2.5 py-1 text-xs"
                    />
                  </div>

                  {showSuggestions && topicSuggestions.length > 0 && (
                    <div className="space-y-1.5 rounded-2xl bg-amber-50 p-3">
                      <div className="flex items-center justify-between text-xs font-bold text-amber-800">
                        <span>AI Suggestions ({suggestLocation})</span>
                        <button type="button" onClick={() => setShowSuggestions(false)}>
                          ×
                        </button>
                      </div>
                      {topicSuggestions.map((s, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setAutoTopic(s);
                            setShowSuggestions(false);
                          }}
                          className="block w-full rounded-xl bg-white px-3 py-2 text-left text-xs hover:bg-amber-100/50"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}

                  {autoTopic.trim() && (
                    <button
                      type="button"
                      onClick={async () => {
                        const name = window.prompt('Template name?');
                        if (!name?.trim()) return;
                        try {
                          await apiFetch('/api/threads/topic-templates', {
                            method: 'POST',
                            body: JSON.stringify({
                              name,
                              topic: autoTopic,
                              links: autoLinks,
                              postType: autoPostType,
                              postLength,
                            }),
                          });
                          onStatusBanner?.({ type: 'success', text: 'Template saved.' });
                          loadTemplates();
                        } catch (err) {
                          onApiError?.(err);
                        }
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-[#6E655D] hover:text-[#1D1C1A]"
                    >
                      <BookOpen className="h-3 w-3" /> Save as template
                    </button>
                  )}

                  <div>
                    <label className="mb-1.5 flex items-center gap-1 text-xs font-bold text-[#6E655D]">
                      <AlignLeft className="h-3 w-3" /> Post Length
                    </label>
                    <div className="flex gap-1.5">
                      {['short', 'medium', 'long'].map((len) => (
                        <button
                          key={len}
                          type="button"
                          onClick={() => setPostLength(len)}
                          className={`flex-1 rounded-xl py-1.5 text-xs font-bold ${
                            postLength === len ? 'bg-[#1E1D1B] text-white' : 'bg-[#FAF7F2] text-[#6E655D]'
                          }`}
                        >
                          {len === 'short' ? 'Short ≤80' : len === 'medium' ? 'Medium ~250' : 'Long ~450'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs font-bold text-[#6E655D]">
                      <Link2 className="h-3 w-3" /> Links (optional)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={autoLinkInput}
                        onChange={(e) => setAutoLinkInput(e.target.value)}
                        placeholder="https://..."
                        className="flex-1 rounded-xl bg-[#FAF7F2] px-3 py-2 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (autoLinkInput.trim() && !autoLinks.includes(autoLinkInput.trim())) {
                            setAutoLinks((prev) => [...prev, autoLinkInput.trim()]);
                            setAutoLinkInput('');
                          }
                        }}
                        className="rounded-xl bg-[#FAF7F2] px-3 py-2 text-xs font-bold"
                      >
                        Add
                      </button>
                    </div>
                    {autoLinks.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {autoLinks.map((l) => (
                          <span
                            key={l}
                            className="inline-flex items-center gap-1 rounded-full bg-[#FAF7F2] px-2.5 py-0.5 text-[11px] font-bold"
                          >
                            {l.replace(/^https?:\/\//, '').slice(0, 28)}
                            <button type="button" onClick={() => setAutoLinks((p) => p.filter((x) => x !== l))}>
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-1 rounded-2xl bg-white p-1.5 shadow-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setPostMode('now');
                      setPostNowResults(null);
                    }}
                    className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold ${
                      postMode === 'now' ? 'bg-[#1E1D1B] text-white' : 'text-[#6E655D]'
                    }`}
                  >
                    <Send className="h-3.5 w-3.5" /> Post Now
                  </button>
                  <button
                    type="button"
                    onClick={() => setPostMode('schedule')}
                    className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold ${
                      postMode === 'schedule' ? 'bg-[#1E1D1B] text-white' : 'text-[#6E655D]'
                    }`}
                  >
                    <CalendarClock className="h-3.5 w-3.5" /> Schedule
                  </button>
                </div>

                {postMode === 'schedule' && (
                  <div className="space-y-2.5 rounded-[24px] bg-white p-4 shadow-sm">
                    <div className="text-xs font-extrabold text-[#1D1C1A]">Days to schedule</div>
                    <div className="flex flex-wrap gap-1.5">
                      {[1, 3, 7, 14, 30].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setScheduleDays(d)}
                          className={`rounded-xl px-3 py-1.5 text-xs font-bold ${
                            scheduleDays === d ? 'bg-[#F58C56] text-white' : 'bg-[#FAF7F2] text-[#6E655D]'
                          }`}
                        >
                          {d === 1 ? 'Today' : `${d}d`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  disabled={busyPreview || !autoTopic.trim() || selectedAccountIds.length === 0}
                  onClick={postMode === 'now' ? handlePostNowPreview : handleAutomatePreview}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-xs font-bold text-white shadow-sm disabled:opacity-50 ${
                    postMode === 'now' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-[#1E1D1B] hover:bg-black'
                  }`}
                >
                  {busyPreview ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                  {busyPreview
                    ? 'Generating previews...'
                    : postMode === 'now'
                      ? `Preview & Post to ${selectedAccountIds.length} Account(s)`
                      : `Review & Schedule (${selectedAccountIds.length} account(s))`}
                </button>

                {postNowResults && (
                  <div className="space-y-2 rounded-[24px] bg-white p-4 shadow-sm">
                    <div className="text-xs font-extrabold text-[#1D1C1A]">Publish Results</div>
                    {postNowResults.map((r) => (
                      <div key={r.accountId} className="flex items-start gap-2 text-xs">
                        {r.status === 'success' ? (
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        ) : (
                          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-bold">@{r.username}</div>
                          <div className={r.status === 'success' ? 'truncate text-[#8C837A]' : 'text-rose-600'}>
                            {r.status === 'success' ? r.content : r.error}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: Account selection */}
              <div className="space-y-3 rounded-[24px] bg-white p-4 shadow-sm">
                {allLabels.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setLabelFilter(null)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        !labelFilter ? 'bg-[#1E1D1B] text-white' : 'bg-[#FAF7F2] text-[#6E655D]'
                      }`}
                    >
                      All
                    </button>
                    {allLabels.map((l) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setLabelFilter(labelFilter === l ? null : l)}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          labelFilter === l ? 'bg-[#1E1D1B] text-white' : 'bg-[#FAF7F2] text-[#6E655D]'
                        }`}
                      >
                        <Tag className="h-2.5 w-2.5" /> {l}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-[#1D1C1A]">
                    Select Accounts ({selectedAccountIds.length}/{accountsTotal})
                  </span>
                  {accountsTotal > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedAccountIds(
                            selectedAccountIds.length === accounts.length ? [] : accounts.map((a) => a.id)
                          )
                        }
                        className="text-xs font-bold text-[#F58C56]"
                      >
                        {selectedAccountIds.length === accounts.length ? 'Deselect all' : 'Select all'}
                      </button>
                      {selectedAccountIds.length > 0 && (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm(`Delete ${selectedAccountIds.length} selected accounts?`)) return;
                            await apiFetch('/api/threads/accounts', {
                              method: 'DELETE',
                              body: JSON.stringify({ accountIds: selectedAccountIds }),
                            });
                            setSelectedAccountIds([]);
                            await loadAccounts();
                          }}
                          className="text-xs font-bold text-rose-600"
                        >
                          Delete selected
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {accounts.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#E6DFD5] py-10 text-center text-xs text-[#8C837A]">
                    <Users className="mx-auto mb-2 h-7 w-7 opacity-40" />
                    <p>No Threads accounts yet</p>
                    <button
                      type="button"
                      onClick={() => setShowCreateAccount(true)}
                      className="mt-3 rounded-xl bg-[#1E1D1B] px-3 py-1.5 text-xs font-bold text-white"
                    >
                      Add First Account
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {filteredAccounts.map((acc) => (
                      <AccountCard
                        key={acc.id}
                        account={acc}
                        personas={PERSONAS}
                        selected={selectedAccountIds.includes(acc.id)}
                        onSelect={() =>
                          setSelectedAccountIds((prev) =>
                            prev.includes(acc.id) ? prev.filter((x) => x !== acc.id) : [...prev, acc.id]
                          )
                        }
                        onUpdate={async (data) => {
                          try {
                            await apiFetch(`/api/threads/accounts/${acc.id}`, {
                              method: 'PUT',
                              body: JSON.stringify(data),
                            });
                            await loadAccounts();
                          } catch (err) {
                            onApiError?.(err);
                          }
                        }}
                        onDelete={async () => {
                          if (!window.confirm(`Delete @${acc.username}?`)) return;
                          await apiFetch(`/api/threads/accounts/${acc.id}`, { method: 'DELETE' });
                          setSelectedAccountIds((prev) => prev.filter((x) => x !== acc.id));
                          await loadAccounts();
                        }}
                        onStatusBanner={onStatusBanner}
                      />
                    ))}
                  </div>
                )}

                {!showAllAccounts && accountsPages > 1 && (
                  <div className="flex items-center justify-between border-t border-[#EFE9E0] pt-3 text-xs">
                    <button
                      type="button"
                      disabled={accountsPage === 1}
                      onClick={() => setAccountsPage((p) => p - 1)}
                      className="rounded-xl bg-[#FAF7F2] px-2.5 py-1 font-bold disabled:opacity-40"
                    >
                      Back
                    </button>
                    <div className="flex items-center gap-2">
                      <span>
                        Page {accountsPage} of {accountsPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAllAccounts(true)}
                        className="font-bold text-[#F58C56]"
                      >
                        See all
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={accountsPage === accountsPages}
                      onClick={() => setAccountsPage((p) => p + 1)}
                      className="rounded-xl bg-[#FAF7F2] px-2.5 py-1 font-bold disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* QUEUE VIEW */
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 rounded-[24px] bg-white p-4 text-xs shadow-sm">
                <span className="font-bold text-amber-700">{pendingCount} pending</span>
                {draftReviewCount > 0 && <span className="font-bold text-sky-700">{draftReviewCount} needs review</span>}
                <span className="font-bold text-emerald-700">{publishedCount} published</span>
                <span className="font-bold text-rose-700">{failedCount} failed</span>
                <div className="ml-auto flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await apiFetch('/api/threads/automate/generate-now', { method: 'POST' });
                      onStatusBanner?.({
                        type: 'success',
                        text: `Generated ${r.generated} post(s), skipped ${r.skipped}.`,
                      });
                      await loadScheduled();
                    }}
                    className="inline-flex items-center gap-1 rounded-xl bg-sky-50 px-3 py-1.5 font-bold text-sky-700"
                  >
                    <Bot className="h-3.5 w-3.5" /> Generate Now
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const endpoint = automationPaused ? 'resume-all' : 'pause-all';
                      await apiFetch(`/api/threads/scheduled/${endpoint}`, { method: 'POST' });
                      setAutomationPaused((p) => !p);
                    }}
                    className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 font-bold ${
                      automationPaused ? 'bg-amber-500 text-white' : 'bg-[#FAF7F2] text-[#1D1C1A]'
                    }`}
                  >
                    {automationPaused ? <PlayCircle className="h-3.5 w-3.5" /> : <PauseCircle className="h-3.5 w-3.5" />}
                    {automationPaused ? 'Resume' : 'Pause All'}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await apiFetch('/api/threads/process-queue', { method: 'POST' });
                      onStatusBanner?.({
                        type: 'success',
                        text: `Queue processed: ${r.success} published, ${r.retried} retried, ${r.failed} failed.`,
                      });
                      await loadScheduled();
                    }}
                    className="inline-flex items-center gap-1 rounded-xl bg-[#1E1D1B] px-3 py-1.5 font-bold text-white"
                  >
                    <Send className="h-3.5 w-3.5" /> Process Queue Now
                  </button>
                </div>
              </div>

              {queueVisiblePosts.length === 0 ? (
                <div className="rounded-[24px] bg-white p-10 text-center text-xs text-[#8C837A] shadow-sm">
                  All caught up — no pending posts in the queue.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {queueVisiblePosts.map((post) => (
                    <ScheduledRow
                      key={post.id}
                      post={post}
                      onStatusBanner={onStatusBanner}
                      onApprove={async () => {
                        await apiFetch(`/api/threads/scheduled/${post.id}/approve`, { method: 'POST' });
                        await loadScheduled();
                      }}
                      onCancel={async () => {
                        await apiFetch(`/api/threads/scheduled/${post.id}`, { method: 'DELETE' });
                        await loadScheduled();
                      }}
                      onSave={async (id, content, newSched, editCtx) => {
                        await apiFetch(`/api/threads/scheduled/${id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ content, scheduledAt: newSched }),
                        });
                        if (editCtx) {
                          apiFetch('/api/threads/content-edits', {
                            method: 'POST',
                            body: JSON.stringify({
                              accountId: post.accountId,
                              persona: post.persona,
                              topic: post.topic,
                              originalContent: editCtx.originalContent,
                              editedContent: content,
                              userComment: editCtx.comment || null,
                            }),
                          }).catch(() => {});
                        }
                        await loadScheduled();
                      }}
                      onImageChange={async (id, imageUrl) => {
                        await apiFetch(`/api/threads/scheduled/${id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ imageUrl }),
                        });
                        await loadScheduled();
                      }}
                    />
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2 rounded-[24px] bg-white p-4 text-xs shadow-sm">
                <button
                  type="button"
                  onClick={async () => {
                    const r = await apiFetch('/api/threads/keep-alive-tokens', { method: 'POST' });
                    onStatusBanner?.({ type: 'success', text: `Keep-alive: ${r.refreshed} ok, ${r.failed} failed.` });
                  }}
                  className="rounded-xl bg-[#FAF7F2] px-3 py-2 font-bold"
                >
                  Keep-Alive Tokens Now
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const r = await apiFetch('/api/threads/refresh-tokens', { method: 'POST' });
                    onStatusBanner?.({ type: 'success', text: `Deep refresh: ${r.refreshed} ok, ${r.failed} failed.` });
                  }}
                  className="rounded-xl bg-[#FAF7F2] px-3 py-2 font-bold"
                >
                  Deep Refresh Tokens
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const r = await apiFetch('/api/threads/accounts/fix-timezone', { method: 'POST' });
                    onStatusBanner?.({ type: 'success', text: `Fixed ${r.fixed} UTC account(s) to MYT.` });
                    await loadAccounts();
                  }}
                  className="rounded-xl bg-[#FAF7F2] px-3 py-2 font-bold"
                >
                  Fix UTC Timezones to MYT
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ENGAGE ── */}
      {tab === 'engage' && <AdminThreadsEngage onStatusBanner={onStatusBanner} onApiError={onApiError} />}

      {/* ── DRAFTS ── */}
      {tab === 'drafts' && (
        <div className="space-y-2.5">
          {drafts.length === 0 ? (
            <div className="rounded-[24px] bg-white p-10 text-center text-xs text-[#8C837A] shadow-sm">
              No saved drafts.
            </div>
          ) : (
            drafts.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] bg-white p-4 shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-extrabold text-[#1D1C1A]">{d.topic}</div>
                  <div className="text-xs text-[#8C837A]">
                    {d.posts.length} post(s) · {d.postType}
                    {d.personas.length ? ` · ${d.personas.slice(0, 2).join(', ')}` : ''}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTopic(d.topic);
                      setGeneratedPosts(d.posts);
                      setSelectedPersonas(d.personas);
                      setPostType(d.postType);
                      setTab('compose');
                    }}
                    className="rounded-xl bg-[#FAF7F2] px-3 py-1.5 text-xs font-bold"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDialog({
                        title: 'Confirm Publish Draft',
                        description: `Are you sure you want to publish "${d.topic}" to Threads now?`,
                        confirmLabel: 'Yes, Publish Now',
                        variant: 'success',
                        details: [
                          { label: 'Draft Topic', value: d.topic },
                          {
                            label: 'Format',
                            value: `${d.posts.length} post(s) · ${d.postType}`,
                          },
                        ],
                        onConfirm: async () => {
                          setConfirmBusy(true);
                          try {
                            const res = await apiFetch('/api/threads/publish', {
                              method: 'POST',
                              body: JSON.stringify({ ...d, draftId: d.id }),
                            });
                            const isOk = res.status === 'success';
                            onStatusBanner?.({
                              type: isOk ? 'success' : 'error',
                              text: res.message,
                            });
                            setConfirmDialog(null);
                            await loadDrafts();
                            setResultModal({
                              status: isOk ? 'success' : 'error',
                              title: isOk
                                ? 'Draft Published Successfully'
                                : 'Failed to Publish Draft',
                              message: isOk
                                ? res.message || 'Your draft has been published to Threads.'
                                : res.errorMessage ||
                                  res.message ||
                                  'Threads could not publish this draft.',
                              details: [{ label: 'Topic', value: d.topic, ok: isOk }],
                            });
                          } catch (err) {
                            setConfirmDialog(null);
                            if (err?.status === 401) {
                              onApiError?.(err);
                            } else {
                              onApiError?.(err);
                              setResultModal({
                                status: 'error',
                                title: 'Failed to Publish Draft',
                                message:
                                  err?.message ||
                                  'An unexpected error occurred while publishing this draft.',
                              });
                            }
                          } finally {
                            setConfirmBusy(false);
                          }
                        },
                      });
                    }}
                    className="rounded-xl bg-[#1E1D1B] px-3 py-1.5 text-xs font-bold text-white"
                  >
                    Publish
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── HISTORY ── */}
      {tab === 'history' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[24px] bg-white p-4 text-xs shadow-sm">
            <div className="flex gap-3 font-bold">
              {['all', 'published', 'failed'].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setHistoryFilter(f);
                    setHistoryPage(1);
                  }}
                  className={historyFilter === f ? 'text-[#1D1C1A] underline' : 'text-[#8C837A]'}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            <span className="text-[#8C837A]">{filteredHistory.length} record(s)</span>
          </div>

          {visibleHistory.length === 0 ? (
            <div className="rounded-[24px] bg-white p-10 text-center text-xs text-[#8C837A] shadow-sm">
              No posts in history yet.
            </div>
          ) : (
            visibleHistory.map((item) => (
              <div key={item.id} className="space-y-2 rounded-[24px] bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-extrabold text-[#1D1C1A]">{item.topic}</div>
                    <div className="text-xs text-[#8C837A]">
                      {item.personas?.join(', ')} ·{' '}
                      {new Date(item.publishedAt || item.createdAt).toLocaleString([], {
                        timeZone: MYT_TZ,
                      })}{' '}
                      MYT
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                      item.status === 'success'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {item.status === 'success' ? '✓ Published' : '✗ Failed'}
                  </span>
                </div>
                {item.posts.map((p, idx) => (
                  <div key={idx} className="rounded-xl bg-[#FAF7F2] p-3 text-xs text-[#1D1C1A]">
                    <p className="whitespace-pre-wrap">{p.content}</p>
                  </div>
                ))}
                {item.errorMessage && <p className="text-xs font-semibold text-rose-600">{item.errorMessage}</p>}
              </div>
            ))
          )}

          {!historyShowAll && historyPages > 1 && (
            <div className="flex items-center justify-between rounded-[24px] bg-white p-3 text-xs shadow-sm">
              <button
                type="button"
                disabled={historyPage === 1}
                onClick={() => setHistoryPage((p) => p - 1)}
                className="rounded-xl bg-[#FAF7F2] px-3 py-1.5 font-bold disabled:opacity-40"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setHistoryShowAll(true)}
                className="font-bold text-[#F58C56]"
              >
                See all {filteredHistory.length}
              </button>
              <button
                type="button"
                disabled={historyPage === historyPages}
                onClick={() => setHistoryPage((p) => p + 1)}
                className="rounded-xl bg-[#FAF7F2] px-3 py-1.5 font-bold disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── ANALYTICS ── */}
      {tab === 'analytics' && (
        <div className="space-y-4">
          {!queueStats || queueStats.total === 0 ? (
            <div className="rounded-[24px] bg-white p-10 text-center text-xs text-[#8C837A] shadow-sm">
              No analytics yet — schedule some posts first.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Total Posts', val: queueStats.total, cls: 'text-[#1D1C1A]' },
                  { label: 'Published', val: queueStats.published, cls: 'text-emerald-700' },
                  { label: 'Pending', val: queueStats.pending, cls: 'text-amber-700' },
                  { label: 'Failed', val: queueStats.failed, cls: 'text-rose-700' },
                ].map((s) => (
                  <div key={s.label} className="rounded-[24px] bg-white p-4 text-center shadow-sm">
                    <div className={`text-2xl font-extrabold ${s.cls}`}>{s.val}</div>
                    <div className="text-xs font-semibold text-[#8C837A]">{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="space-y-2 rounded-[24px] bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm font-extrabold">
                    <TrendingUp className="h-4 w-4 text-[#F58C56]" /> Success Rate
                  </span>
                  <span className="text-lg font-extrabold text-[#F58C56]">{queueStats.successRate}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[#FAF7F2]">
                  <div
                    className="h-full rounded-full bg-[#F58C56]"
                    style={{ width: `${queueStats.successRate}%` }}
                  />
                </div>
              </div>

              {queueStats.accountBreakdown?.length > 0 && (
                <div className="space-y-2 rounded-[24px] bg-white p-4 shadow-sm">
                  <div className="text-sm font-extrabold text-[#1D1C1A]">Per-Account Breakdown</div>
                  {queueStats.accountBreakdown.map((a, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between border-b border-[#EFE9E0] py-2 text-xs last:border-0"
                    >
                      <div>
                        <div className="font-extrabold">@{a.username ?? 'unknown'}</div>
                        <div className="text-[11px] text-[#8C837A]">
                          {a.persona} · {a.timezone}
                        </div>
                      </div>
                      <div className="flex gap-2 font-bold">
                        <span className="text-emerald-700">{a.published}✓</span>
                        <span className="text-amber-700">{a.pending}⏳</span>
                        <span className="text-rose-700">{a.failed}✗</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDialog)}
        title={confirmDialog?.title}
        description={confirmDialog?.description}
        details={confirmDialog?.details || []}
        confirmLabel={confirmDialog?.confirmLabel}
        cancelLabel="Cancel"
        variant={confirmDialog?.variant || 'primary'}
        loading={confirmBusy}
        onConfirm={() => confirmDialog?.onConfirm?.()}
        onCancel={() => {
          if (!confirmBusy) setConfirmDialog(null);
        }}
      />

      <ResultDialog
        open={Boolean(resultModal)}
        status={resultModal?.status || 'success'}
        title={resultModal?.title}
        message={resultModal?.message}
        details={resultModal?.details || []}
        onClose={() => setResultModal(null)}
      />
    </div>
  );
}
