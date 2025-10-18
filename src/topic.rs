use serde::Serialize;
use zkwasm_rest_abi::{StorageData, MERKLE_MAP};
use crate::error::*;
use crate::math_safe::safe_add;

#[derive(Serialize, Clone, Debug)]
pub struct TopicData {
    pub id: u64,
    pub start_time: u64,
    pub end_time: u64,
    pub is_active: bool,

    // Weighted statistics (sum of weights)
    pub total_fair_votes: u64,
    pub total_unfair_votes: u64,

    // Voter count statistics
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

    /// Lazy check and automatically mark as expired
    /// Returns: (is_expired, was_storage_updated)
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

    /// Quick check if voting is allowed (does not modify state)
    pub fn can_vote(&self, current_time: u64) -> bool {
        if !self.is_active {
            return false;
        }

        if current_time < self.start_time {
            return false;
        }

        current_time < self.end_time
    }

    /// Add vote (update weighted sum and voter count)
    /// In the new architecture, every vote is from a new voter since users can only vote once per topic
    pub fn add_vote(
        &mut self,
        vote_type: VoteType,
        weight: u64,
    ) -> Result<(), u32> {
        match vote_type {
            VoteType::Fair => {
                self.total_fair_votes = safe_add(self.total_fair_votes, weight)?;
                self.total_fair_voters = safe_add(self.total_fair_voters, 1)?;
            },
            VoteType::Unfair => {
                self.total_unfair_votes = safe_add(self.total_unfair_votes, weight)?;
                self.total_unfair_voters = safe_add(self.total_unfair_voters, 1)?;
            },
        }

        Ok(())
    }

    /// Manually close Topic
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

// Topic manager, using indexed storage
pub struct TopicManager;

impl TopicManager {
    const TOPIC_PREFIX: [u64; 2] = [1, 0]; // Topic storage key prefix

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

// PlayerTopicVote: User's voting data for a specific Topic
// New model: One vote per topic, weight determined by external ERC20 balance
// Note: Ethereum address is NOT stored on-chain, only verified in TypeScript layer
#[derive(Serialize, Clone, Debug, Default)]
pub struct PlayerTopicVote {
    pub vote_weight: u64,           // Snapshot of external balance at vote time
    pub vote_type: u8,              // 0 = not voted, 1 = Fair, 2 = Unfair
    pub vote_time: u64,             // Counter when voted
}

impl PlayerTopicVote {
    /// Check if user has already voted
    pub fn has_voted(&self) -> bool {
        self.vote_type != 0
    }

    /// Check if user voted Fair
    pub fn has_fair_vote(&self) -> bool {
        self.vote_type == 1
    }

    /// Check if user voted Unfair
    pub fn has_unfair_vote(&self) -> bool {
        self.vote_type == 2
    }

    /// Get vote weight (0 if not voted)
    pub fn get_vote_weight(&self) -> u64 {
        if self.has_voted() {
            self.vote_weight
        } else {
            0
        }
    }

    /// Record a vote (can only vote once)
    pub fn record_vote(
        &mut self,
        vote_type: VoteType,
        weight: u64,
        counter: u64,
    ) -> Result<(), u32> {
        if self.has_voted() {
            return Err(ERROR_ALREADY_VOTED);
        }

        self.vote_type = match vote_type {
            VoteType::Fair => 1,    // Fair = 1
            VoteType::Unfair => 0,  // Unfair = 0
        };
        self.vote_weight = weight;
        self.vote_time = counter;

        Ok(())
    }
}

impl StorageData for PlayerTopicVote {
    fn from_data(u64data: &mut std::slice::IterMut<u64>) -> Self {
        PlayerTopicVote {
            vote_weight: *u64data.next().unwrap(),
            vote_type: *u64data.next().unwrap() as u8,
            vote_time: *u64data.next().unwrap(),
        }
    }

    fn to_data(&self, data: &mut Vec<u64>) {
        data.push(self.vote_weight);
        data.push(self.vote_type as u64);
        data.push(self.vote_time);
    }
}

// PlayerVoteManager: Manages user votes across Topics
// Uses player_id to track votes per topic
pub struct PlayerVoteManager;

impl PlayerVoteManager {
    /// Get vote by player_id and topic_id
    /// Storage key format: [player_id[0], player_id[1], topic_id, 0]
    /// (Using player_id as primary key, topic_id as secondary key)
    pub fn get_vote(player_id: &[u64; 2], topic_id: u64) -> PlayerTopicVote {
        let kvpair = unsafe { &mut MERKLE_MAP };
        let key = [player_id[0], player_id[1], topic_id, 0];
        let mut data = kvpair.get(&key);
        if !data.is_empty() {
            let mut u64data = data.iter_mut();
            PlayerTopicVote::from_data(&mut u64data)
        } else {
            PlayerTopicVote::default()
        }
    }

    /// Store vote by player_id and topic_id
    pub fn store_vote(player_id: &[u64; 2], topic_id: u64, vote: &PlayerTopicVote) {
        let mut data = vec![];
        vote.to_data(&mut data);
        let kvpair = unsafe { &mut MERKLE_MAP };
        let key = [player_id[0], player_id[1], topic_id, 0];
        kvpair.set(&key, data.as_slice());
    }
}
