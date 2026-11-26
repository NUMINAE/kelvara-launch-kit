// Runs the exact messages the Mini App sends against a local TON emulator.
//   npx tsx tests/flow.test.ts
import assert from 'node:assert/strict';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, fromNano, loadStateInit, toNano } from '@ton/core';
import { contracts, faucetMessages, payMessages, claimMessages, usdtWalletOf, kvraWalletOf, USDT_UNIT, KVRA_UNIT, TcMessage } from '../src/app/chain';
import { JettonWallet, storeJettonNotification } from '../contracts/build/kelvara_JettonWallet';
import { storeFaucetMint } from '../contracts/build/kelvara_TestUsdt';

const bc = await Blockchain.create();
const k = await contracts();
const usdt = bc.openContract(k.usdt);
const sale = bc.openContract(k.sale);

async function sendAll(from: SandboxContract<TreasuryContract>, msgs: TcMessage[]) {
  const out = [];
  for (const m of msgs) {
    out.push(await from.send({
      to: Address.parse(m.address),
      value: BigInt(m.amount),
      bounce: true,
      init: m.stateInit ? loadStateInit(Cell.fromBase64(m.stateInit).beginParse()) : undefined,
      body: m.payload ? Cell.fromBase64(m.payload) : undefined,
    }));
  }
  return out;
}
const failed = (res: any[]) => res.some((r) => r.transactions.some((t: any) => t.description.type === 'generic' && t.description.computePhase.type === 'vm' && t.description.computePhase.exitCode !== 0));
async function tokens(w: { address: Address }) {
  const c = bc.openContract(JettonWallet.fromAddress(w.address));
  try { return (await c.getGetWalletData()).balance; } catch { return 0n; }
}
async function spent(who: SandboxContract<TreasuryContract>, fn: () => Promise<unknown>) {
  const before = await who.getBalance();
  await fn();
  return before - (await who.getBalance());
}
let n = 0;
const ok = (name: string) => console.log(`  ok ${++n}  ${name}`);

const alice = await bc.treasury('alice');
const bob = await bc.treasury('bob');

// 1. faucet: first tap also deploys the token
let cost = await spent(alice, async () => { assert.equal(failed(await sendAll(alice, faucetMessages(k))), false); });
assert.equal(await tokens(await usdtWalletOf(k, alice.address)), 1000n * USDT_UNIT);
assert.equal((await usdt.getGetJettonData()).totalSupply, 1000n * USDT_UNIT);
ok(`faucet mints 1,000 tUSDT and deploys the token (cost ${fromNano(cost)} TON)`);

// 2. pay 250: first payment also deploys the sale
cost = await spent(alice, async () => { assert.equal(failed(await sendAll(alice, await payMessages(k, alice.address, 250n * USDT_UNIT, 1n))), false); });
assert.equal(await tokens(await usdtWalletOf(k, alice.address)), 750n * USDT_UNIT);
assert.equal(await tokens(await usdtWalletOf(k, sale.address)), 250n * USDT_UNIT);
assert.equal(await sale.getAllocation(alice.address), 3125n * KVRA_UNIT);
assert.equal(await sale.getRaised(), 250n * USDT_UNIT);
ok(`paying 250 tUSDT records 3,125 KVRA and deploys the sale (cost ${fromNano(cost)} TON)`);

// 3. a second payment adds up
await sendAll(alice, await payMessages(k, alice.address, 50n * USDT_UNIT, 2n));
assert.equal(await sale.getAllocation(alice.address), 3750n * KVRA_UNIT);
ok('a second payment of 50 tUSDT adds 625 KVRA');

// 4. claim
cost = await spent(alice, async () => { assert.equal(failed(await sendAll(alice, claimMessages(k, 3n))), false); });
assert.equal(await tokens(await kvraWalletOf(k, alice.address)), 3750n * KVRA_UNIT);
assert.equal(await sale.getAllocation(alice.address), 0n);
assert.equal((await sale.getGetJettonData()).totalSupply, 3750n * KVRA_UNIT);
ok(`claim mints 3,750 KVRA to the buyer (cost ${fromNano(cost)} TON)`);

// 5. nothing left to claim
assert.equal(failed(await sendAll(alice, claimMessages(k, 4n))), true);
assert.equal(await tokens(await kvraWalletOf(k, alice.address)), 3750n * KVRA_UNIT);
ok('a second claim is rejected');

// 6. someone who never paid cannot claim
assert.equal(failed(await sendAll(bob, claimMessages(k, 5n))), true);
assert.equal(await tokens(await kvraWalletOf(k, bob.address)), 0n);
ok('a wallet that never paid cannot claim');

// 7. the faucet cap holds
const tooMuch = beginCell().store(storeFaucetMint({ $$type: 'FaucetMint', amount: 1001n * USDT_UNIT })).endCell();
assert.equal(failed([await bob.send({ to: usdt.address, value: toNano('0.12'), body: tooMuch })]), true);
ok('the faucet refuses more than 1,000 tUSDT per tap');

// 8. a forged payment notice is ignored
const forged = beginCell().store(storeJettonNotification({ $$type: 'JettonNotification', queryId: 9n, amount: 500n * USDT_UNIT, from: bob.address, forwardPayload: beginCell().storeBit(0).endCell().asSlice() })).endCell();
assert.equal(failed([await bob.send({ to: sale.address, value: toNano('0.05'), body: forged })]), true);
assert.equal(await sale.getAllocation(bob.address), 0n);
ok('a payment notice not sent by the test USDT wallet is rejected');

// 9. you cannot pay more than you hold
await sendAll(bob, faucetMessages(k));
assert.equal(failed(await sendAll(bob, await payMessages(k, bob.address, 5000n * USDT_UNIT, 6n))), true);
assert.equal(await tokens(await usdtWalletOf(k, bob.address)), 1000n * USDT_UNIT);
assert.equal(await sale.getAllocation(bob.address), 0n);
ok('paying more than the balance fails and moves nothing');

// 10. a second buyer, after everything is deployed
await sendAll(bob, await payMessages(k, bob.address, 1000n * USDT_UNIT, 7n));
await sendAll(bob, claimMessages(k, 8n));
assert.equal(await tokens(await kvraWalletOf(k, bob.address)), 12500n * KVRA_UNIT);
assert.equal(await sale.getRaised(), 1300n * USDT_UNIT);
ok('a second buyer pays 1,000 tUSDT and claims 12,500 KVRA');

console.log(`\n${n} checks passed`);
console.log('tUSDT master ', k.usdt.address.toString({ testOnly: true }));
console.log('Kelvara sale ', k.sale.address.toString({ testOnly: true }));
