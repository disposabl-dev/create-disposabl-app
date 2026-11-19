import { useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Heart, Share2 } from "lucide-react";
import { api } from "../../../../../packages/backend/convex/_generated/api";

export function GuideSocial({
  lessonId,
  onShare,
}: {
  lessonId: string;
  onShare: () => void;
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const stats = useQuery(api.guides.social.get, { lessonId });
  const setLike = useMutation(api.guides.social.setLike);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const link = `https://disposabl.dev/guides?lesson=${encodeURIComponent(lessonId)}`;
  const login = `/login?${new URLSearchParams({ returnTo: `/guides?lesson=${lessonId}` })}`;

  const toggle = async () => {
    if (!stats || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await setLike({ lessonId, liked: !stats.liked });
    } catch {
      setMessage("Could not update this like. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const share = async () => {
    onShare();
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

  return (
    <>
      <div className="reel-social">
        {isAuthenticated ? (
          <button
            type="button"
            onClick={() => void toggle()}
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
          type="button"
          onClick={() => void share()}
          aria-label="Share guide"
        >
          <Share2 size={24} />
          <span>Share</span>
        </button>
      </div>
      {message && (
        <div className="reel-notice" role="status">
          {message} {message.startsWith("Copy") && <a href={link}>{link}</a>}
        </div>
      )}
    </>
  );
}
