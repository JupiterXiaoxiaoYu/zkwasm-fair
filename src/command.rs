use crate::player::Player;
use crate::error::*;
use crate::math_safe::{safe_add, safe_sub};
use crate::topic::{TopicData, TopicManager, PlayerVoteManager, VoteType};
use crate::manager::ManagerRegistry;
use crate::settlement::SettlementInfo;
use crate::state::GLOBAL_STATE;
use crate::event::{emit_topic_indexed_object, emit_vote_event, emit_unstake_event, emit_topic_closed_event};

#[derive(Clone)]
pub struct Withdraw {
    pub data: [u64; 3], // [target_addr_high, target_addr_mid, amount]
}

#[derive(Clone)]
pub struct Deposit {
    pub data: [u64; 3], // [target_player_id_0, target_player_id_1, amount]
}

#[derive(Clone)]
pub enum Activity {
    AddManager([u64; 2]),
    RemoveManager([u64; 2]),
    CreateTopic(u64),                 // duration
    CloseTopic(u64),                  // topic_id
    Vote(u64, VoteType, u64),         // topic_id, vote_type, stake_amount
    Unstake(u64, u64),                // topic_id, amount
}

#[derive(Clone)]
pub enum Command {
    Tick,
    InstallPlayer,
    Withdraw(Withdraw),
    Deposit(Deposit),
    Activity(Activity),
}

pub trait CommandHandler {
    fn handle(&self, pid: &[u64; 2], nonce: u64, rand: &[u64; 4], counter: u64) -> Result<(), u32>;
}

impl CommandHandler for Withdraw {
    fn handle(&self, pid: &[u64; 2], nonce: u64, _rand: &[u64; 4], _counter: u64) -> Result<(), u32> {
        let mut player = Player::get_from_pid(pid).ok_or(ERROR_PLAYER_NOT_EXIST)?;

        player.check_and_inc_nonce(nonce);

        let amount = self.data[0] & 0xffffffff;

        // Deduct from balance
        player.data.spend_balance(amount)?;

        // Add to settlement queue (token_index = 0 for native token)
        let withdrawinfo = zkwasm_rest_abi::WithdrawInfo::new(&[self.data[0], self.data[1], self.data[2]], 0);
        SettlementInfo::append_settlement(withdrawinfo);

        player.store();

        Ok(())
    }
}

impl CommandHandler for Deposit {
    fn handle(&self, pid: &[u64; 2], nonce: u64, _rand: &[u64; 4], _counter: u64) -> Result<(), u32> {
        // Get admin player and verify nonce
        let mut admin = Player::get_from_pid(pid).ok_or(ERROR_PLAYER_NOT_EXIST)?;
        admin.check_and_inc_nonce(nonce);

        // Get target player
        let target_player_id = [self.data[0], self.data[1]];
        let mut player = Player::get_from_pid(&target_player_id).ok_or(ERROR_PLAYER_NOT_EXIST)?;

        // Add balance to target player
        let amount = self.data[2];
        player.data.add_balance(amount)?;

        // Store both players
        player.store();
        admin.store();

        Ok(())
    }
}

impl CommandHandler for Activity {
    fn handle(&self, pid: &[u64; 2], nonce: u64, _rand: &[u64; 4], counter: u64) -> Result<(), u32> {
        let mut player = Player::get_from_pid(pid).ok_or(ERROR_PLAYER_NOT_EXIST)?;

        player.check_and_inc_nonce(nonce);

        match self {
            Activity::AddManager(target_pid) => {
                ManagerRegistry::add_manager(target_pid);
            },
            Activity::RemoveManager(target_pid) => {
                ManagerRegistry::remove_manager(target_pid);
            },
            Activity::CreateTopic(duration) => {
                handle_create_topic(&mut player, *duration, counter)?;
            },
            Activity::CloseTopic(topic_id) => {
                handle_close_topic(pid, *topic_id, counter)?;
            },
            Activity::Vote(topic_id, vote_type, stake_amount) => {
                handle_vote(&mut player, *topic_id, *vote_type, *stake_amount, counter)?;
            },
            Activity::Unstake(topic_id, amount) => {
                handle_unstake(&mut player, *topic_id, *amount, counter)?;
            },
        }

        player.store();

        Ok(())
    }
}

fn handle_create_topic(
    player: &mut Player,
    duration: u64,
    counter: u64,
) -> Result<(), u32> {
    // Check if player is manager
    if !ManagerRegistry::is_manager(&player.player_id) {
        return Err(ERROR_NOT_MANAGER);
    }

    // Validate duration
    if duration == 0 {
        return Err(ERROR_INVALID_TOPIC_TIME);
    }

    // Generate new topic ID
    let topic_id = {
        let mut global_state = GLOBAL_STATE.0.borrow_mut();
        let topic_id = global_state.next_topic_id;
        global_state.next_topic_id = safe_add(global_state.next_topic_id, 1)?;
        topic_id
    };

    // Create topic
    let topic = TopicData::new(topic_id, counter, duration)?;

    // Store topic
    TopicManager::store_topic(topic_id, &topic);

    // Emit event
    emit_topic_indexed_object(&topic, topic_id);

    Ok(())
}

fn handle_vote(
    player: &mut Player,
    topic_id: u64,
    vote_type: VoteType,
    stake_amount: u64,
    counter: u64,
) -> Result<(), u32> {
    // Get topic and check expiry
    let mut topic = TopicManager::get_topic(topic_id).ok_or(ERROR_TOPIC_NOT_FOUND)?;

    let (is_expired, was_updated) = topic.check_and_mark_expired(counter);

    if is_expired {
        if was_updated {
            TopicManager::update_topic(topic_id, &topic);
            emit_topic_closed_event(topic_id, counter);
            emit_topic_indexed_object(&topic, topic_id);
        }
        return Err(ERROR_TOPIC_NOT_ACTIVE);
    }

    // Deduct from balance
    player.data.spend_balance(stake_amount)?;

    // Get user vote state
    let mut vote = PlayerVoteManager::get_vote(&player.player_id, topic_id);

    // Check if user already voted the opposite type (prevent mixed voting)
    let has_opposite_type = match vote_type {
        VoteType::Fair => vote.has_unfair_vote(),
        VoteType::Unfair => vote.has_fair_vote(),
    };

    if has_opposite_type {
        return Err(ERROR_CANNOT_VOTE_BOTH_TYPES);
    }

    let had_this_type = match vote_type {
        VoteType::Fair => vote.has_fair_vote(),
        VoteType::Unfair => vote.has_unfair_vote(),
    };

    // Stake to this topic
    vote.stake(stake_amount)?;

    // Update vote weight
    match vote_type {
        VoteType::Fair => {
            vote.fair_weight = safe_add(vote.fair_weight, stake_amount)?;
            if vote.last_fair_vote_time == 0 {
                vote.last_fair_vote_time = counter;
            }
        },
        VoteType::Unfair => {
            vote.unfair_weight = safe_add(vote.unfair_weight, stake_amount)?;
            if vote.last_unfair_vote_time == 0 {
                vote.last_unfair_vote_time = counter;
            }
        },
    }

    if vote.first_vote_time == 0 {
        vote.first_vote_time = counter;
    }
    vote.last_vote_time = counter;

    // Update topic statistics
    let is_new_type_voter = !had_this_type;
    topic.add_vote(vote_type, stake_amount, is_new_type_voter)?;

    // Store updates
    PlayerVoteManager::store_vote(&player.player_id, topic_id, &vote);
    TopicManager::update_topic(topic_id, &topic);

    // Emit event
    emit_vote_event(player.player_id, topic_id, vote_type, stake_amount, counter);
    emit_topic_indexed_object(&topic, topic_id);

    Ok(())
}

fn handle_unstake(
    player: &mut Player,
    topic_id: u64,
    amount: u64,
    counter: u64,
) -> Result<(), u32> {
    // Get user vote state for this topic
    let mut vote = PlayerVoteManager::get_vote(&player.player_id, topic_id);

    // Check stake balance
    if vote.staked_amount < amount {
        return Err(ERROR_INSUFFICIENT_STAKE);
    }

    // Get topic and check expiry
    let mut topic = TopicManager::get_topic(topic_id).ok_or(ERROR_TOPIC_NOT_FOUND)?;

    // Lazy check expiry
    let (_is_expired, was_updated) = topic.check_and_mark_expired(counter);

    if was_updated {
        emit_topic_closed_event(topic_id, counter);
    }

    // Check if topic is expired/closed
    let is_topic_expired = !topic.is_active || counter >= topic.end_time;

    // Check if user has any votes
    let total_weight = vote.get_total_weight();
    if total_weight == 0 {
        return Err(ERROR_NO_VOTES);
    }

    // Determine which vote type to remove from (user can only have one type)
    let (vote_type_to_remove, weight_to_remove) = if vote.has_fair_vote() {
        (VoteType::Fair, amount)
    } else {
        (VoteType::Unfair, amount)
    };

    // Remove vote weight from player's vote record
    match vote_type_to_remove {
        VoteType::Fair => {
            vote.fair_weight = safe_sub(vote.fair_weight, weight_to_remove)?;
        },
        VoteType::Unfair => {
            vote.unfair_weight = safe_sub(vote.unfair_weight, weight_to_remove)?;
        },
    }

    // Only update topic statistics if topic is still active
    if !is_topic_expired {
        // Check if this unstake clears all votes of this type
        let type_cleared = match vote_type_to_remove {
            VoteType::Fair => vote.fair_weight == 0,
            VoteType::Unfair => vote.unfair_weight == 0,
        };

        topic.remove_vote(vote_type_to_remove, weight_to_remove, type_cleared)?;
    }

    // Unstake from topic
    vote.unstake(amount)?;

    // Return to balance
    player.data.add_balance(amount)?;

    // Store updates
    PlayerVoteManager::store_vote(&player.player_id, topic_id, &vote);

    // Only update topic if it's still active (to preserve historical data)
    if !is_topic_expired {
        TopicManager::update_topic(topic_id, &topic);
    }

    // Emit event
    emit_unstake_event(player.player_id, topic_id, amount, counter);
    emit_topic_indexed_object(&topic, topic_id);

    Ok(())
}

fn handle_close_topic(
    player_id: &[u64; 2],
    topic_id: u64,
    counter: u64,
) -> Result<(), u32> {
    // Check if player is manager
    if !ManagerRegistry::is_manager(player_id) {
        return Err(ERROR_NOT_MANAGER);
    }

    // Get topic
    let mut topic = TopicManager::get_topic(topic_id).ok_or(ERROR_TOPIC_NOT_FOUND)?;

    // Check if already closed
    if !topic.is_active {
        return Err(ERROR_TOPIC_ALREADY_CLOSED);
    }

    // Close topic
    topic.close();

    // Store update
    TopicManager::update_topic(topic_id, &topic);

    // Emit event
    emit_topic_closed_event(topic_id, counter);
    emit_topic_indexed_object(&topic, topic_id);

    Ok(())
}

pub fn decode_error(e: u32) -> &'static str {
    match e {
        ERROR_INSUFFICIENT_BALANCE => "InsufficientBalance",
        ERROR_INSUFFICIENT_STAKE => "InsufficientStake",
        ERROR_TOPIC_NOT_FOUND => "TopicNotFound",
        ERROR_TOPIC_NOT_ACTIVE => "TopicNotActive",
        ERROR_TOPIC_ALREADY_CLOSED => "TopicAlreadyClosed",
        ERROR_TOPIC_EXPIRED => "TopicExpired",
        ERROR_INVALID_TOPIC_TIME => "InvalidTopicTime",
        ERROR_NOT_MANAGER => "NotManager",
        ERROR_UNAUTHORIZED => "Unauthorized",
        ERROR_NO_VOTES => "NoVotes",
        ERROR_CANNOT_VOTE_BOTH_TYPES => "CannotVoteBothTypes",
        ERROR_PLAYER_NOT_EXIST => "PlayerNotExist",
        ERROR_PLAYER_ALREADY_EXISTS => "PlayerAlreadyExists",
        ERROR_OVERFLOW => "Overflow",
        ERROR_UNDERFLOW => "Underflow",
        _ => "Unknown",
    }
}
