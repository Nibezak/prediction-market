export const AUDIT_EVENT_CATALOG = {
  authentication: [
    'auth.login.succeeded', 'auth.login.failed', 'auth.logout', 'auth.signup.succeeded', 'auth.signup.failed',
    'auth.password.changed', 'auth.password.reset.requested', 'auth.password.reset.completed', 'auth.email.changed',
    'auth.email.verified', 'auth.session.created', 'auth.session.revoked', 'auth.session.expired', 'auth.mfa.enabled',
    'auth.mfa.disabled', 'auth.mfa.challenge.succeeded', 'auth.mfa.challenge.failed', 'auth.account.locked',
  ],
  money: [
    'money.deposit.requested', 'money.deposit.completed', 'money.deposit.failed', 'money.deposit.reversed',
    'money.withdrawal.requested', 'money.withdrawal.held', 'money.withdrawal.approved', 'money.withdrawal.rejected',
    'money.withdrawal.processing', 'money.withdrawal.completed', 'money.withdrawal.failed', 'money.withdrawal.released',
    'money.balance.adjustment.requested', 'money.balance.adjustment.completed', 'money.balance.adjustment.failed',
    'money.refund.requested', 'money.refund.completed', 'money.chargeback.opened', 'money.chargeback.closed',
    'money.reconciliation.started', 'money.reconciliation.completed', 'money.reconciliation.exception',
  ],
  trading: [
    'trade.quote.requested', 'trade.quote.returned', 'trade.quote.failed', 'trade.buy.requested', 'trade.buy.completed',
    'trade.buy.failed', 'trade.sell.requested', 'trade.sell.completed', 'trade.sell.failed', 'trade.position.opened',
    'trade.position.updated', 'trade.position.settled', 'trade.position.paid', 'trade.position.lost',
    'trade.liquidity.added', 'trade.liquidity.removed', 'trade.liquidity.failed', 'trade.slippage.rejected',
    'trade.insufficient_balance.rejected', 'trade.market_closed.rejected', 'trade.rate_limit.rejected',
  ],
  market: [
    'market.created', 'market.updated', 'market.submitted', 'market.approved', 'market.rejected', 'market.published',
    'market.paused', 'market.resumed', 'market.closed', 'market.cancelled', 'market.resolution.requested',
    'market.resolution.approved', 'market.resolved', 'market.payout.started', 'market.payout.completed',
    'market.payout.failed', 'market.liquidity.seeded', 'market.image.updated', 'market.rules.updated', 'market.flagged',
  ],
  user: [
    'user.profile.viewed', 'user.profile.updated', 'user.username.changed', 'user.phone.changed', 'user.role.changed',
    'user.trading.blocked', 'user.trading.unblocked', 'user.withdrawals.blocked', 'user.withdrawals.unblocked',
    'user.account.suspended', 'user.account.reinstated', 'user.account.deleted', 'user.data.exported',
    'user.staff.impersonation.started', 'user.staff.impersonation.ended', 'user.support.note.added',
  ],
  risk: [
    'risk.evaluation.started', 'risk.evaluation.completed', 'risk.signal.triggered', 'risk.case.opened',
    'risk.case.assigned', 'risk.case.escalated', 'risk.case.note.added', 'risk.case.cleared', 'risk.case.confirmed',
    'risk.case.closed', 'risk.funds.held', 'risk.funds.released', 'risk.device.flagged', 'risk.ip.flagged',
    'risk.trade.flagged', 'risk.withdrawal.flagged', 'risk.deposit.flagged', 'risk.market.flagged',
    'risk.manual.review.requested', 'risk.manual.review.completed',
  ],
  community: [
    'community.comment.created', 'community.comment.edited', 'community.comment.deleted', 'community.comment.liked',
    'community.comment.reported', 'community.reply.created', 'community.profile.followed', 'community.profile.unfollowed',
    'community.user.mentioned', 'community.content.hidden', 'community.content.restored', 'community.user.muted',
  ],
  administration: [
    'admin.settings.viewed', 'admin.settings.updated', 'admin.brand.updated', 'admin.theme.updated',
    'admin.locale.updated', 'admin.category.created', 'admin.category.updated', 'admin.category.deleted',
    'admin.featured.updated', 'admin.fee.updated', 'admin.permission.denied', 'admin.export.created',
    'admin.notification.sent', 'admin.bulk_action.started', 'admin.bulk_action.completed',
  ],
  operations: [
    'ops.job.created', 'ops.job.started', 'ops.job.completed', 'ops.job.failed', 'ops.job.retried',
    'ops.service.started', 'ops.service.stopped', 'ops.service.degraded', 'ops.health.check.failed',
    'ops.database.migration.started', 'ops.database.migration.completed', 'ops.cache.cleared',
    'ops.webhook.received', 'ops.webhook.rejected', 'ops.webhook.processed', 'ops.rate_limit.exceeded',
  ],
  security: [
    'security.authorization.denied', 'security.csrf.rejected', 'security.nonce.rejected', 'security.signature.rejected',
    'security.input.rejected', 'security.sql_injection.blocked', 'security.xss.blocked', 'security.secret.rotated',
    'security.api_key.created', 'security.api_key.revoked', 'security.unusual_ip.detected',
    'security.unusual_device.detected', 'security.brute_force.detected', 'security.permission.changed',
    'security.audit.exported', 'security.data.accessed',
  ],
  communications: [
    'notification.created', 'notification.sent', 'notification.delivered', 'notification.failed',
    'notification.opened', 'notification.dismissed', 'notification.preference.changed', 'email.sent', 'email.failed',
    'sms.sent', 'sms.failed', 'push.sent', 'push.failed', 'support.ticket.opened', 'support.ticket.closed',
  ],
} as const

export type AuditCategory = keyof typeof AUDIT_EVENT_CATALOG
export type AuditEventType = typeof AUDIT_EVENT_CATALOG[AuditCategory][number]

export const AUDIT_EVENT_TYPES = Object.values(AUDIT_EVENT_CATALOG).flat()
