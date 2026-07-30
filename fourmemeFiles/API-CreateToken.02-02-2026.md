## API Endpoint Overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/private/user/nonce/generate` | POST | Generate nonce for login |
| `/v1/private/user/login/dex` | POST | User login to get access token |
| `/v1/private/token/upload` | POST | Upload token image |
| `/v1/private/token/create` | POST | Create token and get signature parameters |

## Complete API Flow

### 1. Get Nonce
**Endpoint**: `https://four.meme/meme-api/v1/private/user/nonce/generate`  
**Method**: POST  
**Parameters**:
```json
{
  "accountAddress": "user wallet address",
  "verifyType": "LOGIN",
  "networkCode": "BSC"
}
```
**Response**:
```json
{
  "code": "0",
  "data": "generated nonce value"
}
```

### 2. User Login
**Endpoint**: `https://four.meme/meme-api/v1/private/user/login/dex`  
**Method**: POST  
**Parameters**:
```json
{
  "region": "WEB",
  "langType": "EN",
  "loginIp": "",
  "inviteCode": "",
  "verifyInfo": {
    "address": "user wallet address",
    "networkCode": "BSC",
    "signature": "signature of 'You are sign in Meme {nonce}' signed with private key",
    "verifyType": "LOGIN"
  },
  "walletName": "MetaMask"
}
```
**Response**:
```json
{
  "code": "0",
  "data": "access_token"
}
```

### 3. Upload Token Image
**Endpoint**: `https://four.meme/meme-api/v1/private/token/upload`  
**Method**: POST  
**Headers**:
```
Content-Type: multipart/form-data
meme-web-access: {access_token}
```
**Parameters**:
- `file`: Image file data (supports jpeg, png, gif, bmp, webp formats)

**Response**:
```json
{
  "code": "0",
  "data": "uploaded image URL"
}
```

### 4. Create Token
**Endpoint**: `https://four.meme/meme-api/v1/private/token/create`  
**Method**: POST  
**Headers**:
```
meme-web-access: {access_token}
Content-Type: application/json
```

**Request Body Example**:
```json
{
  "name": "RELEASE",
  "shortName": "RELS",
  "desc": "RELEASE DESC",
  "imgUrl": "https://static.four.meme/market/...",
  "launchTime": 1740708849097,
  "label": "AI",
  "lpTradingFee": 0.0025,
  "webUrl": "https://example.com",
  "twitterUrl": "https://x.com/example",
  "telegramUrl": "https://telegram.com/example",
  "preSale": "0.1",
  "onlyMPC": false,
  "feePlan": false,
  "tokenTaxInfo": {
    "burnRate": 20,
    "divideRate": 30,
    "feeRate": 5,
    "liquidityRate": 40,
    "minSharing": 100000,
    "recipientAddress": "0x1234567890123456789012345678901234567890",
    "recipientRate": 10
  },
  "raisedToken": {
    "symbol": "BNB",
    "nativeSymbol": "BNB",
    "symbolAddress": "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
    "deployCost": "0",
    "buyFee": "0.01",
    "sellFee": "0.01",
    "minTradeFee": "0",
    "b0Amount": "8",
    "totalBAmount": "24",
    "totalAmount": "1000000000",
    "logoUrl": "https://static.four.meme/market/68b871b6-96f7-408c-b8d0-388d804b34275092658264263839640.png",
    "tradeLevel": ["0.1", "0.5", "1"],
    "status": "PUBLISH",
    "buyTokenLink": "https://pancakeswap.finance/swap",
    "reservedNumber": 10,
    "saleRate": "0.8",
    "networkCode": "BSC",
    "platform": "MEME"
  }
}
```

**Response**:
```json
{
  "code": "0",
  "data": {
    "createArg": "encoded parameters for blockchain",
    "signature": "signature for blockchain transaction"
  }
}
```

## Parameter Explanation (Distinguishing Fixed and Customizable Parameters)

### Customizable Parameters

| Parameter | Description | Example Value | Limitations |
|-----------|-------------|---------------|-------------|
| name | Token name | "RELEASE" | Customizable |
| shortName | Token symbol/ticker | "RELS" | Customizable |
| desc | Token description | "RELEASE DESC" | Customizable |
| imgUrl | Token image URL | "https://static.four.meme/market/..." | Must be uploaded to the platform |
| launchTime | Launch timestamp | 1740708849097 | Customizable |
| label | Token category | "AI" | Must be one of the platform-supported categories: Meme/AI/Defi/Games/Infra/De-Sci/Social/Depin/Charity/Others |
| lpTradingFee | Trading fee rate | 0.0025 | Fixed as 0.0025 |
| webUrl | Project website | "https://example.com" | Customizable |
| twitterUrl | Project Twitter | "https://x.com/example" | Customizable |
| telegramUrl | Project Telegram | "https://telegram.com/example" | Customizable |
| preSale | Presale amount | "0.1" | Pre-purchased BNB amount by the creator; "0" if not purchased |
| onlyMPC | X Mode Token | false | Whether to create a token in X Mode | Customizable
| feePlan | AntiSniperFeeMode | false | Anti-sniper fee mode switch for opening block high tax. Set to true to enable dynamic fee system (fees automatically decrease block by block after token creation), false to disable. See [Product Update](https://four-meme.gitbook.io/four.meme/product-update/6-product-update-25-10-30) for detailed block-by-block fee rates | Customizable
| tokenTaxInfo | Tax Token Configuration | See below | Configuration object for creating tax-type tokens | Customizable

### Fixed Parameters (Cannot be Adjusted or Customized by Thirdparties)

| Parameter | Fixed Value | Description |
|-----------|-------------|-------------|
| totalSupply | 1000000000 | Total token supply is fixed at 1 billion |
| raisedAmount | 24 | Raised amount is fixed at 24 BNB |
| saleRate | 0.8 | Sale ratio is fixed at 80% |
| reserveRate | 0 | Reserved ratio is fixed at 0 |
| funGroup | false | Fixed parameter |
| clickFun | false | Fixed parameter |
| symbol | "BNB" | Fixed use of BNB as base currency |

### feePlan Parameter Details

The `feePlan` parameter enables **AntiSniperFeeMode** (also known as **X Mode Dynamic Fee System**), which implements a dynamic fee mechanism that automatically decreases transaction fees block by block after token creation.

**How it works:**
- When `feePlan` is set to `true`, the token will use a dynamic fee system
- Transaction fees start at a higher rate at the opening blocks
- Fees automatically decrease block by block after token creation
- This mechanism ensures fair launches and helps counter sniper bots

**Block-by-block fee rates:**
For detailed information about the specific fee rates applied at different block intervals, please refer to the [Product Update documentation](https://four-meme.gitbook.io/four.meme/product-update/6-product-update-25-10-30).

**Note:** The fee rate parameters may be adjusted for future launches.

### tokenTaxInfo Parameter Details

The `tokenTaxInfo` parameter is an object used to configure tax-type tokens. Rate values represent percentages directly (e.g., 5 = 5%, 10 = 10%).

| Parameter | Description | Example Value | Notes |
|-----------|-------------|---------------|-------|
| feeRate | Trading fee rate | 5 | Fixed options: 1, 3, 5, or 10 (representing 1%, 3%, 5%, or 10%) |
| burnRate | Burn rate | 20 | Customizable rate value (20 = 20%) |
| divideRate | Dividend distribution rate | 30 | Customizable rate value (30 = 30%) |
| liquidityRate | Liquidity pool rate | 0 | Customizable rate value (0 = 0%) |
| minSharing | Minimum sharing threshold | 100000 | Minimum token amount required to participate in dividends (in ether). Must satisfy: minSharing = d × 10ⁿ (n ≥ 5, 1 ≤ d ≤ 9). Examples: 100000 (1×10⁵), 200000 (2×10⁵), 500000 (5×10⁵), 1000000 (1×10⁶), 9000000 (9×10⁶) |
| recipientAddress | Recipient address | "0x..." | Address to receive allocated tokens (can be empty string if not used) |
| recipientRate | Recipient allocation rate | 50 | Customizable rate value (50 = 50%) |

**Example tokenTaxInfo object:**

```json
{
  "tokenTaxInfo": {
    "burnRate": 20,
    "divideRate": 30,
    "feeRate": 5,
    "liquidityRate": 40,
    "minSharing": 100000,
    "recipientAddress": "0x1234567890123456789012345678901234567890",
    "recipientRate": 10
  }
}
```

**Note:** In this example, `burnRate` (20) + `divideRate` (30) + `liquidityRate` (40) + `recipientRate` (10) = 100, which satisfies the requirement that the sum of burnRate, divideRate, liquidityRate, and recipientRate must equal 100.

**Notes:**
- `feeRate` is a fixed option: must be one of 1, 3, 5, or 10 (representing 1%, 3%, 5%, or 10%)
- Other rate values (`burnRate`, `divideRate`, `liquidityRate`, `recipientRate`) are customizable and represent percentages directly (e.g., 5 = 5%, 10 = 10%)
- The sum of `burnRate`, `divideRate`, `liquidityRate`, and `recipientRate` must equal 100
- If `recipientAddress` is not used, set it to empty string `""` and `recipientRate` to 0
- `minSharing` is specified in ether, must satisfy: minSharing = d × 10ⁿ (n ≥ 5, 1 ≤ d ≤ 9). Examples: 100000 (1×10⁵), 200000 (2×10⁵), 500000 (5×10⁵), 1000000 (1×10⁶), 9000000 (9×10⁶), 10000000 (1×10⁷)

### Fixed Parameters for raisedToken. Different raised token configs can be queried by https://four.meme/meme-api/v1/public/config (Cannot modify internal params)

```json
"raisedToken": {
  "symbol": "BNB",
  "nativeSymbol": "BNB",
  "symbolAddress": "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
  "deployCost": "0",
  "buyFee": "0.01",
  "sellFee": "0.01",
  "minTradeFee": "0",
  "b0Amount": "8",
  "totalBAmount": "24",
  "totalAmount": "1000000000",
  "logoUrl": "https://static.four.meme/market/68b871b6-96f7-408c-b8d0-388d804b34275092658264263839640.png",
  "tradeLevel": ["0.1", "0.5", "1"],
  "status": "PUBLISH",
  "buyTokenLink": "https://pancakeswap.finance/swap",
  "reservedNumber": 10,
  "saleRate": "0.8",
  "networkCode": "BSC",
  "platform": "MEME"
}
```

## Blockchain Interaction

After obtaining the API signature, you need to call the chain contract `TokenManager2`'s `createToken` method:

```java
TokenManager2 contract = TokenManager2.load(tokenManagerAddress, web3j, credentials, gasProvider);
TransactionReceipt receipt = contract.createToken(createArg, sign).send();
```

Where:
- `createArg`: The `createArg` returned by the API converted into byte array
- `sign`: The `signature` returned by the API converted into byte array

## Notes

1. Token creation requires meeting the minimum BNB balance requirement. The latest creation fee is 0.01 BNB.
2. Images must be uploaded to the four.meme platform.
3. There are certain creation fees for creating tokens (which are currently free).
4. Most technical parameters are fixed and cannot be adjusted (including total supply, raised amount, sale ratio, etc.).
5. Only display information like token name, symbol, description, and image can be customized.
6. The token label must be one of the platform-supported categories.
7. The trading fee rate can only be 0.0025.
8. **feePlan**: Set to `true` to enable AntiSniperFeeMode (dynamic fee adjustment with high tax at opening blocks), or `false` to disable. When enabled, transaction fees automatically decrease block by block after token creation to ensure fair launches and counter bots. For detailed block-by-block fee rate information, refer to the [Product Update](https://four-meme.gitbook.io/four.meme/product-update/6-product-update-25-10-30).
9. **tokenTaxInfo**: When creating a tax-type token:
   - `feeRate` must be one of the fixed options: 1, 3, 5, or 10 (representing 1%, 3%, 5%, or 10%)
   - Other rate values (`burnRate`, `divideRate`, `liquidityRate`, `recipientRate`) represent percentages directly (e.g., 5 = 5%, 10 = 10%)
   - The sum of `burnRate`, `divideRate`, `liquidityRate`, and `recipientRate` must equal 100 

With the above API flow, users can complete the entire process of logging in and creating tokens on the four.meme platform, but they should note that most technical parameters are preset and fixed by the platform.