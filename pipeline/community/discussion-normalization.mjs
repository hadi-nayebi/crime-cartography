const MAX_BODY_CHARS = 20_000;

function cleanText(value, max = MAX_BODY_CHARS) {
  return String(value ?? "").replaceAll("\u0000", "").slice(0, max);
}

export function normalizeDiscussion({ topicId, discussion }) {
  if (!/^[a-z0-9][a-z0-9._-]+$/.test(topicId ?? "")) {
    throw new Error("invalid stable discussion topic id");
  }
  if (!Number.isInteger(discussion?.number) || discussion.number < 1) {
    throw new Error("invalid GitHub Discussion number");
  }
  const comments = (discussion.comments ?? []).map((comment) => ({
    comment_id: cleanText(comment.id, 200),
    author: cleanText(comment.author?.login ?? "deleted-user", 100),
    body: cleanText(comment.body),
    created_at: comment.createdAt,
    updated_at: comment.updatedAt,
    url: comment.url,
    trust: "untrusted-public-input",
    eligible_for_direct_execution: false,
  }));
  return {
    topic_id: topicId,
    discussion_number: discussion.number,
    title: cleanText(discussion.title, 300),
    url: discussion.url,
    updated_at: discussion.updatedAt,
    comment_count: comments.length,
    comments,
    trust: "untrusted-public-input",
    eligible_for_direct_execution: false,
  };
}

export function publicDiscussionProjection(snapshot) {
  return {
    topic_id: snapshot.topic_id,
    discussion_number: snapshot.discussion_number,
    title: snapshot.title,
    url: snapshot.url,
    updated_at: snapshot.updated_at,
    comment_count: snapshot.comment_count,
  };
}
