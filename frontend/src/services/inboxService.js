import api from '../lib/api';

export const inboxService = {
  list: (platform) =>
    api.get('/inbox', { params: platform ? { platform } : {} }).then((r) => r.data),
  postComments: (postId, accountId) =>
    api.get(`/inbox/post/${encodeURIComponent(postId)}`, { params: { account_id: accountId } }).then((r) => r.data),
  reply: (postId, accountId, message, commentId) =>
    api.post('/inbox/reply', { post_id: postId, account_id: accountId, message, comment_id: commentId }).then((r) => r.data),
  action: (kind, postId, commentId, accountId) =>
    api.post('/inbox/action', { kind, post_id: postId, comment_id: commentId, account_id: accountId }).then((r) => r.data),
};
