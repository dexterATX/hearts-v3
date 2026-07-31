-- hearts v3 · 0005_drop_outbox_ops.sql
-- P2 cleanup: outbox_ops (the "server-side op log" concept) is dead weight.
-- Idempotency lives on the content tables' unique op_id columns + the
-- client's durable sqlite outbox — nothing ever wrote to or read from this
-- table. Dropping it keeps the schema honest. (Contract §3's outbox_ops row
-- is hereby retired; MANIFEST records the decision.)
drop table if exists public.outbox_ops;
