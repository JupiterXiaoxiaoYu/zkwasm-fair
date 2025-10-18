use serde::Serialize;
use zkwasm_rest_abi::StorageData;

#[derive(Serialize, Clone, Debug, Default)]
pub struct PlayerVotingData {
    pub is_manager: bool,
}

impl PlayerVotingData {
    // Balance management removed - voting now uses external ERC20 balance
}

impl StorageData for PlayerVotingData {
    fn from_data(u64data: &mut std::slice::IterMut<u64>) -> Self {
        PlayerVotingData {
            is_manager: *u64data.next().unwrap() != 0,
        }
    }

    fn to_data(&self, data: &mut Vec<u64>) {
        data.push(if self.is_manager { 1 } else { 0 });
    }
}

pub type Player = zkwasm_rest_abi::Player<PlayerVotingData>;

pub trait Owner: Sized {
    fn new(pkey: &[u64; 4]) -> Self;
    fn get(pkey: &[u64; 4]) -> Option<Self>;
}

impl Owner for Player {
    fn new(pkey: &[u64; 4]) -> Self {
        Player::new_from_pid(Player::pkey_to_pid(pkey))
    }

    fn get(pkey: &[u64; 4]) -> Option<Self> {
        Player::get_from_pid(&Player::pkey_to_pid(pkey))
    }
}
