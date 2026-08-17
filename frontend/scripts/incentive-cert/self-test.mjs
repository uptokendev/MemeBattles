import assert from 'node:assert/strict';

class FakeChain {
  constructor() { this.payments = new Map(); }
  async pay(row) {
    if (this.payments.has(row.id)) return this.payments.get(row.id);
    await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 3)));
    if (this.payments.has(row.id)) return this.payments.get(row.id);
    const tx = `tx:${row.id}`;
    this.payments.set(row.id, tx);
    return tx;
  }
  find(id) { return this.payments.get(id) || null; }
}

class Store {
  constructor() { this.rows = new Map(); this.locks = new Set(); }
  seed(row) { this.rows.set(row.id, { ...row, state: 'CLAIMABLE', tx: null }); }
  get(id) { return this.rows.get(id); }
  acquire(id) {
    if (this.locks.has(id)) return false;
    const row = this.rows.get(id);
    if (!row || row.state === 'CLAIMED') return false;
    this.locks.add(id); row.state = 'CLAIMING'; return true;
  }
  release(id) { this.locks.delete(id); }
  claimed(id, tx) { const row = this.rows.get(id); row.state = 'CLAIMED'; row.tx = tx; this.release(id); }
  pending(id) { const row = this.rows.get(id); row.state = 'CLAIM_PENDING'; this.release(id); }
}

async function claim({ store, chain, id, wallet, expectedChain, crashAfterPayment = false }) {
  const row = store.get(id);
  if (!row) return { ok: false, code: 'NOT_FOUND' };
  if (row.chain !== expectedChain) return { ok: false, code: 'CHAIN_MISMATCH' };
  if (row.wallet !== wallet) return { ok: false, code: 'WALLET_MISMATCH' };
  if (row.state === 'CLAIMED') return { ok: true, duplicate: true, tx: row.tx };

  const existing = chain.find(id);
  if (existing) { store.claimed(id, existing); return { ok: true, recovered: true, tx: existing }; }
  if (!store.acquire(id)) return { ok: false, code: 'IN_PROGRESS' };

  const tx = await chain.pay(row);
  if (crashAfterPayment) { store.pending(id); return { ok: false, code: 'SIMULATED_CRASH' }; }
  store.claimed(id, tx);
  return { ok: true, tx };
}

async function concurrency() {
  const store = new Store(); const chain = new FakeChain();
  const id = 'bnb:league:cert-001:0xabc';
  store.seed({ id, chain: 'bnb', wallet: '0xabc', amount: '10000000000000000' });
  await Promise.all(Array.from({ length: 50 }, () => claim({ store, chain, id, wallet: '0xabc', expectedChain: 'bnb' })));
  assert.equal(chain.payments.size, 1, '50 concurrent attempts must create one payment');
  assert.equal(store.get(id).state, 'CLAIMED');
}

async function crashRecovery() {
  const store = new Store(); const chain = new FakeChain();
  const id = 'solana:squad:cert-001:WalletABC';
  store.seed({ id, chain: 'solana', wallet: 'WalletABC', amount: '8000000' });
  const first = await claim({ store, chain, id, wallet: 'WalletABC', expectedChain: 'solana', crashAfterPayment: true });
  assert.equal(first.code, 'SIMULATED_CRASH');
  assert.equal(store.get(id).state, 'CLAIM_PENDING', 'confirmed-but-unrecorded claims must never become retryable');
  assert.equal(chain.payments.size, 1);
  const second = await claim({ store, chain, id, wallet: 'WalletABC', expectedChain: 'solana' });
  assert.equal(second.recovered, true);
  assert.equal(chain.payments.size, 1, 'recovery must never create a second payment');
  assert.equal(store.get(id).state, 'CLAIMED');
}

async function isolation() {
  const store = new Store(); const chain = new FakeChain();
  const id = 'bnb:squad:cert-001:0xabc';
  store.seed({ id, chain: 'bnb', wallet: '0xabc', amount: '1' });
  assert.equal((await claim({ store, chain, id, wallet: '0xabc', expectedChain: 'solana' })).code, 'CHAIN_MISMATCH');
  assert.equal((await claim({ store, chain, id, wallet: '0xdef', expectedChain: 'bnb' })).code, 'WALLET_MISMATCH');
  assert.equal(chain.payments.size, 0);
}

await concurrency();
await crashRecovery();
await isolation();
console.log('PASS incentive-cert self-test: concurrency, non-retryable crash recovery, chain/wallet isolation');
