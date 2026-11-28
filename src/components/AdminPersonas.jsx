import React, { useEffect, useRef, useState } from 'react';
import * as xlsx from 'xlsx';
import {
  UserCircle,
  Plus,
  Edit3,
  Trash2,
  ToggleLeft,
  ToggleRight,
  X,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Lock,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { getStoredToken } from '../api';

export const BUILTIN_PERSONAS = [
  { name: 'Professional Marketer', desc: 'Corporate B2B tone, data-driven' },
  { name: 'Corporate Executive', desc: 'C-suite voice, strategic thinking' },
  { name: 'Friendly Brand Voice', desc: 'Warm, approachable, community-focused' },
  { name: 'Sales Expert', desc: 'Persuasive, benefit-driven, action-oriented' },
  { name: 'Storyteller', desc: 'Narrative-driven, emotional connection' },
  { name: 'Motivational Speaker', desc: 'Inspirational, high energy, uplifting' },
  { name: 'Tech Enthusiast', desc: 'Innovation-focused, early adopter mindset' },
  { name: 'Casual Social Media Creator', desc: 'Relatable, trendy, conversational' },
  { name: 'Luxury Brand Expert', desc: 'Premium positioning, aspirational lifestyle' },
  { name: 'Humorous/Entertaining Writer', desc: 'Witty, playful, engagement-first' },
  { name: 'Kak Lin Taman Dahlia', desc: 'Mak-mak taman semi-urban, Utara loghat, seller online' },
  { name: 'Auntie Fauziah', desc: 'Sarkastik, janda veteran, Pulau Pinang/Johor' },
  { name: 'Abang Fauzi Kontraktor & Runner', desc: 'Kontraktor elektrik + e-hailing, Bangi, Selangor' },
  { name: 'Pak Cik Jamal Pencen Tegar', desc: 'Pesara JKR, tokoh kampung, Kedah loghat Utara' },
  { name: 'Mak Cik Habibah Usahawan Kuih Kampung', desc: 'Ibu tunggal, pengusaha kuih, Terengganu' },
  { name: 'Cikgu Azizah Pendidik Berdedikasi', desc: 'Guru kanan, perfectionist, Melaka' },
  { name: 'Encik Rashid Pengurus Korporat T20', desc: 'Senior manager GLC, Subang Jaya, golf & bike' },
  { name: 'Farhan Belia Gen Z & Gig Rider', desc: 'Grab rider, streamer, KL urban youth' },
  { name: 'Kak Rozie Diva Kosmetik & TikToker', desc: 'Skincare founder, TikTok influencer, Shah Alam' },
  { name: 'Ain Siswi Universiti & Aktivis Kreatif', desc: 'Graphic design student, Pulau Pinang' },
  { name: 'Kamal Brader Bengkel Abang Long', desc: 'Bengkel kereta, Gombak/Klang, krew DIY' },
  { name: 'Uncle Ah Chuan Kedai Hardware Komuniti', desc: 'Hardware shop owner, Cheras/Georgetown' },
  { name: 'Uncle Ravi Pemandu E-Hailing Veteran', desc: 'Grab driver veteran, Brickfields, proud father' },
  { name: "Aisy Eksekutif Muda & 'Independent Woman'", desc: 'Marketing exec, TTDI/Damansara, modern bujang' },
];

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

function PersonaFormModal({ initial, onSave, onCancel, saving }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [prompt, setPrompt] = useState(initial?.prompt ?? '');
  const isEditing = Boolean(initial);

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text');
    if (!pasted.trim()) return;
    if (!name.trim()) {
      const match = pasted.match(/Persona:\s*(.+)/);
      if (match) {
        const extracted = match[1].trim().replace(/^\W+/, '').trim();
        setName(extracted);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-[28px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#EFE9E0] px-6 py-4">
          <h3 className="flex items-center gap-2 text-sm font-extrabold text-[#1D1C1A]">
            <UserCircle className="h-4 w-4 text-[#F58C56]" />
            {isEditing ? 'Edit Persona' : 'Add Custom Persona'}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full p-1 text-[#8C837A] hover:bg-[#FAF7F2] hover:text-[#1D1C1A]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <div>
            <label className="mb-1 block text-xs font-bold text-[#6E655D]">Persona Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='e.g. "Abe Mie Pelagat" or "Ustaz Hafeez Motivator"'
              className="w-full rounded-xl bg-[#FAF7F2] px-3.5 py-2.5 text-sm font-semibold text-[#1D1C1A] focus:outline-none focus:ring-2 focus:ring-[#F58C56]"
            />
            <p className="mt-1 text-[11px] text-[#8C837A]">
              This name appears in the Persona dropdown in AI Marketing Posting.
            </p>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-bold text-[#6E655D]">Persona Prompt *</label>
              <span className="text-[11px] text-[#8C837A]">{prompt.length} chars</span>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onPaste={handlePaste}
              placeholder={'Paste your full persona description here.\n\nTip: Paste formatted text like "👤 Persona: Name\\nGender: ..." and the name will auto-fill.'}
              className="min-h-[260px] w-full resize-none rounded-xl bg-[#FAF7F2] p-3.5 font-mono text-xs text-[#1D1C1A] focus:outline-none focus:ring-2 focus:ring-[#F58C56]"
            />
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-[#8C837A]">
              <Upload className="h-3 w-3" />
              Paste full persona traits — gender, psychology, speech style — and AI will write in this character.
            </p>
          </div>
        </div>

        <div className="flex gap-2 border-t border-[#EFE9E0] px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl bg-[#FAF7F2] py-2.5 text-xs font-bold text-[#6E655D] hover:bg-[#EFE9E0]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!name.trim() || !prompt.trim() || saving}
            onClick={() => onSave({ name: name.trim(), prompt: prompt.trim() })}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#1E1D1B] py-2.5 text-xs font-bold text-white hover:bg-black disabled:opacity-50"
          >
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {isEditing ? 'Save Changes' : 'Add Persona'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminPersonas({ onStatusBanner, onApiError }) {
  const [customs, setCustoms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [builtinExpanded, setBuiltinExpanded] = useState(false);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const fileInputRef = useRef(null);

  const loadPersonas = async () => {
    setLoading(true);
    try {
      const rows = await apiFetch('/api/personas');
      setCustoms(Array.isArray(rows) ? rows : []);
    } catch (err) {
      onApiError?.(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPersonas();
  }, []);

  const handleSave = async (payload) => {
    setSaving(true);
    try {
      if (editTarget) {
        await apiFetch(`/api/personas/${editTarget.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        onStatusBanner?.({ type: 'success', text: 'Persona updated.' });
      } else {
        await apiFetch('/api/personas', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        onStatusBanner?.({ type: 'success', text: 'Persona added!' });
      }
      setShowForm(false);
      setEditTarget(null);
      await loadPersonas();
    } catch (err) {
      onApiError?.(err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (persona) => {
    try {
      await apiFetch(`/api/personas/${persona.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isEnabled: persona.isEnabled !== 'true' }),
      });
      await loadPersonas();
    } catch (err) {
      onApiError?.(err);
    }
  };

  const handleDelete = async (persona) => {
    if (!window.confirm(`Delete persona "${persona.name}"? This cannot be undone.`)) return;
    try {
      await apiFetch(`/api/personas/${persona.id}`, { method: 'DELETE' });
      onStatusBanner?.({ type: 'success', text: `Deleted "${persona.name}".` });
      await loadPersonas();
    } catch (err) {
      onApiError?.(err);
    }
  };

  const handleBulkUpdate = async (isEnabled) => {
    try {
      await apiFetch('/api/personas/bulk-update', {
        method: 'POST',
        body: JSON.stringify({ ids: Array.from(selectedIds), isEnabled }),
      });
      setSelectedIds(new Set());
      onStatusBanner?.({ type: 'success', text: `Updated ${selectedIds.size} persona(s).` });
      await loadPersonas();
    } catch (err) {
      onApiError?.(err);
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.size} selected personas?`)) return;
    try {
      await apiFetch('/api/personas/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      setSelectedIds(new Set());
      onStatusBanner?.({ type: 'success', text: 'Selected personas deleted.' });
      await loadPersonas();
    } catch (err) {
      onApiError?.(err);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      setImporting(true);
      try {
        const wb = xlsx.read(evt.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(ws);
        const newPersonas = data
          .map((row) => {
            const nameValue =
              row['Name'] ||
              row['Persona Name'] ||
              row['Persona'] ||
              row['Title'] ||
              Object.entries(row).find(([k]) => !['no', 'no.', '#'].includes(k.toLowerCase().trim()))?.[1];

            let prompt = row['Prompt'] || row['Description'] || row['Details'];
            if (!prompt) {
              prompt = Object.entries(row)
                .filter(
                  ([k]) =>
                    !['name', 'persona name', 'persona', 'title', 'no', 'no.', '#'].includes(
                      k.toLowerCase().trim()
                    )
                )
                .map(([k, v]) => `${k}: ${v}`)
                .join('\n');
            }
            return { name: String(nameValue || '').trim(), prompt: String(prompt || '').trim() };
          })
          .filter((p) => p.name && p.prompt);

        if (newPersonas.length === 0) {
          onStatusBanner?.({ type: 'error', text: 'No valid personas found in the uploaded file.' });
          return;
        }
        const res = await apiFetch('/api/personas/batch', {
          method: 'POST',
          body: JSON.stringify({ personas: newPersonas }),
        });
        onStatusBanner?.({ type: 'success', text: `Successfully imported ${res.count} persona(s)!` });
        await loadPersonas();
      } catch (err) {
        onApiError?.(err);
      } finally {
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const enabledCount = customs.filter((c) => c.isEnabled === 'true').length;
  const itemsPerPage = 10;
  const totalPages = Math.max(1, Math.ceil(customs.length / itemsPerPage));
  const displayedCustoms = showAll
    ? customs
    : customs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-4">
      {(showForm || editTarget) && (
        <PersonaFormModal
          initial={editTarget ?? undefined}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false);
            setEditTarget(null);
          }}
          saving={saving}
        />
      )}

      {/* Header & Actions */}
      <section className="rounded-[28px] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-extrabold text-[#1D1C1A]">
              <UserCircle className="h-5 w-5 text-[#F58C56]" />
              Personas
            </h3>
            <p className="mt-0.5 text-xs text-[#8C837A]">
              Manage AI writing personas. Enabled custom personas appear alongside built-in voices in AI Posting.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-[#FAF7F2] px-4 py-2.5 text-xs font-bold text-[#1D1C1A] hover:bg-[#EFE9E0] disabled:opacity-60"
            >
              {importing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Import Excel
            </button>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-[#F58C56] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#e57c45]"
            >
              <Plus className="h-4 w-4" />
              Add Persona
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          <div className="rounded-2xl bg-[#FAF7F2] p-3 text-center">
            <div className="text-xl font-extrabold text-[#1D1C1A]">{BUILTIN_PERSONAS.length}</div>
            <div className="text-[11px] font-semibold text-[#8C837A]">Built-in Personas</div>
          </div>
          <div className="rounded-2xl bg-[#FFF0E6] p-3 text-center">
            <div className="text-xl font-extrabold text-[#C85A21]">{customs.length}</div>
            <div className="text-[11px] font-semibold text-[#C85A21]">Custom Personas</div>
          </div>
          <div className="rounded-2xl bg-emerald-50 p-3 text-center">
            <div className="text-xl font-extrabold text-emerald-700">
              {BUILTIN_PERSONAS.length + enabledCount}
            </div>
            <div className="text-[11px] font-semibold text-emerald-700">Active in Dropdown</div>
          </div>
        </div>
      </section>

      {/* Custom Personas List */}
      <section className="rounded-[28px] bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-extrabold text-[#1D1C1A]">
              Custom Personas ({customs.length})
            </h4>
            <p className="text-xs text-[#8C837A]">
              Toggle on/off to show or hide in AI Marketing Posting dropdowns.
            </p>
          </div>

          {customs.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs font-bold text-[#6E655D]">
                <input
                  type="checkbox"
                  checked={selectedIds.size === customs.length && customs.length > 0}
                  onChange={(e) =>
                    setSelectedIds(e.target.checked ? new Set(customs.map((c) => c.id)) : new Set())
                  }
                  className="h-4 w-4 accent-[#F58C56]"
                />
                Select All
              </label>

              {selectedIds.size > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => handleBulkUpdate(true)}
                    className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                  >
                    <ToggleRight className="h-3.5 w-3.5" /> Enable
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkUpdate(false)}
                    className="inline-flex items-center gap-1 rounded-xl bg-[#FAF7F2] px-2.5 py-1.5 text-xs font-bold text-[#6E655D] hover:bg-[#EFE9E0]"
                  >
                    <ToggleLeft className="h-3.5 w-3.5" /> Disable
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    className="inline-flex items-center gap-1 rounded-xl bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-[#8C837A]">
            <RefreshCw className="h-5 w-5 animate-spin" />
          </div>
        ) : customs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E6DFD5] py-10 text-center">
            <UserCircle className="mx-auto mb-2 h-8 w-8 text-[#C8C0B7]" />
            <p className="text-sm font-bold text-[#6E655D]">No custom personas yet</p>
            <p className="mt-1 text-xs text-[#8C837A]">Click "Add Persona" or "Import Excel" to get started.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {displayedCustoms.map((p) => {
              const isEnabled = p.isEnabled === 'true';
              const isExpanded = expandedIds.has(p.id);
              return (
                <div
                  key={p.id}
                  className={`rounded-2xl border p-3.5 transition ${
                    isEnabled ? 'border-[#F58C56]/40 bg-[#FFF9F5]' : 'border-[#EFE9E0] bg-[#FAF7F2] opacity-70'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={(e) => {
                        const next = new Set(selectedIds);
                        if (e.target.checked) next.add(p.id);
                        else next.delete(p.id);
                        setSelectedIds(next);
                      }}
                      className="mt-1 h-4 w-4 accent-[#F58C56]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-extrabold text-[#1D1C1A]">{p.name}</p>
                      <p className="text-[11px] text-[#8C837A]">
                        Added {new Date(p.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-[#EFE9E0] text-[#6E655D]'
                        }`}
                      >
                        {isEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleToggle(p)}
                        title={isEnabled ? 'Disable' : 'Enable'}
                        className="text-[#6E655D] hover:text-[#1D1C1A]"
                      >
                        {isEnabled ? (
                          <ToggleRight className="h-5 w-5 text-[#F58C56]" />
                        ) : (
                          <ToggleLeft className="h-5 w-5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditTarget(p)}
                        className="rounded-lg p-1.5 text-[#6E655D] hover:bg-white hover:text-[#1D1C1A]"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(p)}
                        className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 border-t border-[#EFE9E0] pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        const next = new Set(expandedIds);
                        if (isExpanded) next.delete(p.id);
                        else next.add(p.id);
                        setExpandedIds(next);
                      }}
                      className="flex items-center gap-1 text-xs font-semibold text-[#6E655D] hover:text-[#1D1C1A]"
                    >
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {isExpanded ? 'Hide' : 'Preview'} persona prompt
                    </button>
                    {isExpanded && (
                      <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-white p-3 font-mono text-xs text-[#6E655D]">
                        {p.prompt}
                      </pre>
                    )}
                  </div>
                </div>
              );
            })}

            {customs.length > itemsPerPage && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#EFE9E0] pt-3">
                <span className="text-xs text-[#8C837A]">
                  {showAll
                    ? `Showing all ${customs.length} personas`
                    : `Showing ${(currentPage - 1) * itemsPerPage + 1}-${Math.min(
                        currentPage * itemsPerPage,
                        customs.length
                      )} of ${customs.length}`}
                </span>
                <div className="flex items-center gap-1.5">
                  {!showAll && (
                    <>
                      <button
                        type="button"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="rounded-xl bg-[#FAF7F2] p-1.5 disabled:opacity-40"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="px-2 text-xs font-bold">
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        type="button"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className="rounded-xl bg-[#FAF7F2] p-1.5 disabled:opacity-40"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowAll((s) => !s)}
                    className="rounded-xl bg-[#FAF7F2] px-3 py-1.5 text-xs font-bold text-[#1D1C1A] hover:bg-[#EFE9E0]"
                  >
                    {showAll ? 'Show Paginated' : 'See All'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Built-in Personas */}
      <section className="rounded-[28px] bg-white p-5 shadow-sm">
        <button
          type="button"
          onClick={() => setBuiltinExpanded((e) => !e)}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <h4 className="flex items-center gap-2 text-sm font-extrabold text-[#1D1C1A]">
              <Lock className="h-4 w-4 text-[#8C837A]" />
              Built-in Personas ({BUILTIN_PERSONAS.length})
            </h4>
            <p className="text-xs text-[#8C837A]">
              System personas — always available, cannot be edited or disabled.
            </p>
          </div>
          {builtinExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {builtinExpanded && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {BUILTIN_PERSONAS.map((p) => (
              <div
                key={p.name}
                className="flex items-start gap-2.5 rounded-2xl bg-[#FAF7F2] p-3"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FFF0E6] text-[#C85A21]">
                  <UserCircle className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-extrabold text-[#1D1C1A]">{p.name}</div>
                  <div className="text-[11px] text-[#8C837A]">{p.desc}</div>
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  Always on
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
