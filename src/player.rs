use serde::Serialize;
use zkwasm_rest_abi::StorageData;

#[derive(Serialize, Clone, Debug, Default)]
pub struct PlayerVotingData {
    pub balance: u64,
    pub is_manager: bool,
}


impl StorageData for PlayerVotingData {
    fn from_data(u64data: &mut std::slice::IterMut<u64>) -> Self {
        PlayerVotingData {
            balance: *u64data.next().unwrap(),
            is_manager: *u64data.next().unwrap() != 0,
        }
    }

    fn to_data(&self, data: &mut Vec<u64>) {
        data.push(self.balance);
        data.push(if self.is_manager { 1 } else { 0 });
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct VotingPlayer {
    pub player_id: [u64; 2],
    pub nonce: u64,
    pub data: PlayerVotingData,
}

impl VotingPlayer {
    pub fn get(pkey: &[u64; 4]) -> Option<Self> {
        let player_id = Player::pkey_to_pid(pkey);
        let player = Player::get_from_pid(&player_id);

        match player {
            Some(player) => Some(VotingPlayer {
                player_id,
                nonce: player.nonce,
                data: player.data,
            }),
            None => {
                // Return default player
                Some(VotingPlayer {
                    player_id,
                    nonce: 0,
                    data: PlayerVotingData::default(),
                })
            }
        }
    }
}

pub type Player = zkwasm_rest_abi::Player<PlayerVotingData>;
