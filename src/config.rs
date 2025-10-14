use serde::Serialize;

lazy_static::lazy_static! {
    pub static ref ADMIN_PUBKEY: [u64; 4] = {
        let bytes = include_bytes!("./admin.pubkey");
        let u64s = unsafe { std::slice::from_raw_parts(bytes.as_ptr() as *const u64, 4) };
        u64s.try_into().unwrap()
    };
}

#[derive(Serialize, Clone)]
pub struct Config {
    actions: [&'static str; 6],
    name: [&'static str; 1],
}

lazy_static::lazy_static! {
    pub static ref CONFIG: Config = Config {
        actions: ["create_topic", "vote", "unstake", "close_topic", "add_manager", "remove_manager"],
        name: ["voting_app"],
    };
}

impl Config {
    pub fn to_json_string() -> String {
        serde_json::to_string(&CONFIG.clone()).unwrap()
    }

    // enable timer tick
    pub fn autotick() -> bool {
        true
    }
}

// New player initial balance
pub const NEW_PLAYER_INITIAL_BALANCE: u64 = 0;

// Time conversion helpers (5 seconds per tick)
pub const SECONDS_PER_TICK: u64 = 5;
pub const TICKS_PER_MINUTE: u64 = 12;
pub const TICKS_PER_HOUR: u64 = 720;
pub const TICKS_PER_DAY: u64 = 17280;
pub const TICKS_PER_WEEK: u64 = 120960; // 7 days × 17280 ticks/day
pub const TICKS_PER_MONTH: u64 = 518400; // 30 days × 17280 ticks/day

/// Convert seconds to ticks
pub fn seconds_to_ticks(seconds: u64) -> u64 {
    seconds / SECONDS_PER_TICK
}

/// Convert ticks to seconds
pub fn ticks_to_seconds(ticks: u64) -> u64 {
    ticks * SECONDS_PER_TICK
}
