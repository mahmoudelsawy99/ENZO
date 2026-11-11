import type { Request, Response, NextFunction } from 'express';
import { HttpError } from '../../shared/http-error.js';
import type { FeatureKey } from './billing.model.js';
import { tenantHasFeature } from './entitlement.service.js';

const BASIC_REPORTS = new Set(['dashboard', 'daily', 'weekly', 'monthly', 'payments', 'discounts', 'refunds', 'transactions', 'cashier']);

export function requireFeature(feature: FeatureKey) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const tenantId = req.access?.tenantId;
    if (!tenantId) {
      next(new HttpError(401, 'unauthenticated', 'Sign in is required.'));
      return;
    }
    void tenantHasFeature(tenantId, feature)
      .then((allowed) => {
        if (!allowed) {
          next(new HttpError(403, 'plan_feature_unavailable', 'This feature is not included in the current subscription.'));
          return;
        }
        next();
      })
      .catch(next);
  };
}

export async function assertReportFeature(req: Request, kind: string): Promise<void> {
  if (BASIC_REPORTS.has(kind)) {
    return;
  }
  const tenantId = req.access?.tenantId;
  if (!tenantId) {
    throw new HttpError(401, 'unauthenticated', 'Sign in is required.');
  }
  if (!(await tenantHasFeature(tenantId, 'reports.advanced'))) {
    throw new HttpError(403, 'plan_feature_unavailable', 'Advanced reports are not included in the current subscription.');
  }
}
