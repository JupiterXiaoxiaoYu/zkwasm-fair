use zkwasm_rest_abi::StorageData;
use crate::topic::{TopicData, VoteType};

/// External Events that are handled by external handler
pub static mut EVENTS: Vec<u64> = vec![];

pub fn clear_events(a: Vec<u64>) -> Vec<u64> {
    let mut c = a;
    unsafe {
        c.append(&mut EVENTS);
    }
    return c;
}

pub fn insert_event(typ: u64, data: &mut Vec<u64>) {
    unsafe {
        EVENTS.push((typ << 32) + data.len() as u64);
        EVENTS.append(data);
    }
}

// Event type constants for voting application
pub const EVENT_INDEXED_OBJECT: u64 = 0;
pub const EVENT_VOTE: u64 = 1;
pub const EVENT_TOPIC_CLOSED: u64 = 3;
// EVENT_UNSTAKE (2) removed - votes are permanent

// Object info constants for IndexedObject
pub const TOPIC_INFO: u64 = 1;

// Helper function to emit IndexedObject events for topic data
pub fn emit_topic_indexed_object(topic: &TopicData, topic_id: u64) {
    let mut data = Vec::new();
    data.push(TOPIC_INFO);
    data.push(topic_id);
    topic.to_data(&mut data);
    insert_event(EVENT_INDEXED_OBJECT, &mut data);
}

// Helper function to emit vote events (using player_id)
pub fn emit_vote_event(
    player_id: &[u64; 2],
    topic_id: u64,
    vote_type: VoteType,
    vote_weight: u64,
    counter: u64,
) {
    let mut data = vec![
        player_id[0],
        player_id[1],
        topic_id,
        vote_type as u64,
        vote_weight,
        counter,
    ];
    insert_event(EVENT_VOTE, &mut data);
}

// emit_unstake_event removed - no unstaking in new model

// Helper function to emit topic closed events (manual or automatic)
pub fn emit_topic_closed_event(
    topic_id: u64,
    counter: u64,
) {
    let mut data = vec![
        topic_id,
        counter,
    ];
    insert_event(EVENT_TOPIC_CLOSED, &mut data);
}
