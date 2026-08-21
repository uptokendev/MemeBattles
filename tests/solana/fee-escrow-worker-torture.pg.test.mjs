import assert from "node:assert/strict";
import test from "node:test";

const url = String(process.env.DATABASE_URL || process.env.PG_TEST_URL || "").trim();
const skip = !url;

const WORKER_NAME = "solana-fee-escrow-worker-torture";
const CHAIN_ID = 101;
const JOB_COUNT = 100;
const PREFIX = "TortureCamp";

function campaignId(i) {
  return `${PREFIX}${String(i).padStart(3, "0")}111111111111111111111`;
}

async function withPool(fn) {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: url, max: 6 });
  try {
    return await fn(pool);
  } finally {
    await pool.end().catch(() => {});
  }
}

async function acquire(client, owner, ttlSeconds) {
  const result = await client.query(
    `insert into public.solana_worker_leases (worker_name, owner_id, lease_expires_at, heartbeat_at)
     values ($1, $2, now() + make_interval(secs => $3), now())
     on conflict (worker_name) do update set
       owner_id = excluded.owner_id,
       lease_expires_at = excluded.lease_expires_at,
       heartbeat_at = now(),
       updated_at = now()
     where public.solana_worker_leases.lease_expires_at < now()
        or public.solana_worker_leases.owner_id = excluded.owner_id
     returning owner_id`,
    [WORKER_NAME, owner, ttlSeconds],
  );
  return result.rows[0]?.owner_id === owner;
}

async function claimInit(client, campaign) {
  const result = await client.query(
    `update public.solana_fee_escrow_accruals
        set init_attempts = init_attempts + 1,
            last_init_attempt_at = now(),
            next_init_attempt_at = now() + interval '60 seconds',
            updated_at = now()
      where chain_id=$1
        and campaign_address=$2
        and init_status in ('pending','failed')
        and (next_init_attempt_at is null or next_init_attempt_at <= now())
      returning campaign_address, init_attempts`,
    [CHAIN_ID, campaign],
  );
  return result.rows[0] || null;
}

async function claimFlush(client, campaign) {
  const result = await client.query(
    `update public.solana_fee_escrow_accruals
        set flush_status='submitted',
            flush_attempts = flush_attempts + 1,
            updated_at = now()
      where chain_id=$1
        and campaign_address=$2
        and init_status='initialized'
        and (
          flush_status in ('idle','queued','failed')
          or (flush_status='submitted' and updated_at < now() - interval '2 minutes')
        )
      returning campaign_address`,
    [CHAIN_ID, campaign],
  );
  return result.rows[0] || null;
}

function createRpc(options = {}) {
  const inits = [];
  const flushes = [];
  const hangMs = Number(options.hangMs || 0);
  const crashOn = options.crashOn || null;
  return {
    inits,
    flushes,
    async init(campaign) {
      if (crashOn === campaign) throw new Error(`rpc crash ${campaign}`);
      if (hangMs) await new Promise((resolve) => setTimeout(resolve, hangMs));
      inits.push(campaign);
      return `init-${campaign}`;
    },
    async flush(campaign) {
      if (hangMs) await new Promise((resolve) => setTimeout(resolve, hangMs));
      flushes.push(campaign);
      return `flush-${campaign}`;
    },
  };
}

async function runWorkerTick(pool, owner, rpc, ttlSeconds) {
  const client = await pool.connect();
  try {
    if (!(await acquire(client, owner, ttlSeconds))) return { skipped: true, owner };
    const pending = await client.query(
      `select campaign_address
         from public.solana_fee_escrow_accruals
        where chain_id=$1
          and campaign_address like $2
          and init_status in ('pending','failed')
          and (next_init_attempt_at is null or next_init_attempt_at <= now())
        order by campaign_address
        limit 100`,
      [CHAIN_ID, `${PREFIX}%`],
    );
    for (const row of pending.rows) {
      if (!(await acquire(client, owner, ttlSeconds))) return { skipped: true, owner, lost: row.campaign_address };
      const claimed = await claimInit(client, row.campaign_address);
      if (!claimed) continue;
      try {
        const sig = await rpc.init(row.campaign_address);
        await client.query(
          `update public.solana_fee_escrow_accruals
              set init_status='initialized', init_signature=$3, last_error=null, updated_at=now()
            where chain_id=$1 and campaign_address=$2`,
          [CHAIN_ID, row.campaign_address, sig],
        );
      } catch (error) {
        await client.query(
          `update public.solana_fee_escrow_accruals
              set init_status='failed', last_error=$3, updated_at=now()
            where chain_id=$1 and campaign_address=$2`,
          [CHAIN_ID, row.campaign_address, String(error?.message || error)],
        );
      }
    }

    const flushRows = await client.query(
      `select campaign_address
         from public.solana_fee_escrow_accruals
        where chain_id=$1
          and campaign_address like $2
          and init_status='initialized'
          and (weekly_accrued - weekly_flushed) + (monthly_accrued - monthly_flushed)
              + (recruiter_accrued - recruiter_flushed) + (airdrop_accrued - airdrop_flushed)
              + (squad_accrued - squad_flushed) + (protocol_accrued - protocol_flushed) > 0
        order by campaign_address
        limit 100`,
      [CHAIN_ID, `${PREFIX}%`],
    );
    for (const row of flushRows.rows) {
      if (!(await acquire(client, owner, ttlSeconds))) return { skipped: true, owner, lost: row.campaign_address };
      const claimed = await claimFlush(client, row.campaign_address);
      if (!claimed) continue;
      try {
        const sig = await rpc.flush(row.campaign_address);
        await client.query(
          `update public.solana_fee_escrow_accruals
              set flush_status='confirmed', last_flush_signature=$3, last_error=null, updated_at=now(),
                  weekly_flushed = weekly_accrued,
                  monthly_flushed = monthly_accrued,
                  recruiter_flushed = recruiter_accrued,
                  airdrop_flushed = airdrop_accrued,
                  squad_flushed = squad_accrued,
                  protocol_flushed = protocol_accrued
            where chain_id=$1 and campaign_address=$2`,
          [CHAIN_ID, row.campaign_address, sig],
        );
      } catch (error) {
        await client.query(
          `update public.solana_fee_escrow_accruals
              set flush_status='failed', last_error=$3, updated_at=now()
            where chain_id=$1 and campaign_address=$2`,
          [CHAIN_ID, row.campaign_address, String(error?.message || error)],
        );
      }
    }
    return { skipped: false, owner };
  } finally {
    client.release();
  }
}

async function seedJobs(pool, count, { initialized = false, pendingFlush = false } = {}) {
  for (let i = 0; i < count; i += 1) {
    const campaign = campaignId(i);
    await pool.query(
      `insert into public.solana_fee_escrow_accruals (
         chain_id, campaign_address, escrow_address, init_status,
         weekly_accrued, monthly_accrued, recruiter_accrued, airdrop_accrued, squad_accrued, protocol_accrued,
         flush_status
       ) values ($1,$2,$2,$3,$4,0,0,0,0,0,$5)
       on conflict (chain_id, campaign_address) do update set
         init_status = excluded.init_status,
         weekly_accrued = excluded.weekly_accrued,
         flush_status = excluded.flush_status,
         weekly_flushed = 0,
         init_attempts = 0,
         flush_attempts = 0,
         next_init_attempt_at = null,
         last_error = null,
         updated_at = now()`,
      [
        CHAIN_ID,
        campaign,
        initialized ? "initialized" : "pending",
        pendingFlush ? 20_000_000 : 0,
        pendingFlush ? "queued" : "idle",
      ],
    );
  }
}

async function cleanup(pool) {
  await pool.query(`delete from public.solana_fee_escrow_events where campaign_address like $1`, [`${PREFIX}%`]);
  await pool.query(`delete from public.solana_fee_escrow_accruals where campaign_address like $1`, [`${PREFIX}%`]);
  await pool.query(`delete from public.solana_worker_leases where worker_name=$1`, [WORKER_NAME]);
}

test("Gate O: three workers, 100 jobs, exclusive lease, no duplicate init/flush, crash and replay", { skip }, async () => {
  await withPool(async (pool) => {
    await cleanup(pool);
    try {
      await seedJobs(pool, JOB_COUNT);
      const rpc = createRpc();
      const ticks = await Promise.all([
        runWorkerTick(pool, "A", rpc, 60),
        runWorkerTick(pool, "B", rpc, 60),
        runWorkerTick(pool, "C", rpc, 60),
      ]);
      const owners = ticks.filter((tick) => !tick.skipped).map((tick) => tick.owner);
      assert.equal(owners.length, 1, "only one worker may own the live lease");
      assert.equal(new Set(rpc.inits).size, rpc.inits.length, "no duplicate init submission");
      assert.equal(rpc.inits.length, JOB_COUNT);

      const remaining = await pool.query(
        `select count(*)::int as n
           from public.solana_fee_escrow_accruals
          where campaign_address like $1 and init_status <> 'initialized'`,
        [`${PREFIX}%`],
      );
      assert.equal(remaining.rows[0].n, 0);

      await pool.query(`delete from public.solana_fee_escrow_accruals where campaign_address like $1`, [`${PREFIX}%`]);
      await seedJobs(pool, JOB_COUNT, { initialized: true, pendingFlush: true });
      const flushRpc = createRpc();
      await Promise.all([
        runWorkerTick(pool, "A", flushRpc, 60),
        runWorkerTick(pool, "B", flushRpc, 60),
        runWorkerTick(pool, "C", flushRpc, 60),
      ]);
      assert.equal(new Set(flushRpc.flushes).size, flushRpc.flushes.length, "no duplicate flush submission");
      assert.equal(flushRpc.flushes.length, JOB_COUNT);

      await pool.query(`delete from public.solana_worker_leases where worker_name=$1`, [WORKER_NAME]);
      const leaseClient = await pool.connect();
      try {
        assert.equal(await acquire(leaseClient, "A", 60), true);
        assert.equal(await acquire(leaseClient, "B", 60), false);
        await leaseClient.query(
          `update public.solana_worker_leases set lease_expires_at = now() - interval '1 second' where worker_name=$1`,
          [WORKER_NAME],
        );
        assert.equal(await acquire(leaseClient, "B", 60), true);
        assert.equal(await acquire(leaseClient, "A", 60), false);
      } finally {
        leaseClient.release();
      }

      await pool.query(`delete from public.solana_fee_escrow_accruals where campaign_address like $1`, [`${PREFIX}%`]);
      await seedJobs(pool, 3);
      const crashTarget = campaignId(0);
      const crashRpc = createRpc({ crashOn: crashTarget });
      await runWorkerTick(pool, "A", crashRpc, 60);
      const crashed = await pool.query(
        `select init_status, last_error from public.solana_fee_escrow_accruals where campaign_address=$1`,
        [crashTarget],
      );
      assert.equal(crashed.rows[0].init_status, "failed");
      assert.match(String(crashed.rows[0].last_error || ""), /rpc crash/);
      await pool.query(
        `update public.solana_fee_escrow_accruals
            set next_init_attempt_at = now() - interval '1 second', init_status='failed'
          where campaign_address=$1`,
        [crashTarget],
      );
      const recoverRpc = createRpc();
      await runWorkerTick(pool, "B", recoverRpc, 60);
      const recovered = await pool.query(
        `select init_status from public.solana_fee_escrow_accruals where campaign_address=$1`,
        [crashTarget],
      );
      assert.equal(recovered.rows[0].init_status, "initialized");
      assert.equal(recoverRpc.inits.filter((id) => id === crashTarget).length, 1);

      const eventCampaign = campaignId(99);
      const insertEvent = async () =>
        pool.query(
          `insert into public.solana_fee_escrow_events (
             chain_id, tx_hash, log_index, event_kind, campaign_address, escrow_address, weekly_lamports, total_lamports
           ) values ($1,$2,$3,$4,$5,$5,$6,$6)
           on conflict (chain_id, tx_hash, log_index, event_kind) do nothing
           returning tx_hash`,
          [CHAIN_ID, "replay-sig", 1, "FeeSlicesAccrued", eventCampaign, 5],
        );
      const applyAccrual = async () => {
        const inserted = await insertEvent();
        if (!inserted.rows[0]) return false;
        await pool.query(
          `insert into public.solana_fee_escrow_accruals (
             chain_id, campaign_address, escrow_address, init_status, weekly_accrued
           ) values ($1,$2,$2,'initialized',$3)
           on conflict (chain_id, campaign_address) do update set
             weekly_accrued = public.solana_fee_escrow_accruals.weekly_accrued + excluded.weekly_accrued`,
          [CHAIN_ID, eventCampaign, 5],
        );
        return true;
      };
      await pool.query(`delete from public.solana_fee_escrow_events where campaign_address=$1`, [eventCampaign]);
      await pool.query(`delete from public.solana_fee_escrow_accruals where campaign_address=$1`, [eventCampaign]);
      assert.equal(await applyAccrual(), true);
      assert.equal(await applyAccrual(), false);
      const aggregate = await pool.query(
        `select weekly_accrued::int as weekly from public.solana_fee_escrow_accruals where campaign_address=$1`,
        [eventCampaign],
      );
      assert.equal(aggregate.rows[0].weekly, 5);
    } finally {
      await cleanup(pool);
    }
  });
});

test("Gate O: RPC hang past lease TTL lets another worker take over without a stuck queue", { skip }, async () => {
  await withPool(async (pool) => {
    await cleanup(pool);
    try {
      await seedJobs(pool, 1);
      const hangRpc = createRpc({ hangMs: 1200 });
      const started = runWorkerTick(pool, "A", hangRpc, 1);
      await new Promise((resolve) => setTimeout(resolve, 50));
      await pool.query(
        `update public.solana_worker_leases set lease_expires_at = now() - interval '1 second' where worker_name=$1`,
        [WORKER_NAME],
      );
      assert.equal(await acquire(pool, "B", 60), true);
      await started;
      const owners = await pool.query(`select owner_id from public.solana_worker_leases where worker_name=$1`, [
        WORKER_NAME,
      ]);
      assert.equal(owners.rows[0].owner_id, "B");
    } finally {
      await cleanup(pool);
    }
  });
});
