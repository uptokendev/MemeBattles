export function defaultEvmChainId() {
  const n = Number(process.env.DEFAULT_EVM_CHAIN_ID || process.env.VITE_DEFAULT_CHAIN_ID || 56);
  return n === 97 ? 97 : 56;
}
