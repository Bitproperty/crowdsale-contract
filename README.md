# bitproperty-token
BitProperty Token (BTP) contract

BTP is an ERC20-compatible token built on OpenZeppelin's VestedToken

## Token price

On the first day, 1ETH converts to 10,000 BTP tokens. 

For every next day of the sale this amount gets reduced - it gets multipled by 90% (0.9).

This means that, with the current allocation of 1,000,000,000 (1 billion) tokens, we will sell all of them if we sell out in the first day.

The other extreme is all sales happening on the last day at a last day price, which is 1ETH = 10,000 * 0.9 ^ 29 = 471.013 tokens (rounded to 3 decimal points). In this case, we will sell 47 million tokens and keep the rest to the owner addr.

If we spread out the 100,000 ETH over all 30 days, we will sell 319202947.242 (319 million) tokens
