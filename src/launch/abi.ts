import { parseAbi } from 'viem';

/** viem ABIs for the wallet-side calls (reads for quotes, writes for trades). */

export const curveAbi = parseAbi([
  'struct BuyQuote { uint256 usdgUsed; uint256 fee; uint256 surcharge; uint256 toCurve; uint256 tokensOut; }',
  'function quoteBuy(uint256 usdgIn) view returns (BuyQuote)',
  'function quoteSell(uint256 tokensIn) view returns (uint256 usdgOut, uint256 fee)',
  'function reserves() view returns (uint256 x, uint256 y)',
  'function realUsdg() view returns (uint256)',
  'function gradThreshold() view returns (uint256)',
  'function graduated() view returns (bool)',
  'function currentSurchargeBps() view returns (uint256)',
  'function creatorFeesOf(address) view returns (uint256)',
  'function buy(uint256 usdgIn, uint256 minTokensOut, uint256 deadline) returns (uint256)',
  'function sell(uint256 tokensIn, uint256 minUsdgOut, uint256 deadline) returns (uint256)',
  'error Expired()',
  'error BuyPaused()',
  'error BuyTooLarge(uint256 max)',
  'error SlippageExceeded()',
  'error IsGraduated()',
  'error NotEnoughSold()',
  'error CurveExhausted()',
  'error ZeroAmount()',
]);

export const factoryAbi = parseAbi([
  'function paused() view returns (bool)',
  'function maxBuyUsdg() view returns (uint256)',
]);

export const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);

export const faucetAbi = parseAbi([
  'function faucet(uint256 amount)',
  'error TooMuch()',
]);

export const routerAbi = parseAbi([
  'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
  'function quoteExactIn(PoolKey key, bool zeroForOne, uint256 amountIn) returns (uint256 amountOut, uint160 sqrtPriceAfter)',
  'function swapExactIn(PoolKey key, bool zeroForOne, uint256 amountIn, uint256 minOut, uint256 deadline) returns (uint256 amountOut)',
  'error Expired()',
  'error ZeroAmount()',
  'error TooLittleReceived(uint256 amountOut)',
]);

export const pmAbi = parseAbi([
  'function extsload(bytes32 startSlot, uint256 nSlots) view returns (bytes32[])',
]);

export const curveFeesAbi = parseAbi([
  'function creatorFeesOf(address) view returns (uint256)',
  'function claimCreatorFees(address to) returns (uint256)',
  'error NothingToClaim()',
  'error ZeroAddress()',
]);

export const lockerAbi = parseAbi([
  'function owed(address account, address currency) view returns (uint256)',
  'function collectFees(address token) returns (uint256 tokenFees, uint256 usdgFees)',
  'function claim(address currency, address to) returns (uint256)',
  'error NothingToClaim()',
  'error NotMigrated()',
  'error ZeroAddress()',
]);
