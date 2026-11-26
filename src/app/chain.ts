// Builds the testnet transactions the Mini App asks the wallet to sign.
// The same functions are run against a TON emulator in tests/flow.test.ts.
import { Address, beginCell, Cell, toNano, storeStateInit } from '@ton/core';
import { TestUsdt, storeFaucetMint } from '../../contracts/build/kelvara_TestUsdt';
import { KelvaraSale, storeClaim } from '../../contracts/build/kelvara_KelvaraSale';
import { JettonWallet, storeJettonTransfer } from '../../contracts/build/kelvara_JettonWallet';

export const META_BASE = 'https://numinae.github.io/kelvara-launch-kit/app/meta/';
export const USDT_UNIT = 1_000_000n; // tUSDT has 6 decimals
export const KVRA_UNIT = 1_000_000_000n; // KVRA has 9 decimals
export const FAUCET_AMOUNT = 1000n * USDT_UNIT; // one faucet tap, also the contract's cap
export const RATE = 12_500n; // KVRA units per tUSDT unit = 0.08 tUSDT per KVRA

export type TcMessage = { address: string; amount: string; stateInit?: string; payload?: string };

const content = (file: string) => beginCell().storeUint(1, 8).storeStringTail(META_BASE + file).endCell();
const b64 = (c: Cell) => c.toBoc().toString('base64');
const friendly = (a: Address) => a.toString({ testOnly: true, bounceable: true });

export async function contracts() {
  const usdt = await TestUsdt.fromInit(content('tusdt.json'), FAUCET_AMOUNT);
  const sale = await KelvaraSale.fromInit(content('kvra.json'), usdt.address, RATE);
  return { usdt, sale };
}
export type Kit = Awaited<ReturnType<typeof contracts>>;

const init = (c: { init?: { code: Cell; data: Cell } }) => b64(beginCell().store(storeStateInit(c.init!)).endCell());

export async function usdtWalletOf(k: Kit, owner: Address) {
  return JettonWallet.fromInit(owner, k.usdt.address);
}
export async function kvraWalletOf(k: Kit, owner: Address) {
  return JettonWallet.fromInit(owner, k.sale.address);
}

/** Mint test USDT to the sender. Carries the token's code, so the first caller also deploys it. */
export function faucetMessages(k: Kit): TcMessage[] {
  return [{
    address: friendly(k.usdt.address),
    amount: toNano('0.12').toString(),
    stateInit: init(k.usdt),
    payload: b64(beginCell().store(storeFaucetMint({ $$type: 'FaucetMint', amount: FAUCET_AMOUNT })).endCell()),
  }];
}

/** Pay test USDT into the sale. The first message makes sure the sale contract exists. */
export async function payMessages(k: Kit, owner: Address, usdtUnits: bigint, queryId: bigint): Promise<TcMessage[]> {
  const wallet = await usdtWalletOf(k, owner);
  const body = beginCell().store(storeJettonTransfer({
    $$type: 'JettonTransfer',
    queryId,
    amount: usdtUnits,
    destination: k.sale.address,
    responseDestination: owner,
    customPayload: null,
    forwardTonAmount: toNano('0.05'),
    forwardPayload: beginCell().storeBit(0).endCell().asSlice(),
  })).endCell();
  return [
    { address: friendly(k.sale.address), amount: toNano('0.03').toString(), stateInit: init(k.sale) },
    { address: friendly(wallet.address), amount: toNano('0.15').toString(), payload: b64(body) },
  ];
}

/** Claim the KVRA recorded for the sender. */
export function claimMessages(k: Kit, queryId: bigint): TcMessage[] {
  return [{
    address: friendly(k.sale.address),
    amount: toNano('0.12').toString(),
    stateInit: init(k.sale),
    payload: b64(beginCell().store(storeClaim({ $$type: 'Claim', queryId })).endCell()),
  }];
}

export const kvraFor = (usdtUnits: bigint) => usdtUnits * RATE;
export { Address, friendly };
