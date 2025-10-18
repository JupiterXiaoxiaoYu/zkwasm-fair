// Error codes for voting application
pub const ERROR_INSUFFICIENT_BALANCE: u32 = 1001;  // Used for zero vote weight check
pub const ERROR_TOPIC_NOT_FOUND: u32 = 2001;
pub const ERROR_TOPIC_NOT_ACTIVE: u32 = 2002;
pub const ERROR_TOPIC_ALREADY_CLOSED: u32 = 2003;
pub const ERROR_TOPIC_EXPIRED: u32 = 2004;
pub const ERROR_INVALID_TOPIC_TIME: u32 = 2005;
pub const ERROR_NOT_MANAGER: u32 = 2006;
pub const ERROR_UNAUTHORIZED: u32 = 2007;
pub const ERROR_ALREADY_VOTED: u32 = 2010;         // New: User already voted on this topic
pub const ERROR_INVALID_SIGNATURE: u32 = 4001;     // New: Signature verification failed
pub const ERROR_INVALID_ADDRESS: u32 = 4002;       // New: Invalid Ethereum address
pub const ERROR_PLAYER_NOT_EXIST: u32 = 3001;
pub const ERROR_PLAYER_ALREADY_EXISTS: u32 = 3002;

// Security-related error codes
pub const ERROR_OVERFLOW: u32 = 100;
pub const ERROR_DIVISION_BY_ZERO: u32 = 101;
pub const ERROR_UNDERFLOW: u32 = 102;
pub const ERROR_INVALID_CALCULATION: u32 = 105;
