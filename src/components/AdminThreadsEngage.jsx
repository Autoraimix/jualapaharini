import React, { useEffect, useState } from 'react';
import {
  Link2,
  Sparkles,
  RefreshCw,
  Trash2,
  Send,
  MessageCircle,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { getStoredToken } from '../api';

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

const STATUS_BADGE = {
  draft: 'bg-amber-100 text-amber-800',
  scheduled: 'bg-sky-100 text-sky-800',
  published: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-700',
  cancelled: 'bg-[#EFE9E0] text-[#6E655D]',
};

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function JobRow({ job, onChanged, onStatusBanner, onApiError }) {
  const [text, setText] = useState(job.replyText);
  const [saving, setSaving] = useState(false);
  const [regening, setRegening] = useState(false);
  const isDraft = job.status === 'draft';

  useEffect(() => {
    setText(job.replyText);
  }, [job.replyText]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/threads/replies/${job.id}`, {
        method: 'PUT',
        body: JSON.stringify({ replyText: text }),
      });
      onStatusBanner?.({ type: 'success', text: 'Reply updated.' });
      await onChanged();
    } catch (err) {
      onApiError?.(err);
    } finally {
      setSaving(false);
    }
  };

  const handleRegen = async () => {
    setRegening(true);
    try {
      const updated = await apiFetch(`/api/threads/replies/${job.id}/regenerate`, { method: 'POST' });
      setText(updated.replyText);
      await onChanged();
    } catch (err) {
      onApiError?.(err);
    } finally {
      setRegening(false);
    }
  };

  const handleDelete = async () => {
    try {
      await apiFetch(`/api/threads/replies/${job.id}`, { method: 'DELETE' });
      await onChanged();
    } catch (err) {
      onApiError?.(err);
    }
  };

  return (
    <div className="space-y-2 rounded-2xl border border-[#EFE9E0] bg-[#FAF7F2] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-extrabold text-[#1D1C1A]">
            @{(job.username ?? '?').replace(/^@/, '')}
          </span>
          {job.persona && (
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[#6E655D]">
              {job.persona}
            </span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              STATUS_BADGE[job.status] || 'bg-[#EFE9E0] text-[#6E655D]'
            }`}
          >
            {job.status}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isDraft && (
            <button
              type="button"
              disabled={regening}
              onClick={handleRegen}
              title="Regenerate"
              className="rounded-lg p-1.5 text-[#6E655D] hover:bg-white disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${regening ? 'animate-spin' : ''}`} />
            </button>
          )}
          {(isDraft || job.status === 'scheduled') && (
            <button
              type="button"
              onClick={handleDelete}
              title={isDraft ? 'Remove draft' : 'Cancel scheduled reply'}
              className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {isDraft ? (
        <div className="space-y-1.5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={480}
            className="w-full rounded-xl bg-white p-2.5 text-xs text-[#1D1C1A] focus:outline-none focus:ring-2 focus:ring-[#F58C56]"
          />
          {text !== job.replyText && (
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="rounded-xl bg-[#1E1D1B] px-3 py-1.5 text-[11px] font-bold text-white"
            >
              {saving ? 'Saving...' : 'Save edit'}
            </button>
          )}
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-xs text-[#1D1C1A]">{job.replyText}</p>
      )}

      <div className="flex flex-wrap gap-3 text-[11px] text-[#8C837A]">
        {job.status === 'scheduled' && <span>Goes out {fmtTime(job.scheduledAt)}</span>}
        {job.status === 'published' && <span>Published {fmtTime(job.publishedAt)}</span>}
        {job.status === 'failed' && job.errorMessage && (
          <span className="text-rose-600">{job.errorMessage.slice(0, 140)}</span>
        )}
      </div>
    </div>
  );
}

function BatchCard({ batch, windowHours, setWindowHours, onChanged, onStatusBanner, onApiError }) {
  const [open, setOpen] = useState(true);
  const [approving, setApproving] = useState(false);
  const drafts = batch.jobs.filter((j) => j.status === 'draft');
  const counts = batch.jobs.reduce((acc, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1;
    return acc;
  }, {});

  const handleApprove = async () => {
    setApproving(true);
    try {
      const r = await apiFetch('/api/threads/replies/approve', {
        method: 'POST',
        body: JSON.stringify({ batchId: batch.batchId, windowHours: Number(windowHours) }),
      });
      onStatusBanner?.({
        type: 'success',
        text: `Approved! ${r.scheduled} replies will drip out over ~${windowHours} hours.`,
      });
      await onChanged();
    } catch (err) {
      onApiError?.(err);
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="rounded-[24px] bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start justify-between gap-2 text-left"
      >
        <div>
          <div className="text-xs font-bold text-[#8C837A]">Reply Batch · {fmtTime(batch.createdAt)}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {Object.entries(counts).map(([status, n]) => (
              <span
                key={status}
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  STATUS_BADGE[status] || 'bg-[#EFE9E0] text-[#6E655D]'
                }`}
              >
                {n} {status}
              </span>
            ))}
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-[#8C837A]" /> : <ChevronDown className="h-4 w-4 text-[#8C837A]" />}
      </button>

      {open && (
        <div className="mt-3 space-y-2.5">
          {batch.targetText && (
            <div className="rounded-2xl bg-[#FAF7F2] p-3">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#8C837A]">
                Original Post
              </div>
              <p className="whitespace-pre-wrap text-xs text-[#1D1C1A]">{batch.targetText}</p>
            </div>
          )}

          {batch.jobs.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              onChanged={onChanged}
              onStatusBanner={onStatusBanner}
              onApiError={onApiError}
            />
          ))}

          {drafts.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-[#EFE9E0] pt-3">
              <select
                value={windowHours}
                onChange={(e) => setWindowHours(e.target.value)}
                className="rounded-xl bg-[#FAF7F2] px-3 py-2 text-xs font-bold text-[#1D1C1A]"
              >
                <option value="3">Spread over ~3 hours</option>
                <option value="6">Spread over ~6 hours (recommended)</option>
                <option value="12">Spread over ~12 hours</option>
              </select>
              <button
                type="button"
                disabled={approving}
                onClick={handleApprove}
                className="inline-flex items-center gap-1.5 rounded-2xl bg-[#1E1D1B] px-4 py-2 text-xs font-bold text-white hover:bg-black disabled:opacity-50"
              >
                {approving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Approve & Schedule {drafts.length} Repl{drafts.length === 1 ? 'y' : 'ies'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminThreadsEngage({ onStatusBanner, onApiError }) {
  const [url, setUrl] = useState('');
  const [target, setTarget] = useState(null);
  const [mode, setMode] = useState('auto');
  const [windowHours, setWindowHours] = useState('6');
  const [batches, setBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [processing, setProcessing] = useState(false);

  const loadBatches = async () => {
    setLoadingBatches(true);
    try {
      const data = await apiFetch('/api/threads/replies/batches');
      setBatches(Array.isArray(data) ? data : []);
    } catch (err) {
      onApiError?.(err);
    } finally {
      setLoadingBatches(false);
    }
  };

  useEffect(() => {
    loadBatches();
  }, []);

  const handleResolve = async () => {
    setResolving(true);
    try {
      const data = await apiFetch('/api/threads/replies/resolve', {
        method: 'POST',
        body: JSON.stringify({ url }),
      });
      setTarget(data);
    } catch (err) {
      setTarget(null);
      onApiError?.(err);
    } finally {
      setResolving(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await apiFetch('/api/threads/replies/generate', {
        method: 'POST',
        body: JSON.stringify({ url, mode }),
      });
      onStatusBanner?.({
        type: 'success',
        text: 'Draft replies generated! Review, edit, then approve to schedule.',
      });
      await loadBatches();
    } catch (err) {
      onApiError?.(err);
    } finally {
      setGenerating(false);
    }
  };

  const handleProcess = async () => {
    setProcessing(true);
    try {
      const r = await apiFetch('/api/threads/replies/process', { method: 'POST' });
      onStatusBanner?.({
        type: 'success',
        text: `Queue processed: ${r.success ?? 0} published, ${r.retried ?? 0} retried, ${r.failed ?? 0} failed.`,
      });
      await loadBatches();
    } catch (err) {
      onApiError?.(err);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] bg-white p-5 shadow-sm">
        <h4 className="flex items-center gap-2 text-sm font-extrabold text-[#1D1C1A]">
          <MessageCircle className="h-4 w-4 text-[#F58C56]" />
          Engage — Reply with Your Personas
        </h4>
        <p className="mt-1 text-xs text-[#8C837A]">
          Paste a link to one of your own Threads posts. Your other connected accounts will draft in-character replies for you to review before sending.
        </p>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setTarget(null);
            }}
            placeholder="https://www.threads.com/@yourhandle/post/XXXX"
            className="flex-1 rounded-xl bg-[#FAF7F2] px-3.5 py-2.5 text-xs font-semibold text-[#1D1C1A] focus:outline-none focus:ring-2 focus:ring-[#F58C56]"
          />
          <button
            type="button"
            disabled={!url.trim() || resolving}
            onClick={handleResolve}
            className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-[#1E1D1B] px-4 py-2.5 text-xs font-bold text-white hover:bg-black disabled:opacity-50"
          >
            {resolving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            Find Post
          </button>
        </div>

        {target && (
          <div className="mt-3 space-y-2.5 rounded-2xl bg-[#FAF7F2] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-extrabold text-[#1D1C1A]">
                @{target.ownerUsername.replace(/^@/, '')}
              </span>
              <span className="text-xs text-[#6E655D]">
                {target.eligible.length} account{target.eligible.length === 1 ? '' : 's'} ready to reply
              </span>
            </div>
            {target.text && <p className="whitespace-pre-wrap text-xs text-[#1D1C1A]">{target.text.slice(0, 400)}</p>}
            {target.excluded?.length > 0 && (
              <p className="text-[11px] text-[#8C837A]">
                Sitting out: {target.excluded.map((x) => `@${x.username.replace(/^@/, '')} (${x.reason})`).join(' · ')}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-[#1D1C1A]"
              >
                <option value="auto">Natural mix — rotating subset (recommended)</option>
                <option value="all">All eligible accounts</option>
              </select>
              <button
                type="button"
                disabled={generating || target.eligible.length === 0}
                onClick={handleGenerate}
                className="inline-flex items-center gap-1.5 rounded-2xl bg-[#F58C56] px-4 py-2 text-xs font-bold text-white hover:bg-[#e57c45] disabled:opacity-50"
              >
                {generating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {generating ? 'Writing replies...' : 'Generate Draft Replies'}
              </button>
            </div>
            {mode === 'all' && (
              <p className="flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                Every account replying to every post is easier to flag. Natural mix is safer.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-extrabold uppercase tracking-wide text-[#8C837A]">Reply Batches</h4>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadBatches}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-[#1D1C1A] shadow-sm"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
          <button
            type="button"
            disabled={processing}
            onClick={handleProcess}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-[#1D1C1A] shadow-sm disabled:opacity-50"
          >
            <Send className="h-3 w-3" /> Process Due Now
          </button>
        </div>
      </div>

      {loadingBatches ? (
        <div className="flex items-center justify-center py-8 text-[#8C837A]">
          <RefreshCw className="h-5 w-5 animate-spin" />
        </div>
      ) : batches.length === 0 ? (
        <div className="rounded-[24px] bg-white p-8 text-center text-xs text-[#8C837A] shadow-sm">
          No reply batches yet. Paste one of your Threads post links above to start.
        </div>
      ) : (
        <div className="space-y-3">
          {batches.map((b) => (
            <BatchCard
              key={b.batchId}
              batch={b}
              windowHours={windowHours}
              setWindowHours={setWindowHours}
              onChanged={loadBatches}
              onStatusBanner={onStatusBanner}
              onApiError={onApiError}
            />
          ))}
        </div>
      )}
    </div>
  );
}
