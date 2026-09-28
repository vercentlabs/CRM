import { z } from 'zod';
import { offsetOf, optionalDate, optionalId, pageQuery } from '../../platform/http/query.js';
import { controller, ok, paginationMeta, type ApiModule } from '../../platform/http/route.js';
import { actorFrom } from '../../platform/tenancy.js';
import { listAuditLogs } from './audit.service.js';

const filterQuery = {
  user_id: optionalId,
  table_name: z.string().trim().min(1).max(50).optional(),
  action: z.string().trim().min(1).max(50).optional(),
  start_date: optionalDate,
  end_date: optionalDate,
};

const auditEntrySchema = z.object({
  id: z.number(),
  user_id: z.number().nullable(),
  user_email: z.string().nullable(),
  action: z.string(),
  table_name: z.string(),
  record_id: z.number().nullable(),
  old_values: z.unknown(),
  new_values: z.unknown(),
  ip_address: z.string().nullable(),
  user_agent: z.string().nullable(),
  request_id: z.string().nullable(),
  created_at: z.string(),
});

const list = controller({
  query: z.object({ ...pageQuery, ...filterQuery }),
  handle: async ({ auth, query }) => {
    const { rows, total } = await listAuditLogs(
      actorFrom(auth),
      {
        userId: query.user_id,
        tableName: query.table_name,
        action: query.action,
        from: query.start_date,
        to: query.end_date,
      },
      { limit: query.limit, offset: offsetOf(query) },
    );
    return ok(rows, paginationMeta(query.page, query.limit, total));
  },
});

export const auditModule: ApiModule = {
  name: 'audit',
  routes: [
    {
      method: 'get',
      path: '/audit-logs',
      summary: "The organization's audit log",
      tags: ['Audit'],
      permission: 'settings.audit.read',
      controller: list,
      response: auditEntrySchema.array(),
      paginated: true,
    },
  ],
};
