# zkfair - Fair/Unfair Voting System

A zkWasm-based decentralized voting platform where users vote on topics using **Ethereum wallet signatures** and **ERC20 token balance** as vote weight. The system enables permanent, weighted voting on topics with "Fair" or "Unfair" choices.

## 🚀 Features

### Core Voting Functions
- **Ethereum Signature-Based Voting**: Users sign votes with MetaMask (or compatible wallets)
- **ERC20 Balance as Vote Weight**: Vote weight determined by real-time ERC20 token balance
- **No Internal Balance System**: No deposits/withdrawals required - uses external ERC20 balance
- **Single Permanent Vote**: Each user can vote once per topic (Fair OR Unfair) - votes are permanent
- **Dual Vote Types**: Vote "Fair" (1) or "Unfair" (0) on each topic
- **Multi-Topic Support**: Create and manage multiple voting topics simultaneously
- **Topic Lifecycle**: Topics have start time, end time, and can be manually closed
- **Manager System**: Role-based permissions for topic creation and management

### Advanced Features
- **External Balance Oracle**: Backend queries ERC20 balance from BSC (or other EVM chains)
- **Admin Proxy Pattern**: Backend verifies signatures and submits votes on behalf of users
- **Vote Tracking**: Track total votes, voter counts, and individual voting history
- **Time-Based Validation**: Topics can only be voted on within their active time window
- **Complete History**: Transaction logs for all vote operations
- **Statistics API**: Real-time topic statistics and platform-wide metrics
- **IndexedObject Pattern**: Efficient data storage and event system for real-time updates

### Security & Safety
- **Signature Verification**: ECDSA signature recovery prevents vote spoofing
- **Sybil Resistance**: ERC20 balance requirement prevents fake account attacks
- **Deduplication**: Rust layer enforces one-vote-per-topic rule
- **Mathematical Safety**: Comprehensive overflow/underflow protection
- **Safe Arithmetic**: All operations use checked math (safe_add, safe_sub, safe_mul, safe_div)
- **Input Validation**: Strict validation of all parameters
- **Permission Checks**: Admin/Manager-only operations for sensitive commands
- **Atomic Operations**: All state changes are atomic and consistent

## 🏗️ Technical Architecture

### Rust Backend (`src/`)
```
├── lib.rs                 # Application entry point and zkWasm API
├── config.rs              # Configuration constants and time conversion helpers
├── error.rs               # Error code definitions (20+ error types)
├── event.rs               # Event emission system (IndexedObject, Vote, TopicClosed)
├── command.rs             # Transaction command handlers (Vote, CreateTopic, etc.)
├── player.rs              # Player vote manager and deduplication logic
├── topic.rs               # Topic logic, vote tracking, and VoteType enum
├── manager.rs             # Manager registry for role-based permissions
├── math_safe.rs           # Safe mathematical operations
├── state.rs               # Global state and transaction processing
└── security_tests.rs      # Comprehensive security test suite
```

### TypeScript Service (`ts/src/`)
```
├── service.ts             # Main service with REST API endpoints + /vote
├── models.ts              # Data models and MongoDB schemas
├── signature.ts           # Ethereum signature verification (ethers.js v6)
├── balance_query.ts       # ERC20 balance oracle (queries BSC/ETH)
├── api.ts                 # Client API and transaction builders
├── test.ts                # Comprehensive integration test suite
└── test_api.ts            # API endpoint test suite
```

## 🗳️ Voting System Logic

### Vote Type Values
```typescript
VoteType::Fair = 1     // Fair vote
VoteType::Unfair = 0   // Unfair vote
voteType = null        // Not voted (API response only)
```

### Vote Weight Source
- **External ERC20 Balance**: Backend queries user's ERC20 token balance from BSC (or other EVM chain)
- **Real-Time Query**: Balance checked at vote submission time
- **Permanent Weight**: Vote weight frozen at voting time (balance changes after voting don't affect vote)
- **Cross-Topic**: Same balance can be used to vote on multiple topics

### Example Voting Flow
```typescript
// 1. User connects Ethereum wallet (MetaMask)
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const address = await signer.getAddress();

// 2. User selects vote type (Fair or Unfair)
const voteType = 'Fair';
const topicId = 1n;

// 3. Frontend creates message and requests signature
const timestamp = Math.floor(Date.now() / 1000);
const message = `Vote on zkFair topic ${topicId} with type ${voteType} at ${timestamp}`;
const signature = await signer.signMessage(message);

// 4. Frontend submits to backend
const response = await fetch('/vote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        player_id: [pid1, pid2],  // zkWasm Player ID
        topic_id: topicId.toString(),
        vote_type: voteType,
        signature: signature,
        timestamp: timestamp
    })
});

// 5. Backend verifies signature, queries ERC20 balance, submits vote
// 6. Rust layer checks deduplication and records vote
```

### Vote Rules
- **One Vote Per Topic**: Users can only vote once per topic (permanently)
- **No Vote Changing**: Cannot change from Fair to Unfair or vice versa
- **No Unstaking**: Votes are permanent and cannot be removed
- **Balance Snapshot**: Vote weight is user's ERC20 balance at voting time
- **Inactive Topics**: Cannot vote on closed or expired topics

### Voter Count Logic
- **Unique Voters**: Each user counted once per topic regardless of vote weight
- **Separate Counts**: Fair voters and Unfair voters tracked independently
- **No Overlap**: A user can only be in one voter count (Fair OR Unfair, not both)

## 🔌 API Endpoints

### Vote Submission
- `POST /vote` - Submit vote with Ethereum signature

**Request Body:**
```json
{
  "player_id": ["2420352573086048174", "5517301172192964977"],
  "topic_id": "1",
  "vote_type": "Fair",
  "signature": "0xabcd...",
  "timestamp": 1697654321
}
```

**Response:**
```json
{
  "success": true,
  "jobid": "12345",
  "eth_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb5",
  "vote_weight": "10000"
}
```

### Topic Data
- `GET /data/topics` - Get all topics with voting statistics
- `GET /data/topic/:topicId` - Get specific topic details
- `GET /data/topic/:topicId/votes` - Get recent vote events (limit 100)
- `GET /data/topic/:topicId/stats` - Get topic statistics (vote count, unique voters)

### Player Data
- `GET /data/player/:pid1/:pid2/votes` - Player's recent votes across all topics (limit 50)
- `GET /data/player/:pid1/:pid2/topic/:topicId` - Player's voting position for specific topic
- `GET /data/player/:pid1/:pid2/topics` - Player's positions across all topics

### Platform Statistics
- `GET /data/platform/stats` - Platform-wide statistics (total topics, votes, unique voters)

## 🎮 Transaction Commands

| Command ID | Command | Parameters | Permission | Description |
|------------|---------|------------|------------|-------------|
| 0 | TICK | - | Admin | Increment global counter (every 5s) |
| 1 | INSTALL_PLAYER | - | Any | Register new player |
| 2 | ADD_MANAGER | target_pid1, target_pid2 | Admin | Grant manager role to player |
| 5 | CREATE_TOPIC | duration | Manager | Create new voting topic |
| 7 | VOTE | player_id[0], player_id[1], topic_id, vote_type (0=Unfair, 1=Fair), vote_weight | Admin | Vote on topic (admin proxy for users) |
| 8 | CLOSE_TOPIC | topic_id | Manager | Manually close topic |

**Note**: The `VOTE` command is submitted by the admin (backend) on behalf of users after verifying their Ethereum signature.

## 📡 Event System

### Event Types
- **EVENT_INDEXED_OBJECT (0)**: Topic data updates (emitted on every topic change)
- **EVENT_VOTE (1)**: Vote events with player, topic, type, weight, counter
- **EVENT_TOPIC_CLOSED (3)**: Topic closed events (manual or automatic)

### IndexedObject Data
- **TOPIC_INFO (1)**: Complete topic state (id, start_time, end_time, is_active, vote statistics)

### Event Emission Strategy
- **Topic Updates**: Emitted on every vote, create, or close operation
- **Vote Events**: Emitted for tracking transaction history
- **Topic Closed**: Emitted when topic reaches end_time or manually closed

## 💻 Usage Examples

### Voting (Frontend)
```typescript
import { ethers } from 'ethers';

// Connect wallet
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

// Sign vote message
const topicId = 1n;
const voteType = 'Fair';
const timestamp = Math.floor(Date.now() / 1000);
const message = `Vote on zkFair topic ${topicId} with type ${voteType} at ${timestamp}`;
const signature = await signer.signMessage(message);

// Submit vote
const response = await fetch('http://localhost:3000/vote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        player_id: playerId,
        topic_id: topicId.toString(),
        vote_type: voteType,
        signature: signature,
        timestamp: timestamp
    })
});

const result = await response.json();
console.log('Vote Weight:', result.vote_weight);
```

### Topic Operations
```typescript
// Get all topics
const response = await fetch('http://localhost:3000/data/topics');
const { data: topics } = await response.json();
console.log(`Found ${topics.length} topics`);

// Get specific topic
const topicResponse = await fetch('http://localhost:3000/data/topic/1');
const { data: topic } = await topicResponse.json();
console.log(`Topic ${topic.topicId}:`);
console.log(`  Active: ${topic.isActive}`);
console.log(`  Fair votes: ${topic.totalFairVotes}`);
console.log(`  Unfair votes: ${topic.totalUnfairVotes}`);
console.log(`  Fair voters: ${topic.totalFairVoters}`);
console.log(`  Unfair voters: ${topic.totalUnfairVoters}`);

// Calculate vote percentages
const totalVotes = BigInt(topic.totalFairVotes) + BigInt(topic.totalUnfairVotes);
const fairPercentage = Number(BigInt(topic.totalFairVotes) * 10000n / totalVotes) / 100;
console.log(`Fair: ${fairPercentage.toFixed(2)}%`);
```

### Check User Vote Status
```typescript
// Get player's position on topic
const response = await fetch(
    `http://localhost:3000/data/player/${pid1}/${pid2}/topic/1`
);
const { data: position } = await response.json();

if (position.voteType === null) {
    console.log('User has not voted');
} else if (position.voteType === 1) {
    console.log(`User voted Fair with weight ${position.voteWeight}`);
} else if (position.voteType === 0) {
    console.log(`User voted Unfair with weight ${position.voteWeight}`);
}
```

### Manager Operations
```typescript
const manager = new VotingPlayer("manager_private_key", rpc);

// Create new topic
await manager.createTopic(
    1000n  // Duration: 1000 ticks = 5000 seconds ≈ 83 minutes
);

// Close topic manually
await manager.closeTopic(1n);

// Topic timing examples:
// - 1 minute = 12 ticks (12 × 5s = 60s)
// - 1 hour = 720 ticks (720 × 5s = 3600s)
// - 1 day = 17280 ticks (17280 × 5s = 86400s)
// - 1 week = 120960 ticks (120960 × 5s = 604800s)
```

### Admin Operations
```typescript
const admin = new VotingPlayer("admin_private_key", rpc);

// Add manager
await admin.addManager(targetPid[0], targetPid[1]);
```

## 🔧 Build and Run

### Prerequisites
- Rust (latest stable)
- Node.js 18+
- MongoDB (for data persistence)
- Redis (for BullMQ transaction queue)
- zkWasm development environment

### Build Rust Backend
```bash
# Build the zkWasm application
cargo build --release --target wasm32-unknown-unknown

# Run security tests
cargo test security_tests

# Run all tests
cargo test
```

### Setup TypeScript Service
```bash
cd ts

# Install dependencies
npm install

# Build TypeScript
npx tsc

# Start MongoDB (in another terminal)
mongod

# Start Redis (in another terminal)
redis-server

# Start the service
node src/service.js
```

### Testing
```bash
# Run comprehensive integration test
node ts/src/test.js

# Run API test suite
node ts/src/test_api.js
```

## ⚙️ Configuration

### Voting Parameters (src/config.rs)
```rust
pub const NEW_PLAYER_INITIAL_BALANCE: u64 = 0;  // Starting balance

// Time conversion helpers (5 seconds per tick)
pub const SECONDS_PER_TICK: u64 = 5;
pub const TICKS_PER_MINUTE: u64 = 12;           // 60s / 5s
pub const TICKS_PER_HOUR: u64 = 720;            // 3600s / 5s
pub const TICKS_PER_DAY: u64 = 17280;           // 86400s / 5s
pub const TICKS_PER_WEEK: u64 = 120960;         // 604800s / 5s
pub const TICKS_PER_MONTH: u64 = 518400;        // 2592000s / 5s (30 days)

pub const ADMIN_PUBKEY: [u64; 4] = [...];       // Admin public key from admin.pubkey
```

### ERC20 Configuration (ts/src/balance_query.ts)
```typescript
export const defaultERC20Config: ERC20Config = {
    rpcUrl: process.env.EVM_RPC_URL || "https://bsc-dataseed.binance.org/",
    tokenAddress: process.env.ERC20_TOKEN_ADDRESS || "0x6952c5408b9822295ba4a7e694d0c5ffdb8fe320",
    decimals: parseInt(process.env.ERC20_DECIMALS || "18")
};
```

### Environment Variables
```bash
# API service
API_BASE_URL=http://localhost:3000

# Database
MONGODB_URI=mongodb://localhost:27017/zkfair

# Redis
REDISHOST=localhost

# zkWasm RPC
ZKWASM_RPC_URL=http://localhost:3000

# Admin key
SERVER_ADMIN_KEY=your_admin_private_key

# ERC20 configuration
EVM_RPC_URL=https://bsc-dataseed.binance.org/
ERC20_TOKEN_ADDRESS=0x6952c5408b9822295ba4a7e694d0c5ffdb8fe320
ERC20_DECIMALS=18
```

## 🔒 Security Features

### Signature Verification
- **ECDSA Recovery**: Backend recovers Ethereum address from signature
- **Message Format Validation**: Strict message format prevents replay attacks
- **Timestamp Check**: Signatures expire after 5 minutes
- **Library**: Uses ethers.js v6 for secure signature verification

### ERC20 Balance Oracle
- **Real-Time Query**: Balance queried at vote submission time
- **Cannot Be Faked**: Balance verified on-chain via RPC
- **Sybil Resistance**: Zero balance = cannot vote

### Deduplication (Rust Layer)
- **HashMap Storage**: `HashMap<(PlayerId, TopicId), VoteRecord>`
- **O(1) Lookup**: Fast duplicate check
- **Permanent Storage**: Vote records never deleted
- **Enforced by Proof**: Deduplication logic verified in zkWasm proof

### Mathematical Safety
All arithmetic operations use safe math functions:
```rust
pub fn safe_add(a: u64, b: u64) -> Result<u64, u32>    // Overflow protection
pub fn safe_sub(a: u64, b: u64) -> Result<u64, u32>    // Underflow protection
pub fn safe_mul(a: u64, b: u64) -> Result<u64, u32>    // Overflow protection
pub fn safe_div(a: u64, b: u64) -> Result<u64, u32>    // Division by zero protection
```

### Error Handling
20+ specific error codes for debugging:
```rust
// Topic errors
ERROR_TOPIC_NOT_FOUND (2001)
ERROR_TOPIC_NOT_ACTIVE (2002)
ERROR_TOPIC_ALREADY_CLOSED (2003)
ERROR_INVALID_TOPIC_TIME (2005)
ERROR_NOT_MANAGER (2006)
ERROR_ALREADY_VOTED (2009)          // New: Single vote enforcement

// Player errors
ERROR_PLAYER_NOT_EXIST (3001)
ERROR_PLAYER_ALREADY_EXISTS (3002)

// Math errors
ERROR_OVERFLOW (100)
ERROR_UNDERFLOW (102)
ERROR_DIVISION_BY_ZERO (101)
```

## 📈 Data Models

### Topic Data
```typescript
interface TopicData {
    topicId: string;              // Sequential ID starting from 1
    startTime: string;            // Counter when topic becomes active
    endTime: string;              // Counter when topic expires
    isActive: boolean;            // Manual close flag
    totalFairVotes: string;       // Sum of all Fair vote weights
    totalUnfairVotes: string;     // Sum of all Unfair vote weights
    totalFairVoters: string;      // Count of unique Fair voters
    totalUnfairVoters: string;    // Count of unique Unfair voters
}
```

### Player Topic Vote (New Architecture)
```typescript
interface PlayerTopicVote {
    pid: bigint[];                // [pid1, pid2] player identifier
    topicId: bigint;
    voteWeight: bigint;           // ERC20 balance at voting time
    voteType: number;             // 1 = Fair, 0 = Unfair
    voteTime: bigint;             // Counter when voted
}
```

**API Response (Not Voted):**
```json
{
  "voteWeight": "0",
  "voteType": null,
  "voteTime": "0"
}
```

### Vote Event
```typescript
interface VoteEvent {
    pid: bigint[];
    topicId: bigint;
    voteType: number;             // 1 = Fair, 0 = Unfair
    voteWeight: bigint;           // ERC20 balance
    counter: bigint;
}
```

## 🎯 Project Status

### Current Version: v2.0
- ✅ Ethereum signature-based voting
- ✅ ERC20 balance as vote weight
- ✅ Single permanent vote per topic
- ✅ No internal balance system (no deposits/withdrawals)
- ✅ Admin proxy pattern for vote submission
- ✅ Deduplication enforcement (Rust + MongoDB)
- ✅ Manager role system
- ✅ IndexedObject event system
- ✅ Comprehensive API endpoints (10 endpoints)
- ✅ Security test suite
- ✅ Mathematical safety features
- ✅ Real-time event tracking
- ✅ MongoDB data persistence
- ✅ Complete English documentation

### Key Design Decisions (v2.0)
1. **Ethereum Signature Voting**: Users sign with MetaMask, backend verifies and submits to zkWasm
2. **External ERC20 Balance**: No internal deposits - vote weight from real-time ERC20 query
3. **Single Permanent Vote**: Each user votes once per topic, vote is permanent (no unstaking)
4. **Admin Proxy Pattern**: Backend signs zkWasm commands on behalf of users after verification
5. **Deduplication**: Rust HashMap ensures one vote per (player, topic) pair
6. **VoteType Values**: `Fair = 1`, `Unfair = 0`, `null = not voted` (API only)

### Migration from v1.0
- ❌ Removed: Deposit/Withdraw system
- ❌ Removed: Unstaking functionality
- ❌ Removed: Multiple votes per topic
- ✅ Added: Ethereum signature verification
- ✅ Added: ERC20 balance oracle
- ✅ Added: POST /vote endpoint
- ✅ Changed: Single permanent vote model

## 📊 Architecture Highlights

### Storage Key Prefixes
- `[0, 0, 0, 0]` - Global state
- `[1, 0, *, *]` - Topics (TOPIC_PREFIX)
- `[2, 0, *, *]` - Player votes (VOTE_PREFIX)
- `[3, 0, *, *]` - Managers (MANAGER_PREFIX)
- `[4, 0, *, *]` - Players (from zkwasm-rest-abi)

### Vote Flow
```
Frontend (MetaMask) → Sign message
    ↓
POST /vote → Verify signature → Query ERC20 balance
    ↓
Admin submits to zkWasm → Rust checks deduplication
    ↓
Record vote → Update topic stats → Emit events
    ↓
MongoDB stores events → Frontend queries API
```

### MongoDB Collections
- `topics` - Topic data (from IndexedObject events)
- `voteevents` - Vote transaction history
- `playertopicvotes` - Player voting positions per topic (one record per user per topic)
- `events` - Raw event data
- `commits` - Transaction commit tracking

## 🧪 Testing

The project includes comprehensive test coverage:

### Integration Tests (test.js)
- Tests Ethereum signature-based voting flow
- Creates topics and votes on them
- Tests single vote enforcement (duplicate vote prevention)
- Tests topic closure
- Queries and displays final statistics

### API Tests (test_api.js)
- Tests all 10 API endpoints
- Validates response formats
- Tests vote statistics calculations
- Tests unique voter counting

### Security Tests (security_tests.rs)
- Overflow/underflow protection in all operations
- Vote weight calculations
- Voter count increment/decrement
- Topic duration calculations
- Edge cases (zero, max values)

### Test Execution
```bash
# Rust security tests
cargo test security_tests

# TypeScript integration test
node ts/src/test.js

# API test suite
node ts/src/test_api.js
```

## 📝 License

This project is part of the zkWasm ecosystem and follows the applicable licensing terms.

## 🤝 Contributing

When contributing to this project:
1. All code must compile successfully (Rust + TypeScript)
2. All comments must be in English
3. Follow the safe math patterns for arithmetic operations
4. Add tests for new functionality
5. Update documentation for API changes

## 📚 Additional Resources

- zkWasm Documentation: https://github.com/DelphinusLab/zkWasm
- zkwasm-minirollup-rpc: https://github.com/DelphinusLab/zkwasm-minirollup-rpc
- zkwasm-ts-server: https://github.com/DelphinusLab/zkwasm-ts-server
- ethers.js v6: https://docs.ethers.org/v6/

---

**Built with ❤️ using zkWasm technology**

For detailed implementation examples and advanced usage patterns, see the test files in `ts/src/test.js`, `ts/src/test_api.js`, and `src/security_tests.rs`.

For frontend integration guide, see `FRONTEND_REQUIREMENTS.md`.
