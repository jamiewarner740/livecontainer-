import { sql, type Db } from './db';

type Tx = Db;

/** Records who did what. Pass the transaction to write it atomically with the change itself. */
export async function audit(staffId: number | null, action: string, entity?: string, entityId?: string, detail?: unknown, tx: Tx = sql) {
  await tx`insert into audit_log (staff_id, action, entity, entity_id, detail)
           values (${staffId}, ${action}, ${entity ?? null}, ${entityId ?? null}, ${detail === undefined ? null : tx.json(detail as never)})`;
}
