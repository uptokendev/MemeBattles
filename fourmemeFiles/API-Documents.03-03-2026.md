# Table of Contents

- [CHANGES](#changes)
  - [03/03/2026](#changes---03032026)
  - [30/01/2026](#changes---30012026)
  - [30/10/2025](#changes---30102025)
  - [09/10/2025](#changes---09102025)
  - [14/06/2025](#changes---14062025)
  - [17/03/2025](#changes---17032025)
  - [18/02/2025](#changes---18022025)
  - [01/02/2025](#changes---01022025)
  - [01/10/2024](#changes---01102024)
  - [19/09/2024](#changes---19092024)
- [Protocol Interfaces](#protocol-interfaces)
  - [TokenManager (V1)](#tokenmanager-v1)
    - [Methods](#methods)
    - [Events](#events)
  - [TokenManager2 (V2)](#tokenmanager2-v2)
    - [Methods](#methods-1)
    - [Events](#events-1)
  - [TokenManagerHelper3 (V3)](#tokenmanagerhelper3-v3)
    - [Methods](#methods-2)
- [FAQ](#faq)
  - [Error Codes](#error-codes)
    - [buyToken Errors](#buytoken-errors)
    - [sellToken Errors](#selltoken-errors)
  - [How to Identify X Mode Exclusive Tokens](#how-to-identify-x-mode-exclusive-tokens)
    - [Off-chain](#1-off-chain)
    - [On-chain](#2-on-chain)
  - [How to Identify TaxToken](#how-to-identify-taxtoken)
    - [On-chain Method](#on-chain-method)
    - [Off-chain Method](#off-chain-method)
  - [How to Identify AntiSniperFeeMode Tokens](#how-to-identify-antisniperfeemode-tokens)
    - [On-chain Method](#on-chain-method-1)
    - [Off-chain Method](#off-chain-method-1)
  - [How to Identify Token Created By Agent Creator](#how-to-identify-token-created-by-agent-creator)
    - [On-chain Method](#on-chain-method-2)
    - [Off-chain Method](#off-chain-method-2)
  - [How to Identify Agent Wallets](#how-to-identify-agent-wallets)
    - [On-chain Method](#on-chain-method-3)

---

# CHANGES - 03/03/2026

## FAQ Updates
- added guide **How to Identify Token Created By Agent Creator**
- added guide **How to Identify Agent Wallets** and documented the `AgentIdentifier` contract (address and ABI)

# CHANGES - 30/01/2026

## TokenManager2 (V2)
- added new TaxToken mode and the abi file of TaxToken.
- added AntiSniperFeeMode for all tokens
- added guides to identify TaxToken and AntiSniperFeeMode
- updated the abi file of TokenManager2

# CHANGES - 30/10/2025

## TokenManager2 (V2)
- rebranded the Binance MPC Wallet only Mode (Fair Mode) to X Mode, and allow everyone to buy exclusive tokens in X Mode.
- added method `buyToken(bytes args, uint256 time, bytes signature)` to support buying X Mode exclusive tokens.

# CHANGES - 09/10/2025

## FAQ Updates
- added support for identifying tokens that can only be traded with the Binance MPC Wallet. We recommend that third parties filter out these tokens. See FAQ for details.

# CHANGES - 14/06/2025

## TokenManagerHelper3(V3)
- added methods `buyWithEth` `sellForEth`s to support direct use of BNB to purchase ERC20 pairs, automatically exchanging BNB between ERC20.

# CHANGES - 17/03/2025

## TokenManager1(V1)

- added a method `function purchaseToken(uint256 origin, address token, address to, uint256 amount, uint256 maxFunds)`
- added a method `function purchaseTokenAMAP(uint256 origin, address token, address to, uint256 funds, uint256 minAmount) payable`
  
  
# CHANGES - 18/02/2025

## TokenManager2(V2)

- added a method `sellToken(origin, token, amount, minFunds, feeRate, feeRecipient)` to support setting fee recipient
- added a method `sellToken(origin, token, from, amount, minFunds, feeRate, feeRecipient)` to support routers call


# CHANGES - 01/02/2025

## TokenManagerHelper3(V3)
- change contract address to below:
  
  - BSC: 0xF251F83e40a78868FcfA3FA4599Dad6494E46034

  - Arbitrum One: 0x02287dc3CcA964a025DAaB1111135A46C10D3A57

  - Base: 0x1172FABbAc4Fe05f5a5Cebd8EBBC593A76c42399

- change the method `tryBuy` to support new features 
- TokenManagerHelper V1/V2 should be upgraded to V3


# CHANGES - 01/10/2024

## TokenManagerHelper2(V2)

- change contract address to `0x79c7909097a2a5cedb8da900e3192cee671521a6`
- bug fixes for the method `tryBuy`

# CHANGES - 19/09/2024

## TokenManager(V1) & TokenManager2(V2)

- These smart contracts are designed for creating new tokens and executing trades.
- The old TokenManager (referred to as V1) still functions for trading tokens that have already been created but cannot create new tokens; It is only used to support the buying and selling of tokens created before the TokenManager2 (referred to as V2) deployment.
- If full support four.meme is needed, both TokenManager V1 and V2 should be supported.
- If you only wish to support tokens created after September 5, 2024, then only V2 TokenManager needs to be supported.
- The method for simultaneously supporting both V1 and V2 TokenManagers is as follows:
    - First, use the TokenManagerHelper method getTokenInfo to get the token information.
    - Check information if the token was created by V1 that the tradings should be processed through the interfaces of old V1 TokenManager. Otherwise, use the V2 version.
    - If pre-calculations of trading are needed, call helper methods.

## TokenManagerHelper3 (V3)

- This smart contract is a wrapper of the TokenManagers. It is designed for getting token information and performing pre-calculations easily.
- The old TokenManagerHelper (referred to as V1/V2) still works but we have provided a new TokenManagerHelper3 (referred to as V3) contract that unifies the information query interfaces for both V1 TokenManager and V3 TokenManager.
- We recommend users who have previously used V1/V2 helper to migrate to V3 helper. it supports tokens created by both TokenManager V1 and V2.
  

# Protocol Interfaces
# TokenManager (V1)

This smart contract is mainly used to create new tokens and execute trades. Support tokens created before September 5, 2024.

**Address on BSC**

`0xEC4549caDcE5DA21Df6E6422d448034B5233bFbC`

**ABI File**

`TokenManager.lite.abi`

## Methods

- **`purchaseTokenAMAP(address token, uint256 funds, uint256 minAmount)`**
    
    If the user wants to buy a specific amount of BNB worth of tokens.
    
    - `token`: Token address
    - `funds`: Amount of BNB
    - `minAmount`: Minimum amount of tokens to be purchased if the price changes
- **`purchaseToken(address token, uint256 amount, uint256 maxFunds)`**
    
    If the user wants to buy a specific amount of tokens.
    
    - `token`: Token address
    - `amount`: Amount of tokens
    - `maxFunds`: Maximum amount of BNB to be spent if the price changes
  
- **`function purchaseTokenAMAP(uint256 origin, address token, address to, uint256 funds, uint256 minAmount)`**
    If the user wants to buy a specific amount of BNB worth of tokens for another recipient.
    
    - `origin`: pass default 0
    - `token`: Token address
    - `to`: Specific recipient of the token
    - `funds`: Amount of BNB
    - `minAmount`: Minimum amount of tokens to be purchased if the price changes
  
- **`purchaseToken(uint256 origin, address token, address to, uint256 amount, uint256 maxFunds)`**   
    If the user wants to buy a specific amount of tokens for another recipient.

    - `origin`: pass default 0
    - `token`: Token address
    - `to`: Specific recipient of the token
    - `amount`: Amount of tokens
    - `maxFunds`: Maximum amount of BNB to be spent if the price changes
  
- **`saleToken(address token, uint256 amount)`**
    
    If the user wants to sell tokens.
    
    - `token`: Token address
    - `amount`: Amount of tokens

## Events

- **`TokenCreate(address creator, address token, uint256 requestId, string name, string symbol, uint256 totalSupply, uint256 launchTime)`**
    
    Emitted when a new token is created.
    
    - `creator`: Address of the token creator
    - `token`: Address of the created token
    - `requestId`: Unique identifier for the token creation request
    - `name`: Name of the token
    - `symbol`: Symbol of the token
    - `totalSupply`: Total supply of the token
    - `launchTime`: Launch time of the token
- **`TokenPurchase(address token, address account, uint256 tokenAmount, uint256 etherAmount)`**
    
    Emitted when tokens are purchased.
    
    - `token`: Address of the token purchased
    - `account`: Address of the buyer
    - `tokenAmount`: Amount of tokens purchased
    - `etherAmount`: Amount of BNB spent on the purchase
- **`TokenSale(address token, address account, uint256 tokenAmount, uint256 etherAmount)`**
    
    Emitted when tokens are sold.
    
    - `token`: Address of the token sold
    - `account`: Address of the seller
    - `tokenAmount`: Amount of tokens sold
    - `etherAmount`: Amount of BNB received from the sale

# TokenManager2 (V2)

TokenManager2 is V2 of TokenManager, which is a significant upgrade that now supports the features of purchasing tokens using both BNB and BEP20. Support tokens created after September 5, 2024.

**Address on BSC**

`0x5c952063c7fc8610FFDB798152D69F0B9550762b`

**ABI File**

`TokenManager2.lite.abi`

## Methods

- **`buyTokenAMAP(address token, uint256 funds, uint256 minAmount)`**
    
    If the user wants to buy a specific amount of quote worth of tokens for msg.sender.
    
    - `token`: Token address
    - `funds`: Amount of quote
    - `minAmount`: Minimum amount of tokens to be purchased if the price changes
- **`buyTokenAMAP(address token, address to, uint256 funds, uint256 minAmount)`**
    
    If the user wants to buy a specific amount of quote worth of tokens for another recipient.
    
    - `token`: Token address
    - `to`: Specific recipient of the token
    - `funds`: Amount of quote
    - `minAmount`: Minimum amount of tokens to be purchased if the price changes
- **`buyToken(address token, uint256 amount, uint256 maxFunds)`**
    
    If the user wants to buy a specific amount of tokens for msg.sender.
    
    - `token`: Token address
    - `amount`: Amount of tokens
    - `maxFunds`: Maximum amount of quote that could be spent if the price changes
- **`buyToken(address token, address to, uint256 amount, uint256 maxFunds)`**
    
    If the user wants to buy a specific amount of tokens for another recipient.
    
    - `token`: Token address
    - `to`: Recipient of the token
    - `amount`: Amount of tokens
    - `maxFunds`: Maximum amount of quote that could be spent if the price changes
- **`sellToken(address token, uint256 amount)`**
    
    If the user wants to sell tokens.
    
    - `token`: Token address
    - `amount`: Amount of tokens


- **`sellToken(uint256 origin, address token, uint256 amount, uint256 minFunds, uint256 feeRate, address feeRecipient)`**

    If the user wants to sell tokens with a third-party fee recipient.
  
    - `origin`: Set 0
    - `token`: The address of the token to be sold.
    - `amount`: The amount of tokens to be sold.
    - `minFunds`: The minimum amount of funds to be received after the sale.
    - `feeRate`: The router's fee rate. 100 means 1%, and 10 means 0.1%. (MAX 5%)
    - `feeRecipient`: The address that will receive the fee.

- **`sellToken(uint256 origin, address token, address from, uint256 amount, uint256 minFunds, uint256 feeRate, address feeRecipient)`**

    If the user wants to sell tokens through a third-party router, the original sender of the transaction must be the token owner.
  
    - `origin`: Set 0
    - `token`: The address of the token to be sold.
    - `from`: The address of the token owner(tx.origin == from).
    - `amount`: The amount of tokens to be sold.
    - `minFunds`: The minimum amount of funds to be received after the sale.
    - `feeRate`: The router's fee rate. 100 means 1%, and 10 means 0.1%. (MAX 5%)
    - `feeRecipient`: The address that will receive the fee.

- Before calling `sellToken`, the token owner has to approve first `ERC20.approve(tokenManager, amount)`.

- **`buyToken(bytes args, uint256 time, bytes signature) public payable nonReentrant`**
    
    Encoded-params buy interface for tokens in X Mode.
    
    - `args`: abi.encode `BuyTokenParams`
      
      ```solidity
      struct BuyTokenParams {
          uint256 origin;
          address token;
          address to;
          uint256 amount;
          uint256 maxFunds;
          uint256 funds;
          uint256 minAmount;
      }
      ```  
      - `origin`: Set 0
      - `token`: The address of the token to purchase
      - `to`: The recipient address of the purchased tokens
      - `amount`: The amount of tokens to buy (set 0 if using funds-based purchase)
      - `maxFunds`: Max quote to spend when buying a fixed `amount` (0 to skip)
      - `funds`: The quote amount to spend when buying AMAP (set 0 if using `amount`)
      - `minAmount`: Minimum token amount expected.
    - `time`: Reserved (currently ignored). You can pass 0.
    - `signature`: Reserved (currently ignored). You can pass empty bytes.
    


## Events

- **`TokenCreate(address creator, address token, uint256 requestId, string name, string symbol, uint256 totalSupply, uint256 launchTime, uint256 launchFee)`**
    
    Emitted when a new token is created.
    
    - `creator`: Address of the creator of the token
    - `token`: Address of the newly created token
    - `requestId`: Unique request ID for the creation
    - `name`: Name of the token
    - `symbol`: Symbol of the token
    - `totalSupply`: Total supply of the token
    - `launchTime`: Timestamp when the token was launched
    - `launchFee`: Fee paid for launching the token
  
- **`TokenPurchase(address token, address account, uint256 price, uint256 amount, uint256 cost, uint256 fee, uint256 offers, uint256 funds)`**
    
    Emitted when a token is purchased.
    
    - `token`: Address of the token being purchased
    - `account`: Address of the account making the purchase
    - `price`: Price per token at the time of purchase
    - `amount`: Amount of tokens purchased
    - `cost`: Total cost for the purchase
    - `fee`: Fee paid
    - `offers`: Number of offers available at the time of purchase
    - `funds`: Amount of funds raised at the time of sale
- **`TokenSale(address token, address account, uint256 price, uint256 amount, uint256 cost, uint256 fee, uint256 offers, uint256 funds)`**
    
    Emitted when a token is sold.
    
    - `token`: Address of the token being sold
    - `account`: Address of the account making the sale
    - `price`: Price per token at the time of sale
    - `amount`: Amount of tokens sold
    - `cost`: Total cost for the sale
    - `fee`: Fee paid
    - `offers`: Number of offers available at the time of sale
    - `funds`: Amount of funds raised at the time of sale
- **`TradeStop(address token)`**
    
    Emitted when trading for a specific token is stopped.
    
    - `token`: Address of the token for which trading is stopped
- **`LiquidityAdded(address base, uint256 offers, address quote, uint256 funds)`**
    
    Emitted when liquidity is added to the token.
    
    - `base`: Address of the base token
    - `offers`: Number of offers added
    - `quote`: Address of the quote token which is the token traded by. If quote returns address 0, it means the token is traded by BNB. otherwise traded by BEP20
    - `funds`: Total funds added for liquidity

# TokenManagerHelper3 (V3)

This smart contract is a wrapper of the TokenManager. It is designed for getting token information and performing pre-calculations easily. Support tokens created by both TokenManager V1 and V2.

**Address**

- BSC: 0xF251F83e40a78868FcfA3FA4599Dad6494E46034

- Arbitrum One: 0x02287dc3CcA964a025DAaB1111135A46C10D3A57

- Base: 0x1172FABbAc4Fe05f5a5Cebd8EBBC593A76c42399

**ABI File**

`TokenManagerHelper3.abi`

## Methods

- **`getTokenInfo(address token) returns (uint256 version, address tokenManager, address quote, uint256 lastPrice, uint256 tradingFeeRate, uint256 minTradingFee, uint256 launchTime, uint256 offers, uint256 maxOffers, uint256 funds, uint256 maxFunds, bool liquidityAdded)`**
    
    Get information about the token.
    
    - `token`: The address of your token
    - Returns:
        - `version`: The TokenManager version. If version returns 1, you should call V1 TokenManager methods for trading. If version returns 2, call V2
        - `tokenManager`: The address of the token manager which manages your token. We recommend using this address to call the TokenManager-related interfaces and parameters, replacing the hardcoded TokenManager addresses
        - `quote`: The address of the quote token of your token. If quote returns address 0, it means the token is traded by BNB. otherwise traded by BEP20
        - `lastPrice`: The last price of your token
        - `tradingFeeRate`: The trading fee rate of your token. The actual usage of the fee rate should be the return value divided by 10,000
        - `minTradingFee`: The amount of minimum trading fee
        - `launchTime`: Launch time of the token
        - `offers`: Amount of tokens that are not sold
        - `maxOffers`: Maximum amount of tokens that could be sold before creating Pancake pair
        - `funds`: Amount of paid BNB or BEP20 raised
        - `maxFunds`: Maximum amount of paid BNB or BEP20 that could be raised
        - `liquidityAdded`: True if the Pancake pair has been created
- **`tryBuy(address token, uint256 amount, uint256 funds) public view returns (address tokenManager, address quote, uint256 estimatedAmount, uint256 estimatedCost, uint256 estimatedFee, uint256 amountMsgValue, uint256 amountApproval, uint256 amountFunds)`**  
  Attempt to buy a token and get estimated results.

  - `token`: The address of the token to purchase  
  - `amount`: The amount of the token the user wants to purchase  
  - `funds`: The amount of money the user wants to spend (in the quote currency)

  **Returns**:
    - `tokenManager`: The address of the TokenManager associated with the token  
    - `quote`: The address of the quote currency for the token, where `address(0)` represents ETH or BNB  
    - `estimatedAmount`: The estimated amount of tokens that can be bought  
    - `estimatedCost`: The estimated cost in the quote currency  
    - `estimatedFee`: The estimated fee for the transaction  
    - `amountMsgValue`: The value to be set in `msg.value` when calling `TokenManager.buyToken()` or `TokenManager.buyTokenAMAP()`  
    - `amountApproval`: The amount of tokens that need to be pre-approved for `TokenManager.buyToken()` or `TokenManager.buyTokenAMAP()`  
    - `amountFunds`: The value used for the `funds` parameter when calling `TokenManager.buyTokenAMAP()`

  **Example**:

  - If the user wants to buy 10,000 tokens:
    - Call: `tryBuy(token, 10000*1e18, 0)`

  - If the user wants to spend 10 BNB to purchase tokens:
    - Call: `tryBuy(token, 0, 10*1e18)`
  

- **`trySell(address token, uint256 amount) returns (address tokenManager, address quote, uint256 funds, uint256 fee)`**
    
    Just pre-calculate the result if the user sells a specified amount of tokens if needed.
    
    - `token`: The address of token
    - `amount`: The amount of token that the user wants to sell
    - Returns:
        - `tokenManager`: The address of the token manager which manages your token
        - `quote`: The address of the quote token of your token
        - `funds`: The amount of quote token users will receive for selling a token
        - `fee`: The amount of quote token users will pay for trading fee
- **`calcInitialPrice(uint256 maxRaising, uint256 totalSupply, uint256 offers, uint256 reserves) returns (uint256 priceWei)`**

    This function calculates the initial price of each token based on the specified parameters such as the amount raised, total supply, tokens available for sale, and reserved tokens.


    - `maxRaising`: The maximum amount of BNB to be raised. It represents the maximum BNB amount the project aims to raise through the token issuance.
    - `totalSupply`: The total token supply. It represents the maximum amount of tokens the issuer plans to release.
    - `offers`: The number of tokens available for sale in the initial offering. It represents the amount of tokens available for public sale in the initial stage.
    - `reserves`: The reserved token amount. It represents the number of tokens retained by the issuer, typically for the team or future use.
    - Returns:
        - `priceWei`: The initial token price in Wei.
    
    
    
- **`buyWithEth(uint256 origin, address token, address to, uint256 funds, uint256 minAmount) payable `**
    
    If the user wants to buy tokens using BNB directly.
    
    > Note: This method is only applicable for ERC20/ERC20 trading pairs (quote token is not address(0)). It is not supported for BNB trading pairs.
    
    - `origin`: Set 0
    - `token`: The address of the token to purchase
    - `to`: The recipient address of the purchased tokens. If set to address(0), tokens will be sent to msg.sender
    - `funds`: The amount of BNB to spend
    - `minAmount`: The minimum amount of tokens to receive if the price changes

- **`sellForEth(uint256 origin, address token, uint256 amount, uint256 minFunds, uint256 feeRate, address feeRecipient)`**
    
    If the user wants to sell tokens for BNB with a third-party fee recipient.
    
    > Note: This method is only applicable for ERC20/ERC20 trading pairs (quote token is not address(0)). It is not supported for BNB trading pairs.
    
    > Note: The trading fee will be collected in the quote token (ERC20) instead of BNB.
    
    - `origin`: Set 0
    - `token`: The address of the token to sell
    - `amount`: The amount of tokens to sell
    - `minFunds`: The minimum amount of BNB to receive
    - `feeRate`: The fee rate for the transaction. 100 means 1%, 10 means 0.1%. (MAX 5%)
    - `feeRecipient`: The address that will receive the fee (in quote token)

- **`sellForEth(uint256 origin, address token, address from, uint256 amount, uint256 minFunds, uint256 feeRate, address feeRecipient)`**
    
    If the user wants to sell tokens for BNB through a third-party router, the original sender of the transaction must be the token owner.
    
    > Note: This method is only applicable for ERC20/ERC20 trading pairs (quote token is not address(0)). It is not supported for BNB trading pairs.
    
    > Note: The trading fee will be collected in the quote token (ERC20) instead of BNB.
    
    - `origin`: Set 0
    - `token`: The address of the token to sell
    - `from`: The address of the token owner (tx.origin must equal from)
    - `amount`: The amount of tokens to sell
    - `minFunds`: The minimum amount of BNB to receive
    - `feeRate`: The fee rate for the transaction. 100 means 1%, 10 means 0.1%. (MAX 5%)
    - `feeRecipient`: The address that will receive the fee (in quote token)

- **`sellForEth(uint256 origin, address token, address from, address to, uint256 amount, uint256 minFunds)`**
    
    If the user wants to sell tokens for BNB and specify a different recipient for the BNB proceeds.
    
    > Note: This method is only applicable for ERC20/ERC20 trading pairs (quote token is not address(0)). It is not supported for BNB trading pairs.

    > Note: The trading fee will be collected in the quote token (ERC20) instead of BNB.
    - `origin`: Set 0
    - `token`: The address of the token to sell
    - `from`: The address of the token owner
    - `to`: The address that will receive the BNB proceeds
    - `amount`: The amount of tokens to sell
    - `minFunds`: The minimum amount of BNB to receive

# FAQ

## Error Codes

### buyToken Errors

| Error Code | Description |
|------------|-------------|
| GW - GWEI | Amount precision is not aligned to GWEI |
| ZA - Zero Address | The 'to' address should not be set to address(0) |
| TO - Invalid to | The 'to' address should not be set to PancakePair address |
| Slippage | The amount spent for purchase exceeds maxFunds |
| More BNB | Insufficient BNB sent in msg.value for purchase |
| A | Buy X Mode exclusive token by error method. Please use the X Mode buy method.

### sellToken Errors

| Error Code | Description |
|------------|-------------|
| GW - GWEI | Amount precision is not aligned to GWEI |
| FR - FeeRate | Fee rate exceeds 5% |
| SO - Small Order | Order amount is too small |
| Slippage | Amount of tokens received from sale is less than minAmount |




## How to Identify X Mode Exclusive Tokens

There are two ways to determine whether a token is **exclusive** (X Mode):

### 1. Off-chain

Query token info via https://four.meme/meme-api/v1/private/token/get?address=[token address] or https://four.meme/meme-api/v1/private/token/getById?id=[requestId]. `requestId` can be got from the TokenCreate event.
#### Check the `version` value returned from the token information API. If `version = V8`, the token is an **exclusive token**.

### 2. On-chain

Retrieve the value:

```solidity
template = TokenManager2._tokenInfos[tokenAddress].template;
```

Then check:

```solidity
if (template & 0x10000 > 0) {
    // The token is exclusive
}
```

If the condition above is true, the token is an **exclusive token**.

---

### Interface Reference

```solidity
interface ITokenManager2 {
    struct TokenInfo {
        address base;
        address quote;
        uint256 template;
        uint256 totalSupply;
        uint256 maxOffers;
        uint256 maxRaising;
        uint256 launchTime;
        uint256 offers;
        uint256 funds;
        uint256 lastPrice;
        uint256 k;
        uint256 t;
        uint256 status;
    }
}
```

## How to Identify TaxToken

A **TaxToken** is a token with creator type 5, which supports advanced tax mechanisms and reward distribution.

### On-chain Method

Retrieve the creator type from the token's template:

```solidity
template = TokenManager2._tokenInfos[tokenAddress].template;
creatorType = (template >> 10) & 0x3F;
```

Then check:

```solidity
if (creatorType == 5) {
    // The token is a TaxToken
} else {
    // The token is a common Token
}
```

If `creatorType == 5`, the token is a **TaxToken**.

#### Using Samples

- TokenIdentifierSample.sol
- TokenIdentifierSample.js

### Off-chain Method

Query token info via https://four.meme/meme-api/v1/private/token/get?address=[token address] or https://four.meme/meme-api/v1/private/token/getById?id=[requestId]. `requestId` can be got from the TokenCreate event.

If the returned `data` contains a `taxInfo` object, the token is a **TaxToken**:

```json
{
  "taxInfo": {
    "feeRate": 10,
    "recipientRate": 0,
    "burnRate": 0,
    "divideRate": 0,
    "liquidityRate": 100,
    "recipientAddress": "",
    "minSharing": 0,
    "m": 0,
    "e": 0
  }
}
```

**taxInfo Parameter Definitions:**

| Parameter | Description | Notes |
|-----------|-------------|-------|
| feeRate | Trading fee rate | Fixed options: 1, 3, 5, or 10 (representing 1%, 3%, 5%, or 10%) |
| burnRate | Burn rate | Customizable rate value (e.g., 20 = 20%). Sum of burnRate, divideRate, liquidityRate, and recipientRate must equal 100 |
| divideRate | Dividend distribution rate | Customizable rate value (e.g., 30 = 30%). Sum of burnRate, divideRate, liquidityRate, and recipientRate must equal 100 |
| liquidityRate | Liquidity pool rate | Customizable rate value (e.g., 0 = 0%). Sum of burnRate, divideRate, liquidityRate, and recipientRate must equal 100 |
| recipientRate | Recipient allocation rate | Customizable rate value (e.g., 0 = 0%). Sum of burnRate, divideRate, liquidityRate, and recipientRate must equal 100 |
| recipientAddress | Recipient address | Address to receive allocated tokens (empty string if not used) |
| minSharing | Minimum sharing threshold | Minimum token amount required to participate in dividends (in ether). Must satisfy: minSharing = d × 10ⁿ (n ≥ 5, 1 ≤ d ≤ 9). Examples: 100000 (1×10⁵), 200000 (2×10⁵), 500000 (5×10⁵), 1000000 (1×10⁶), 9000000 (9×10⁶) |


## How to Identify AntiSniperFeeMode Tokens

A token with **AntiSniperFeeMode** enabled has dynamic trading fees that change over time to prevent sniper bots. This is indicated by `feeSetting > 0` in the token's `TokenInfoEx1` structure.

### On-chain Method

Retrieve the `feeSetting` value from the token's extended information:

```solidity
TokenInfoEx1 memory tix1 = TokenManager2._tokenInfoEx1s[tokenAddress];
feeSetting = tix1.feeSetting;
```

Then check:

```solidity
if (feeSetting > 0) {
    // The token has AntiSniperFeeMode enabled
}
```

If `feeSetting > 0`, the token has **AntiSniperFeeMode** enabled.

#### Using Samples

- TokenIdentifierSample.sol
- TokenIdentifierSample.js

### Off-chain Method

Query token info via https://four.meme/meme-api/v1/private/token/get?address=[token address] or https://four.meme/meme-api/v1/private/token/getById?id=[requestId]. `requestId` can be got from the TokenCreate event.

Check the `feePlan` value in the returned `data`:

- If `feePlan == true`, the token has **AntiSniperFeeMode** enabled
- If `feePlan == false`, the token does not have AntiSniperFeeMode enabled

**Example Response:**

```json
{
  "code": "0",
  "data": {
    "feePlan": true,
    ...
  }
}
```

When `feePlan` is `true`, the token uses a dynamic fee system where transaction fees automatically decrease block by block after token creation. For detailed block-by-block fee rate information, refer to the [Product Update](https://four-meme.gitbook.io/four.meme/product-update/6-product-update-25-10-30).

## How to Identify Token Created By Agent Creator

Tokens created by AI agents can be identified via both on-chain template bits and off-chain API fields. This flag only marks that the token creator is an Agent wallet and **does not imply any new special trading mode or behavior of the token itself**.

### On-chain Method

Retrieve the `template` value from the token's `TokenInfo`:

```solidity
template = TokenManager2._tokenInfos[tokenAddress].template;
bool isCreatedByAgent = (template & (1 << 85)) != 0;
```

If `isCreatedByAgent` is `true`, the token is **created by an AI agent**.  
If `isCreatedByAgent` is `false`, the token is **not created by an AI agent**.

### Off-chain Method

Query token info via `https://four.meme/meme-api/v1/private/token/get?address=[token address]` or `https://four.meme/meme-api/v1/private/token/getById?id=[requestId]`. `requestId` can be got from the `TokenCreate` event.

Check the `aiCreator` value in the returned `data`:

- If `aiCreator == true`, the token is **created by an AI agent**
- If `aiCreator == false`, the token is **not created by an AI agent**

**Example Response:**

```json
{
  "code": "0",
  "data": {
    "aiCreator": true,
    ...
  }
}
```

## How to Identify Agent Wallets

You can determine whether a wallet address is an **Agent wallet** by calling the `AgentIdentifier` contract.

### On-chain Method

**Contract Information**

- **Address on BSC**: `0x09B44A633de9F9EBF6FB9Bdd5b5629d3DD2cef13`  
- **ABI File**: `AgentIdentifier.abi`

**Interface**

```solidity
interface IAgentIdentifier {
    function isAgent(address wallet) external view returns (bool);
    function nftCount() external view returns (uint256);
    function nftAt(uint256 index) external view returns (address);
}
```

**Usage**

Call `isAgent(wallet)` on the `AgentIdentifier` contract:

```solidity
IAgentIdentifier ai = IAgentIdentifier(0x09B44A633de9F9EBF6FB9Bdd5b5629d3DD2cef13);
bool isAgent = ai.isAgent(wallet);
```

- Returns `true` if the wallet is an Agent wallet, otherwise `false`.
- Logic: `isAgent(wallet)` is `true` when the wallet holds any Agent NFT (`balanceOf(wallet) > 0`).

You can also query which Agent NFTs are configured:

- `nftCount()` returns the number of Agent NFT contracts
- `nftAt(index)` returns the Agent NFT contract address at `index`

Tokens created by wallets where `isAgent == true` will be marked as **Agent Creator** and can be identified as **Token Created By Agent Creator** using the methods described in the previous section.
