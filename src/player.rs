use serde::Serialize;
use zkwasm_rest_abi::StorageData;
use crate::error::*;
use crate::math_safe::{safe_add, safe_sub};

#[derive(Serialize, Clone, Debug, Default)]
pub struct PlayerVotingData {
    pub balance: u64,
    pub is_manager: bool,
}

impl PlayerVotingData {
    /// Add balance to player account
    pub fn add_balance(&mut self, amount: u64) -> Result<(), u32> {
        self.balance = safe_add(self.balance, amount)?;
        Ok(())
    }

    /// Deduct balance from player account
    pub fn spend_balance(&mut self, amount: u64) -> Result<(), u32> {
        if self.balance < amount {
            return Err(ERROR_INSUFFICIENT_BALANCE);
        }
        self.balance = safe_sub(self.balance, amount)?;
        Ok(())
    }
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
