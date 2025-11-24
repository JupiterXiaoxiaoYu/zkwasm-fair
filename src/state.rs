use serde::Serialize;
use zkwasm_rest_abi::{StorageData, MERKLE_MAP};
use std::cell::RefCell;

#[derive(Serialize)]
pub struct QueryState {
    counter: u64,
    total_players: u64,
    total_topics: u64,
}

#[derive(Serialize, Clone)]
pub struct GlobalState {
    pub counter: u64,
    pub next_topic_id: u64,
    pub total_players: u64,
    pub txsize: u64,
    pub txcounter: u64,
}

impl GlobalState {
    pub fn new() -> Self {
        GlobalState {
            counter: 428678,
            next_topic_id: 28,
            total_players: 0,
            txsize: 0,
            txcounter: 0,
        }
    }

    pub fn snapshot() -> String {
        let state = GLOBAL_STATE.0.borrow();
        serde_json::to_string(&*state).unwrap()
    }

    pub fn get_state(pid: Vec<u64>) -> String {
        use crate::player::{Player, Owner};
        let pkey: [u64; 4] = [pid[0], pid[1], pid[2], pid[3]];
        let player = Player::get(&pkey);
        serde_json::to_string(&player).unwrap()
    }

    pub fn preempt() -> bool {
        let mut state = GLOBAL_STATE.0.borrow_mut();
        let counter = state.counter;
        let txsize = state.txsize;
        let withdraw_size = crate::settlement::SettlementInfo::settlement_size();
        if counter % 600 == 0 || txsize >= 40 || withdraw_size > 40 {
            state.txsize = 0;
            return true;
        } else {
            return false;
        }
    }

    pub fn flush_settlement() -> Vec<u8> {
        crate::settlement::SettlementInfo::flush_settlement()
    }

    pub fn rand_seed() -> u64 {
        0
    }

    pub fn store() {
        let mut data = vec![];
        GLOBAL_STATE.0.borrow_mut().to_data(&mut data);
        let kvpair = unsafe { &mut MERKLE_MAP };
        kvpair.set(&[0, 0, 0, 0], data.as_slice());
    }

    pub fn initialize() {
        let kvpair = unsafe { &mut MERKLE_MAP };
        let mut data = kvpair.get(&[0, 0, 0, 0]);
        if !data.is_empty() {
            let mut u64data = data.iter_mut();
            *GLOBAL_STATE.0.borrow_mut() = Self::from_data(&mut u64data);
        }
    }

    pub fn get_counter() -> u64 {
        GLOBAL_STATE.0.borrow().counter
    }
}

impl StorageData for GlobalState {
    fn from_data(u64data: &mut std::slice::IterMut<u64>) -> Self {
        let counter = *u64data.next().unwrap();
        let total_players = *u64data.next().unwrap();
        let txsize = *u64data.next().unwrap();
        let txcounter = *u64data.next().unwrap();
        let next_topic_id = *u64data.next().unwrap();

        GlobalState {
            counter,
            total_players,
            txsize,
            txcounter,
            next_topic_id,
        }
    }

    fn to_data(&self, data: &mut Vec<u64>) {
        data.push(self.counter);
        data.push(self.total_players);
        data.push(self.txsize);
        data.push(self.txcounter);
        data.push(self.next_topic_id);
    }
}

pub struct SafeState(pub RefCell<GlobalState>);
unsafe impl Sync for SafeState {}

lazy_static::lazy_static! {
    pub static ref GLOBAL_STATE: SafeState = SafeState(RefCell::new(GlobalState::new()));
}

// Transaction constants
const TICK: u64 = 0;
const INSTALL_PLAYER: u64 = 1;
const ADD_MANAGER: u64 = 4;
const REMOVE_MANAGER: u64 = 5;
const CREATE_TOPIC: u64 = 6;
const VOTE: u64 = 7;
const CLOSE_TOPIC: u64 = 9;

pub struct Transaction {
    command: crate::command::Command,
    nonce: u64,
}

impl Transaction {
    pub fn decode_error(e: u32) -> &'static str {
        crate::command::decode_error(e)
    }

    pub fn decode(params: &[u64]) -> Self {
        use crate::command::{Command, Activity};
        use crate::topic::VoteType;
        use zkwasm_rest_abi::enforce;

        let command = params[0] & 0xff;
        let nonce = params[0] >> 16;

        let command = if command == ADD_MANAGER {
            enforce(params.len() == 3, "add_manager needs 3 params");
            Command::Activity(Activity::AddManager([params[1], params[2]]))
        } else if command == REMOVE_MANAGER {
            enforce(params.len() == 3, "remove_manager needs 3 params");
            Command::Activity(Activity::RemoveManager([params[1], params[2]]))
        } else if command == CREATE_TOPIC {
            enforce(params.len() == 2, "create_topic needs 2 params");
            Command::Activity(Activity::CreateTopic(params[1]))
        } else if command == VOTE {
            // Format: [cmd, player_id[0], player_id[1], topic_id, vote_type, vote_weight]
            enforce(params.len() == 6, "vote needs 6 params: [cmd, player_id[0], player_id[1], topic_id, vote_type, vote_weight]");
            let vote_type = if params[4] == 1 { VoteType::Fair } else { VoteType::Unfair };
            Command::Activity(Activity::Vote {
                player_id: [params[1], params[2]],
                topic_id: params[3],
                vote_type,
                vote_weight: params[5],
            })
        } else if command == CLOSE_TOPIC {
            enforce(params.len() == 2, "close_topic needs 2 params");
            Command::Activity(Activity::CloseTopic(params[1]))
        } else if command == INSTALL_PLAYER {
            Command::InstallPlayer
        } else {
            unsafe { zkwasm_rust_sdk::require(command == TICK) };
            Command::Tick
        };

        Transaction { command, nonce }
    }

    pub fn create_player(&self, pkey: &[u64; 4]) -> Result<(), u32> {
        use crate::player::Player;
        use crate::error::{ERROR_PLAYER_ALREADY_EXISTS};

        let player_id = Player::pkey_to_pid(pkey);
        let player = Player::get_from_pid(&player_id);
        match player {
            Some(_) => Err(ERROR_PLAYER_ALREADY_EXISTS),
            None => {
                let player = Player::new_from_pid(player_id);
                // No initial balance - balance management removed
                player.store();
                Ok(())
            }
        }
    }

    pub fn tick(&self) {
        let mut global_state = GLOBAL_STATE.0.borrow_mut();
        global_state.counter += 1;
    }

    pub fn inc_tx_number(&self) {
        let mut global_state = GLOBAL_STATE.0.borrow_mut();
        global_state.txsize += 1;
        global_state.txcounter += 1;
    }

    pub fn process(&self, pkey: &[u64; 4], rand: &[u64; 4]) -> Vec<u64> {
        use crate::command::CommandHandler;
        use crate::config::ADMIN_PUBKEY;
        use crate::event::clear_events;
        use crate::player::Player;
        use zkwasm_rust_sdk::require;

        let pid = Player::pkey_to_pid(pkey);
        let counter = GLOBAL_STATE.0.borrow().counter;

        let e = match &self.command {
            crate::command::Command::Tick => {
                unsafe { require(*pkey == *ADMIN_PUBKEY) };
                self.tick();
                0
            },
            crate::command::Command::InstallPlayer => self.create_player(pkey)
                .map_or_else(|e| e, |_| 0),
            crate::command::Command::Activity(cmd) => {
                // Check admin permissions for admin-only commands
                match cmd {
                    crate::command::Activity::AddManager(_) |
                    crate::command::Activity::RemoveManager(_) |
                    crate::command::Activity::Vote { .. } => {
                        // These require admin (admin submits vote after signature verification)
                        unsafe { require(*pkey == *ADMIN_PUBKEY) };
                    },
                    _ => {}
                }
                // Note: CloseTopic is checked in handle_close_topic (Manager permission)
                cmd.handle(&pid, self.nonce, rand, counter)
                    .map_or_else(|e| e, |_| 0)
            },
        };

        if e == 0 {
            match self.command {
                crate::command::Command::Tick => (),
                _ => {
                    self.inc_tx_number();
                }
            }
        }
        let eventid = {
            let state = GLOBAL_STATE.0.borrow();
            (state.counter << 32) + state.txcounter
        };
        clear_events(vec![e as u64, eventid])
    }
}
