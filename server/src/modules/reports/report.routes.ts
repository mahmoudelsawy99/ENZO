import { Router } from 'express';
import { z } from 'zod';
import { readValidated, validateBody } from '../../middleware/validate-request.js';
import { asyncHandler } from '../../shared/async-handler.js';
import { readAccess, requirePermission } from '../access/access.middleware.js';
import { assertReportFeature, requireFeature } from '../billing/entitlement.middleware.js';
import { renderReport } from './report.export.js';
import { reportHome, runReport, type ReportQuery } from './report.service.js';
import { exportSchema, homeSchema, reportQuerySchema } from './report.validation.js';

export const reportRouter = Router();

function toQuery(query: z.infer<typeof reportQuerySchema>['query']): ReportQuery {
  return {
    from: query.from,
    to: query.to,
    branchId: query.branchId,
    employeeId: query.employeeId,
    categoryId: query.categoryId,
    paymentMethod: query.paymentMethod,
    status: query.status,
    section: query.section,
    payrollStatus: query.payrollStatus,
    lang: query.lang,
    page: query.page,
    pageSize: query.pageSize,
  };
}

reportRouter.get('/home', validateBody(homeSchema), asyncHandler(async (req, res) => {
  res.json({ data: await reportHome(readAccess(req)) });
}));

reportRouter.get('/:kind/export', requirePermission('reports.export'), requireFeature('exports'), validateBody(exportSchema), asyncHandler(async (req, res) => {
  const { params, query } = readValidated<z.infer<typeof exportSchema>>(req);
  const report = await runReport(readAccess(req), params.kind, toQuery(query));
  const file = await renderReport(report, query.format, query.lang);
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(file.body);
}));

reportRouter.get('/:kind', validateBody(reportQuerySchema), asyncHandler(async (req, res) => {
  const { params, query } = readValidated<z.infer<typeof reportQuerySchema>>(req);
  await assertReportFeature(req, params.kind);
  res.json({ data: await runReport(readAccess(req), params.kind, toQuery(query)) });
}));
