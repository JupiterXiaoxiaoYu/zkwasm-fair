use serde::Serialize;
use zkwasm_rest_abi::{StorageData, MERKLE_MAP};
use crate::error::*;
use crate::math_safe::{safe_add, safe_sub};

#[derive(Serialize, Clone, Debug)]
pub struct TopicData {
    pub id: u64,
    pub start_time: u64,
    pub end_time: u64,
    pub is_active: bool,

    // 加权统计（权重总和）
    pub total_fair_votes: u64,
    pub total_unfair_votes: u64,

    // 人数统计（投票人数）
    pub total_fair_voters: u64,
    pub total_unfair_voters: u64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum VoteType {
    Fair = 1,
    Unfair = 0,
}

impl TopicData {
    pub fn new(id: u64, start_time: u64, duration: u64) -> Result<Self, u32> {
        if duration == 0 {
            return Err(ERROR_INVALID_TOPIC_TIME);
        }

        let end_time = safe_add(start_time, duration)?;

        Ok(TopicData {
            id,
            start_time,
            end_time,
            is_active: true,
            total_fair_votes: 0,
            total_unfair_votes: 0,
            total_fair_voters: 0,
            total_unfair_voters: 0,
        })
    }

    /// 懒加载检查并自动标记过期
    /// 返回: (是否过期, 是否更新了存储状态)
    pub fn check_and_mark_expired(&mut self, current_time: u64) -> (bool, bool) {
        if !self.is_active {
            return (true, false);
        }

        if current_time >= self.end_time {
            self.is_active = false;
            return (true, true);
        }

        (false, false)
    }

    /// 快速检查是否可以投票（不修改状态）
    pub fn can_vote(&self, current_time: u64) -> bool {
        if !self.is_active {
            return false;
        }

        if current_time < self.start_time {
            return false;
        }

        current_time < self.end_time
    }

    /// 添加投票（更新加权数和人数）
    pub fn add_vote(
        &mut self,
        vote_type: VoteType,
        weight: u64,
        is_new_type_voter: bool,
    ) -> Result<(), u32> {
        match vote_type {
            VoteType::Fair => {
                self.total_fair_votes = safe_add(self.total_fair_votes, weight)?;
                if is_new_type_voter {
                    self.total_fair_voters = safe_add(self.total_fair_voters, 1)?;
                }
            },
            VoteType::Unfair => {
                self.total_unfair_votes = safe_add(self.total_unfair_votes, weight)?;
                if is_new_type_voter {
                    self.total_unfair_voters = safe_add(self.total_unfair_voters, 1)?;
                }
            },
        }

        Ok(())
    }

    /// 移除投票（仅用于活跃Topic）
    pub fn remove_vote(
        &mut self,
        vote_type: VoteType,
        weight: u64,
        type_cleared: bool,
    ) -> Result<(), u32> {
        match vote_type {
            VoteType::Fair => {
                self.total_fair_votes = safe_sub(self.total_fair_votes, weight)?;
                if type_cleared {
                    self.total_fair_voters = safe_sub(self.total_fair_voters, 1)?;
                }
            },
            VoteType::Unfair => {
                self.total_unfair_votes = safe_sub(self.total_unfair_votes, weight)?;
                if type_cleared {
                    self.total_unfair_voters = safe_sub(self.total_unfair_voters, 1)?;
                }
            },
        }

        Ok(())
    }

    /// 手动关闭Topic
    pub fn close(&mut self) {
        self.is_active = false;
    }
}

impl StorageData for TopicData {
    fn from_data(u64data: &mut std::slice::IterMut<u64>) -> Self {
        TopicData {
            id: *u64data.next().unwrap(),
            start_time: *u64data.next().unwrap(),
            end_time: *u64data.next().unwrap(),
            is_active: *u64data.next().unwrap() != 0,
            total_fair_votes: *u64data.next().unwrap(),
            total_unfair_votes: *u64data.next().unwrap(),
            total_fair_voters: *u64data.next().unwrap(),
            total_unfair_voters: *u64data.next().unwrap(),
        }
    }

    fn to_data(&self, data: &mut Vec<u64>) {
        data.push(self.id);
        data.push(self.start_time);
        data.push(self.end_time);
        data.push(if self.is_active { 1 } else { 0 });
        data.push(self.total_fair_votes);
        data.push(self.total_unfair_votes);
        data.push(self.total_fair_voters);
        data.push(self.total_unfair_voters);
    }
}

// Topic管理器，使用索引存储
pub struct TopicManager;

impl TopicManager {
    const TOPIC_PREFIX: [u64; 2] = [1, 0]; // Topic存储键前缀

    pub fn store_topic(topic_id: u64, topic: &TopicData) {
        let mut data = vec![];
        topic.to_data(&mut data);
        let kvpair = unsafe { &mut MERKLE_MAP };
        let key = [Self::TOPIC_PREFIX[0], Self::TOPIC_PREFIX[1], topic_id, 0];
        kvpair.set(&key, data.as_slice());
    }

    pub fn get_topic(topic_id: u64) -> Option<TopicData> {
        let kvpair = unsafe { &mut MERKLE_MAP };
        let key = [Self::TOPIC_PREFIX[0], Self::TOPIC_PREFIX[1], topic_id, 0];
        let mut data = kvpair.get(&key);
        if !data.is_empty() {
            let mut u64data = data.iter_mut();
            Some(TopicData::from_data(&mut u64data))
        } else {
            None
        }
    }

    pub fn update_topic(topic_id: u64, topic: &TopicData) {
        Self::store_topic(topic_id, topic);
    }
}

// PlayerTopicVote: 用户在某个Topic中的投票数据
#[derive(Serialize, Clone, Debug, Default)]
pub struct PlayerTopicVote {
    pub staked_amount: u64,
    pub fair_weight: u64,
    pub unfair_weight: u64,
    pub first_vote_time: u64,
    pub last_vote_time: u64,
    pub last_fair_vote_time: u64,
    pub last_unfair_vote_time: u64,
}

impl PlayerTopicVote {
    pub fn get_total_weight(&self) -> u64 {
        self.fair_weight + self.unfair_weight
    }

    pub fn has_voted(&self) -> bool {
        self.get_total_weight() > 0
    }

    pub fn has_fair_vote(&self) -> bool {
        self.fair_weight > 0
    }

    pub fn has_unfair_vote(&self) -> bool {
        self.unfair_weight > 0
    }

    /// Stake到此Topic
    pub fn stake(&mut self, amount: u64) -> Result<(), u32> {
        self.staked_amount = safe_add(self.staked_amount, amount)?;
        Ok(())
    }

    /// 从此Topic Unstake
    pub fn unstake(&mut self, amount: u64) -> Result<(), u32> {
        if self.staked_amount < amount {
            return Err(ERROR_INSUFFICIENT_STAKE);
        }
        self.staked_amount = safe_sub(self.staked_amount, amount)?;
        Ok(())
    }
}

impl StorageData for PlayerTopicVote {
    fn from_data(u64data: &mut std::slice::IterMut<u64>) -> Self {
        PlayerTopicVote {
            staked_amount: *u64data.next().unwrap(),
            fair_weight: *u64data.next().unwrap(),
            unfair_weight: *u64data.next().unwrap(),
            first_vote_time: *u64data.next().unwrap(),
            last_vote_time: *u64data.next().unwrap(),
            last_fair_vote_time: *u64data.next().unwrap(),
            last_unfair_vote_time: *u64data.next().unwrap(),
        }
    }

    fn to_data(&self, data: &mut Vec<u64>) {
        data.push(self.staked_amount);
        data.push(self.fair_weight);
        data.push(self.unfair_weight);
        data.push(self.first_vote_time);
        data.push(self.last_vote_time);
        data.push(self.last_fair_vote_time);
        data.push(self.last_unfair_vote_time);
    }
}

// PlayerVoteManager: 管理用户在各个Topic中的投票
pub struct PlayerVoteManager;

impl PlayerVoteManager {
    const VOTE_PREFIX: [u64; 2] = [2, 0]; // 投票存储键前缀

    fn combine_player_id_safe(player_id: &[u64; 2]) -> u64 {
        let high = (player_id[0] & 0xFFFFFFFF) << 32;
        let low = player_id[1] & 0xFFFFFFFF;
        high | low
    }

    pub fn get_vote(player_id: &[u64; 2], topic_id: u64) -> PlayerTopicVote {
        let kvpair = unsafe { &mut MERKLE_MAP };
        let combined_player_id = Self::combine_player_id_safe(player_id);
        let key = [Self::VOTE_PREFIX[0], Self::VOTE_PREFIX[1], combined_player_id, topic_id];
        let mut data = kvpair.get(&key);
        if !data.is_empty() {
            let mut u64data = data.iter_mut();
            PlayerTopicVote::from_data(&mut u64data)
        } else {
            PlayerTopicVote::default()
        }
    }

    pub fn store_vote(player_id: &[u64; 2], topic_id: u64, vote: &PlayerTopicVote) {
        let mut data = vec![];
        vote.to_data(&mut data);
        let kvpair = unsafe { &mut MERKLE_MAP };
        let combined_player_id = Self::combine_player_id_safe(player_id);
        let key = [Self::VOTE_PREFIX[0], Self::VOTE_PREFIX[1], combined_player_id, topic_id];
        kvpair.set(&key, data.as_slice());
    }
}
