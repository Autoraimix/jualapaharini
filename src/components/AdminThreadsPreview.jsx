import React, { useState } from 'react';
import {
  Send,
  X,
  Check,
  Edit3,
  RefreshCw,
  Brain,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Trash2,
  Calendar,
} from 'lucide-react';

export function PostNowPreviewPanel({ items, topic, isPending, onPublish, onCancel }) {
  const [drafts, setDrafts] = useState(
    Object.fromEntries(items.map((i) => [i.accountId, i.content ?? '']))
  );
  const [comments, setComments] = useState({});
  const [skipped, setSkipped] = useState(
    new Set(items.filter((i) => i.error || !i.content).map((i) => i.accountId))
  );

  const approved = items.filter((i) => !skipped.has(i.accountId) && !i.error && i.content !== null);
  const editedCount = approved.filter(
    (i) => (drafts[i.accountId] ?? '').trim() !== (i.content ?? '').trim()
  ).length;

  const handlePublish = () => {
    onPublish(
      approved.map((i) => ({
        accountId: i.accountId,
        content: drafts[i.accountId] ?? i.content ?? '',
        edited: (drafts[i.accountId] ?? '').trim() !== (i.content ?? '').trim(),
        originalContent: i.content ?? '',
        comment: comments[i.accountId] ?? '',
      }))
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-[28px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#EFE9E0] px-6 py-4">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-extrabold text-[#1D1C1A]">
              <Edit3 className="h-4 w-4 text-[#F58C56]" />
              Review & Approve Posts
            </h3>
            <p className="mt-0.5 text-xs text-[#8C837A]">
              Topic: "{topic.slice(0, 60)}" · {approved.length}/{items.length} accounts approved
              {editedCount > 0 ? ` · ${editedCount} edited (AI will learn)` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full p-1 text-[#8C837A] hover:bg-[#FAF7F2]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {editedCount > 0 && (
          <div className="mx-6 mt-3 flex items-center gap-2 rounded-2xl bg-purple-50 px-3.5 py-2 text-xs font-semibold text-purple-700">
            <Brain className="h-3.5 w-3.5 shrink-0" />
            <span>
              AI will remember your {editedCount} edit{editedCount !== 1 ? 's' : ''} for future posts.
            </span>
          </div>
        )}

        <div className="flex-1 space-y-3 overflow-y-auto p-6">
          {items.map((item) => {
            const isSkipped = skipped.has(item.accountId);
            const draft = drafts[item.accountId] ?? item.content ?? '';
            const wasEdited = draft.trim() !== (item.content ?? '').trim();

            return (
              <div
                key={item.accountId}
                className={`space-y-2.5 rounded-2xl border p-4 ${
                  isSkipped ? 'border-[#EFE9E0] bg-[#FAF7F2] opacity-55' : 'border-[#E6DFD5] bg-[#FAF7F2]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={!isSkipped}
                    onChange={() =>
                      setSkipped((s) => {
                        const n = new Set(s);
                        if (n.has(item.accountId)) n.delete(item.accountId);
                        else n.add(item.accountId);
                        return n;
                      })
                    }
                    className="h-4 w-4 accent-[#F58C56]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-extrabold text-[#1D1C1A]">@{item.username}</div>
                    <div className="text-xs text-[#8C837A]">{item.persona}</div>
                  </div>
                  {item.learnedEdits > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700">
                      <Brain className="h-2.5 w-2.5" /> {item.learnedEdits} learned
                    </span>
                  )}
                  {wasEdited && !isSkipped && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                      Edited
                    </span>
                  )}
                </div>

                {item.error ? (
                  <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{item.error}</span>
                  </div>
                ) : (
                  <>
                    <textarea
                      value={draft}
                      onChange={(e) => setDrafts((d) => ({ ...d, [item.accountId]: e.target.value }))}
                      disabled={isSkipped}
                      maxLength={500}
                      className="min-h-[88px] w-full resize-none rounded-xl bg-white p-3 text-sm text-[#1D1C1A] focus:outline-none focus:ring-2 focus:ring-[#F58C56]"
                    />
                    <div className="flex items-center justify-between text-[11px] text-[#8C837A]">
                      <span>{draft.length}/500</span>
                      {wasEdited && <span className="font-semibold text-amber-700">Modified</span>}
                    </div>
                    {wasEdited && !isSkipped && (
                      <div className="space-y-1 border-t border-[#E6DFD5] pt-2">
                        <label className="flex items-center gap-1 text-[11px] font-bold text-[#6E655D]">
                          <Brain className="h-3 w-3 text-purple-600" />
                          Why did you edit this? (optional — helps AI learn)
                        </label>
                        <input
                          type="text"
                          value={comments[item.accountId] ?? ''}
                          onChange={(e) => setComments((c) => ({ ...c, [item.accountId]: e.target.value }))}
                          placeholder='e.g. "Always end with a CTA" or "Keep BM casual"'
                          maxLength={200}
                          className="w-full rounded-xl bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#F58C56]"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
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
            disabled={approved.length === 0 || isPending}
            onClick={handlePublish}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {isPending ? 'Publishing...' : `Publish to ${approved.length} Account${approved.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DraftReviewPanel({ drafts: initialDrafts, days, isPending, onSchedule, onCancel }) {
  const [posts, setPosts] = useState(initialDrafts.map((d) => ({ ...d })));
  const [expandedDates, setExpandedDates] = useState(new Set([initialDrafts[0]?.dateStr ?? '']));

  const grouped = posts.reduce((acc, p) => {
    if (!acc[p.dateStr]) acc[p.dateStr] = [];
    acc[p.dateStr].push(p);
    return acc;
  }, {});

  const toggleDate = (d) =>
    setExpandedDates((s) => {
      const n = new Set(s);
      if (n.has(d)) n.delete(d);
      else n.add(d);
      return n;
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-[28px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#EFE9E0] px-6 py-4">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-extrabold text-[#1D1C1A]">
              <Calendar className="h-4 w-4 text-[#F58C56]" />
              Review Scheduled Posts
            </h3>
            <p className="mt-0.5 text-xs text-[#8C837A]">
              {posts.length} posts over {days} day{days !== 1 ? 's' : ''} — edit or remove before scheduling
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full p-1 text-[#8C837A] hover:bg-[#FAF7F2]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-2.5 overflow-y-auto p-6">
          {Object.entries(grouped).map(([dateStr, datePosts]) => (
            <div key={dateStr} className="overflow-hidden rounded-2xl border border-[#EFE9E0]">
              <button
                type="button"
                onClick={() => toggleDate(dateStr)}
                className="flex w-full items-center justify-between bg-[#FAF7F2] px-4 py-2.5 text-left"
              >
                <span className="text-xs font-extrabold text-[#1D1C1A]">
                  {new Date(dateStr).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
                </span>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[#6E655D]">
                    {datePosts.length} post{datePosts.length !== 1 ? 's' : ''}
                  </span>
                  {expandedDates.has(dateStr) ? (
                    <ChevronUp className="h-3.5 w-3.5 text-[#8C837A]" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-[#8C837A]" />
                  )}
                </div>
              </button>

              {expandedDates.has(dateStr) && (
                <div className="divide-y divide-[#EFE9E0] bg-white">
                  {datePosts.map((post) => (
                    <div key={post.tempId} className="space-y-2 p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#1D1C1A]">
                          @{post.username} ·{' '}
                          <span className="font-normal text-[#8C837A]">
                            {new Date(post.scheduledAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setPosts((ps) => ps.filter((p) => p.tempId !== post.tempId))}
                          className="rounded-lg p-1 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <textarea
                        value={post.content}
                        onChange={(e) =>
                          setPosts((ps) =>
                            ps.map((p) => (p.tempId === post.tempId ? { ...p, content: e.target.value } : p))
                          )
                        }
                        maxLength={500}
                        className="min-h-[72px] w-full resize-none rounded-xl bg-[#FAF7F2] p-2.5 text-xs text-[#1D1C1A] focus:outline-none focus:ring-2 focus:ring-[#F58C56]"
                      />
                      <div className="text-right text-[10px] text-[#8C837A]">{post.content.length}/500</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {posts.length === 0 && (
            <div className="py-8 text-center text-xs text-[#8C837A]">
              All posts removed — nothing to schedule.
            </div>
          )}
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
            disabled={posts.length === 0 || isPending}
            onClick={() => onSchedule(posts)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#1E1D1B] py-2.5 text-xs font-bold text-white hover:bg-black disabled:opacity-50"
          >
            {isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {isPending ? 'Scheduling...' : `Schedule ${posts.length} Post${posts.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
