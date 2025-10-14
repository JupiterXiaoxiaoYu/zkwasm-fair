use zkwasm_rest_abi::MERKLE_MAP;

// Manager管理系统
pub struct ManagerRegistry;

impl ManagerRegistry {
    const MANAGER_PREFIX: [u64; 2] = [3, 0]; // Manager存储键前缀

    fn combine_player_id_safe(player_id: &[u64; 2]) -> u64 {
        let high = (player_id[0] & 0xFFFFFFFF) << 32;
        let low = player_id[1] & 0xFFFFFFFF;
        high | low
    }

    pub fn is_manager(player_id: &[u64; 2]) -> bool {
        let kvpair = unsafe { &mut MERKLE_MAP };
        let combined_player_id = Self::combine_player_id_safe(player_id);
        let key = [Self::MANAGER_PREFIX[0], Self::MANAGER_PREFIX[1], combined_player_id, 0];
        let data = kvpair.get(&key);
        !data.is_empty() && data[0] == 1
    }

    pub fn add_manager(player_id: &[u64; 2]) {
        let kvpair = unsafe { &mut MERKLE_MAP };
        let combined_player_id = Self::combine_player_id_safe(player_id);
        let key = [Self::MANAGER_PREFIX[0], Self::MANAGER_PREFIX[1], combined_player_id, 0];
        kvpair.set(&key, &[1]);
    }

    pub fn remove_manager(player_id: &[u64; 2]) {
        let kvpair = unsafe { &mut MERKLE_MAP };
        let combined_player_id = Self::combine_player_id_safe(player_id);
        let key = [Self::MANAGER_PREFIX[0], Self::MANAGER_PREFIX[1], combined_player_id, 0];
        kvpair.set(&key, &[0]);
    }
}
