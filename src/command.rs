use crate::player::Player;
use crate::error::*;
use crate::math_safe::safe_add;
use crate::topic::{TopicData, TopicManager, PlayerVoteManager, VoteType};
use crate::manager::ManagerRegistry;
use crate::state::GLOBAL_STATE;
use crate::event::{emit_topic_indexed_object, emit_vote_event, emit_topic_closed_event};

#[derive(Clone)]
pub enum Activity {
    AddManager([u64; 2]),
    RemoveManager([u64; 2]),
    CreateTopic(u64),                 // duration
    CloseTopic(u64),                  // topic_id
    Vote {
        player_id: [u64; 2],          // Target player who is voting (from zkWasm account)
        topic_id: u64,
        vote_type: VoteType,
        vote_weight: u64,             // ERC20 balance queried by TypeScript
    },
}

#[derive(Clone)]
pub enum Command {
    Tick,
    InstallPlayer,
    Activity(Activity),
}

pub trait CommandHandler {
    fn handle(&self, pid: &[u64; 2], nonce: u64, rand: &[u64; 4], counter: u64) -> Result<(), u32>;
}

// Withdraw and Deposit commands removed - no internal balance management

impl CommandHandler for Activity {
    fn handle(&self, pid: &[u64; 2], nonce: u64, _rand: &[u64; 4], counter: u64) -> Result<(), u32> {
        match self {
            Activity::AddManager(target_pid) => {
                // Admin only - verify nonce
                let mut admin = Player::get_from_pid(pid).ok_or(ERROR_PLAYER_NOT_EXIST)?;
                admin.check_and_inc_nonce(nonce);
                ManagerRegistry::add_manager(target_pid);
                admin.store();
            },
            Activity::RemoveManager(target_pid) => {
                // Admin only - verify nonce
                let mut admin = Player::get_from_pid(pid).ok_or(ERROR_PLAYER_NOT_EXIST)?;
                admin.check_and_inc_nonce(nonce);
                ManagerRegistry::remove_manager(target_pid);
                admin.store();
            },
            Activity::CreateTopic(duration) => {
                let mut player = Player::get_from_pid(pid).ok_or(ERROR_PLAYER_NOT_EXIST)?;
                player.check_and_inc_nonce(nonce);
                handle_create_topic(&mut player, *duration, counter)?;
                player.store();
            },
            Activity::CloseTopic(topic_id) => {
                let mut player = Player::get_from_pid(pid).ok_or(ERROR_PLAYER_NOT_EXIST)?;
                player.check_and_inc_nonce(nonce);
                handle_close_topic(pid, *topic_id, counter)?;
                player.store();
            },
            Activity::Vote {
                player_id,
                topic_id,
                vote_type,
                vote_weight,
            } => {
                // Admin submits vote on behalf of user (after eth signature verification in TS layer)
                let mut admin = Player::get_from_pid(pid).ok_or(ERROR_PLAYER_NOT_EXIST)?;
                admin.check_and_inc_nonce(nonce);
                handle_vote(player_id, *topic_id, *vote_type, *vote_weight, counter)?;
                admin.store();
            },
        }

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
    player_id: &[u64; 2],
    topic_id: u64,
    vote_type: VoteType,
    vote_weight: u64,
    counter: u64,
) -> Result<(), u32> {
    // 1. Get topic and check if active
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

    // 2. Check if topic is active for voting
    if !topic.can_vote(counter) {
        return Err(ERROR_TOPIC_NOT_ACTIVE);
    }

    // 3. Check minimum vote weight
    if vote_weight == 0 {
        return Err(ERROR_INSUFFICIENT_BALANCE);
    }

    // 4. Get user's vote record by player_id
    // Each player can only vote once per topic
    let mut vote = PlayerVoteManager::get_vote(player_id, topic_id);

    // 5. Record vote (will fail if already voted)
    vote.record_vote(vote_type, vote_weight, counter)?;

    // 6. Update topic statistics (every vote increments count since users can only vote once)
    topic.add_vote(vote_type, vote_weight)?;

    // 7. Store updates
    PlayerVoteManager::store_vote(player_id, topic_id, &vote);
    TopicManager::update_topic(topic_id, &topic);

    // 8. Emit events
    emit_vote_event(player_id, topic_id, vote_type, vote_weight, counter);
    emit_topic_indexed_object(&topic, topic_id);

    Ok(())
}

// handle_unstake removed - votes are permanent once cast

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
        ERROR_TOPIC_NOT_FOUND => "TopicNotFound",
        ERROR_TOPIC_NOT_ACTIVE => "TopicNotActive",
        ERROR_TOPIC_ALREADY_CLOSED => "TopicAlreadyClosed",
        ERROR_TOPIC_EXPIRED => "TopicExpired",
        ERROR_INVALID_TOPIC_TIME => "InvalidTopicTime",
        ERROR_NOT_MANAGER => "NotManager",
        ERROR_UNAUTHORIZED => "Unauthorized",
        ERROR_ALREADY_VOTED => "AlreadyVoted",
        ERROR_INVALID_SIGNATURE => "InvalidSignature",
        ERROR_INVALID_ADDRESS => "InvalidAddress",
        ERROR_PLAYER_NOT_EXIST => "PlayerNotExist",
        ERROR_PLAYER_ALREADY_EXISTS => "PlayerAlreadyExists",
        ERROR_OVERFLOW => "Overflow",
        ERROR_UNDERFLOW => "Underflow",
        _ => "Unknown",
    }
}
