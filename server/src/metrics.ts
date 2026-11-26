export const metrics = {
  requests: 0,
  errors: 0,
  webhooks: 0,
  startedAt: Date.now(),
};

export function metricsSnapshot() {
  return {
    requests: metrics.requests,
    errors: metrics.errors,
    webhooks: metrics.webhooks,
    uptimeSeconds: Math.round((Date.now() - metrics.startedAt) / 1000),
  };
}
