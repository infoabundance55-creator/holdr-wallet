# Creator earnings

Creators earn **70% of the 1% trading fee**, which is 0.7% of every trade in their token, before and after graduation.

## Before graduation

Every buy and sell on the curve credits your share in USDG. Claim it at any time to any address you choose (`claimCreatorFees(to)` on the token's curve pool). Nothing expires.

## After graduation

The Uniswap pool collects its 1% fee in both the token and USDG.

1. **Collect.** Anyone can call `collectFees(token)` on the liquidity locker. It pulls the fees from Uniswap and credits 70% to the creator and 30% to Holdr, in each currency.
2. **Claim.** You claim each currency separately (`claim(currency, to)`).

## Handing over the creator role

You can move the creator role, and with it all future fees, to another wallet. It takes two steps so a typo can't send it to the wrong place:

1. The current creator proposes the new wallet.
2. The new wallet accepts.

Fees earned before the handover stay with the old wallet. After graduation, accepting the handover first collects any pending Uniswap fees for the old creator.

## What creators can't do

Creators can't change any rule of their token: not the supply, not the fee, not the graduation threshold. There is no creator tax and no way to mint, freeze or blacklist.
