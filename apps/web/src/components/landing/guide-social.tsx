import { useEffect, useRef, useState, type FormEvent } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { Heart, MessageCircle, Share2, X } from "lucide-react";

type Comment = {
  id: string;
  author: string;
  body: string;
  createdAt: number;
  mine: boolean;
};
const guide = {
  get: makeFunctionReference<
    "query",
    { lessonId: string },
    {
      likes: number;
      comments: number;
      liked: boolean;
    }
  >("guides/social:get"),
  comments: makeFunctionReference<"query", { lessonId: string }, Comment[]>(
    "guides/social:listComments",
  ),
  like: makeFunctionReference<
    "mutation",
    { lessonId: string; liked: boolean },
    null
  >("guides/social:setLike"),
  post: makeFunctionReference<
    "mutation",
    { lessonId: string; body: string },
    null
  >("guides/social:postComment"),
  remove: makeFunctionReference<"mutation", { commentId: string }, null>(
    "guides/social:deleteComment",
  ),
  report: makeFunctionReference<"mutation", { commentId: string }, null>(
    "guides/social:reportComment",
  ),
  block: makeFunctionReference<"mutation", { commentId: string }, null>(
    "guides/social:blockCommenter",
  ),
};

export function GuideSocial({
  lessonId,
  commentsOpen,
  setCommentsOpen,
}: {
  lessonId: string;
  commentsOpen: boolean;
  setCommentsOpen: (open: boolean) => void;
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const stats = useQuery(guide.get, { lessonId });
  const comments = useQuery(
    guide.comments,
    commentsOpen ? { lessonId } : "skip",
  );
  const setLike = useMutation(guide.like);
  const post = useMutation(guide.post);
  const remove = useMutation(guide.remove);
  const report = useMutation(guide.report);
  const block = useMutation(guide.block);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const openButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLElement>(null);
  const link = `https://disposabl.dev/guides?lesson=${encodeURIComponent(lessonId)}`;
  const login = `/login?${new URLSearchParams({ returnTo: `/guides?lesson=${lessonId}` })}`;

  useEffect(() => {
    if (!commentsOpen) return;
    closeButton.current?.focus();
    return () => openButton.current?.focus();
  }, [commentsOpen]);

  const run = async (action: () => Promise<unknown>, success?: string) => {
    if (busy) return false;
    setBusy(true);
    setMessage("");
    try {
      await action();
      if (success) setMessage(success);
      return true;
    } catch {
      setMessage("That didn't work. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const share = async () => {
    try {
      if (typeof navigator.share === "function")
        await navigator.share({ title: "Disposabl Guides", url: link });
      else {
        await navigator.clipboard.writeText(link);
        setMessage("Link copied");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("Copy this link to share the guide.");
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;
    if (await run(() => post({ lessonId, body: text }))) setBody("");
  };

  return (
    <>
      <div className="reel-social">
        {isAuthenticated ? (
          <button
            type="button"
            onClick={() =>
              void run(() => setLike({ lessonId, liked: !stats?.liked }))
            }
            aria-label={stats?.liked ? "Unlike video" : "Like video"}
            aria-pressed={stats?.liked ?? false}
            disabled={busy || !stats}
          >
            <Heart size={25} fill={stats?.liked ? "currentColor" : "none"} />
            <span>{stats?.likes ?? 0}</span>
          </button>
        ) : (
          <a
            href={login}
            aria-label="Sign in to like video"
            aria-disabled={isLoading}
          >
            <Heart size={25} />
            <span>{stats?.likes ?? 0}</span>
          </a>
        )}
        <button
          ref={openButton}
          type="button"
          onClick={() => setCommentsOpen(true)}
          aria-label="Open comments"
        >
          <MessageCircle size={25} />
          <span>{stats?.comments ?? 0}</span>
        </button>
        <button
          type="button"
          onClick={() => void share()}
          aria-label="Share guide"
        >
          <Share2 size={24} />
          <span>Share</span>
        </button>
      </div>
      {message && !commentsOpen && (
        <div className="reel-notice" role="status">
          {message} {message.startsWith("Copy") && <a href={link}>{link}</a>}
        </div>
      )}
      {commentsOpen && (
        <div
          className="reel-sheet-backdrop"
          onClick={() => setCommentsOpen(false)}
        >
          <section
            ref={sheet}
            className="reel-comments"
            role="dialog"
            aria-modal="true"
            aria-labelledby="comments-heading"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              const controls = sheet.current?.querySelectorAll<HTMLElement>(
                "button:not(:disabled), a[href], textarea:not(:disabled)",
              );
              if (!controls?.length) return;
              const first = controls[0];
              const last = controls[controls.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }}
          >
            <div className="reel-comments-heading">
              <h2 id="comments-heading">Comments</h2>
              <button
                ref={closeButton}
                type="button"
                onClick={() => setCommentsOpen(false)}
                aria-label="Close comments"
              >
                <X size={21} />
              </button>
            </div>
            <div className="reel-comments-list">
              {comments === undefined ? (
                <p>Loading comments…</p>
              ) : comments.length === 0 ? (
                <p>Start the conversation.</p>
              ) : (
                comments.map((comment) => (
                  <article key={comment.id}>
                    <strong>{comment.author}</strong>
                    <p>{comment.body}</p>
                    {isAuthenticated && (
                      <div className="reel-comment-controls">
                        {comment.mine ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void run(() => remove({ commentId: comment.id }))
                            }
                          >
                            Delete
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  () => report({ commentId: comment.id }),
                                  "Comment reported.",
                                )
                              }
                            >
                              Report
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  () => block({ commentId: comment.id }),
                                  "Author blocked.",
                                )
                              }
                            >
                              Block author
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </article>
                ))
              )}
            </div>
            {isAuthenticated ? (
              <form onSubmit={(event) => void submit(event)}>
                <label htmlFor="guide-comment">Add a comment</label>
                <textarea
                  id="guide-comment"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={600}
                  rows={2}
                />
                <div className="reel-comment-footer">
                  <span>{body.length}/600</span>
                  <button type="submit" disabled={busy || !body.trim()}>
                    Post
                  </button>
                </div>
                <p>
                  Keep comments respectful. <a href="/legal/terms">Terms</a>
                </p>
              </form>
            ) : (
              <p>
                <a href={login}>Sign in to comment</a>
              </p>
            )}
            {message && <p role="status">{message}</p>}
          </section>
        </div>
      )}
    </>
  );
}
