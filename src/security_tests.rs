#[cfg(test)]
mod security_tests {
    use crate::math_safe::*;
    use crate::error::*;

    // ===== Basic Arithmetic Safety Tests =====

    #[test]
    fn test_overflow_protection() {
        // Test multiplication overflow
        let result = safe_mul(u64::MAX, 2);
        assert_eq!(result, Err(ERROR_OVERFLOW));

        let result = safe_mul(u64::MAX / 2, 3);
        assert_eq!(result, Err(ERROR_OVERFLOW));

        // Test safe multiplication
        let result = safe_mul(1000, 2000);
        assert_eq!(result, Ok(2_000_000));

        // Test addition overflow
        let result = safe_add(u64::MAX, 1);
        assert_eq!(result, Err(ERROR_OVERFLOW));

        let result = safe_add(u64::MAX - 1, 1);
        assert_eq!(result, Ok(u64::MAX));
    }

    #[test]
    fn test_division_by_zero_protection() {
        // Test division by zero
        let result = safe_div(1000, 0);
        assert_eq!(result, Err(ERROR_DIVISION_BY_ZERO));

        // Test safe division
        let result = safe_div(1000, 10);
        assert_eq!(result, Ok(100));
    }

    #[test]
    fn test_underflow_protection() {
        // Test underflow
        let result = safe_sub(5, 10);
        assert_eq!(result, Err(ERROR_UNDERFLOW));

        let result = safe_sub(0, 1);
        assert_eq!(result, Err(ERROR_UNDERFLOW));

        // Test safe subtraction
        let result = safe_sub(100, 50);
        assert_eq!(result, Ok(50));

        let result = safe_sub(1, 1);
        assert_eq!(result, Ok(0));
    }

    // ===== Voting System Specific Tests =====

    #[test]
    fn test_balance_operations_safety() {
        // Test balance operations similar to voting deposit/withdraw
        let initial_balance = 1_000_000u64;

        // Simulate deposit
        let result = safe_add(initial_balance, 500_000);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 1_500_000);

        // Simulate withdraw
        let result = safe_sub(initial_balance, 300_000);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 700_000);

        // Attempt to withdraw more than balance
        let result = safe_sub(initial_balance, 2_000_000);
        assert_eq!(result, Err(ERROR_UNDERFLOW));
    }

    #[test]
    fn test_stake_amount_safety() {
        // Test stake operations for voting
        let user_balance = 1_000_000u64;
        let stake_amount = 100_000u64;

        // User stakes tokens
        let remaining_balance = safe_sub(user_balance, stake_amount);
        assert!(remaining_balance.is_ok());
        assert_eq!(remaining_balance.unwrap(), 900_000);

        // Test staking more than balance
        let large_stake = 2_000_000u64;
        let result = safe_sub(user_balance, large_stake);
        assert_eq!(result, Err(ERROR_UNDERFLOW));

        // Test adding to existing stake
        let existing_stake = 50_000u64;
        let new_stake = safe_add(existing_stake, stake_amount);
        assert!(new_stake.is_ok());
        assert_eq!(new_stake.unwrap(), 150_000);
    }

    #[test]
    fn test_vote_weight_calculations() {
        // Test vote weight accumulation (Fair votes)
        let existing_fair_weight = 1_000_000u64;
        let new_vote_weight = 250_000u64;

        let total_fair_weight = safe_add(existing_fair_weight, new_vote_weight);
        assert!(total_fair_weight.is_ok());
        assert_eq!(total_fair_weight.unwrap(), 1_250_000);

        // Test removing vote weight
        let removed_weight = safe_sub(total_fair_weight.unwrap(), 100_000);
        assert!(removed_weight.is_ok());
        assert_eq!(removed_weight.unwrap(), 1_150_000);

        // Test overflow on massive vote weight
        let huge_weight = u64::MAX / 2;
        let result = safe_add(huge_weight, huge_weight + 1);
        assert_eq!(result, Err(ERROR_OVERFLOW));
    }

    #[test]
    fn test_voter_count_safety() {
        // Test voter count increment
        let current_voters = 1000u64;
        let new_count = safe_add(current_voters, 1);
        assert!(new_count.is_ok());
        assert_eq!(new_count.unwrap(), 1001);

        // Test voter count decrement (unstake scenario)
        let result = safe_sub(current_voters, 1);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 999);

        // Test underflow when removing voter from empty count
        let result = safe_sub(0, 1);
        assert_eq!(result, Err(ERROR_UNDERFLOW));
    }

    #[test]
    fn test_topic_duration_calculation() {
        // Test calculating topic end_time
        let start_time = 1000u64;
        let duration = 5000u64;

        let end_time = safe_add(start_time, duration);
        assert!(end_time.is_ok());
        assert_eq!(end_time.unwrap(), 6000);

        // Test overflow in duration
        let huge_duration = u64::MAX;
        let result = safe_add(start_time, huge_duration);
        assert_eq!(result, Err(ERROR_OVERFLOW));

        // Test valid long duration
        let long_duration = 1_000_000u64;
        let result = safe_add(start_time, long_duration);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 1_001_000);
    }

    #[test]
    fn test_proportional_unstake_calculation() {
        // Simulate proportional unstake calculation using u128
        let fair_weight = 600_000u64;
        let unfair_weight = 400_000u64;
        let total_weight = 1_000_000u64;
        let unstake_amount = 100_000u64;

        // Calculate proportional unfair removal
        let unfair_to_remove = (unfair_weight as u128 * unstake_amount as u128 / total_weight as u128) as u64;
        assert_eq!(unfair_to_remove, 40_000);

        let fair_to_remove = unstake_amount - unfair_to_remove;
        assert_eq!(fair_to_remove, 60_000);

        // Verify subtraction works
        let new_unfair = safe_sub(unfair_weight, unfair_to_remove);
        assert_eq!(new_unfair.unwrap(), 360_000);

        let new_fair = safe_sub(fair_weight, fair_to_remove);
        assert_eq!(new_fair.unwrap(), 540_000);
    }

    #[test]
    fn test_edge_cases_for_voting() {
        // Test edge case: single token vote
        let result = safe_add(0, 1);
        assert_eq!(result, Ok(1));

        // Test edge case: removing last token
        let result = safe_sub(1, 1);
        assert_eq!(result, Ok(0));

        // Test edge case: max value operations
        let result = safe_sub(u64::MAX, u64::MAX);
        assert_eq!(result, Ok(0));

        // Test edge case: adding to max value
        let result = safe_add(u64::MAX, 0);
        assert_eq!(result, Ok(u64::MAX));
    }

    #[test]
    fn test_multiple_votes_accumulation() {
        // Simulate multiple sequential votes
        let mut total_votes = 0u64;
        let vote_amounts = vec![100_000, 250_000, 75_000, 500_000];

        for amount in vote_amounts {
            let result = safe_add(total_votes, amount);
            assert!(result.is_ok());
            total_votes = result.unwrap();
        }

        assert_eq!(total_votes, 925_000);

        // Test partial unstake
        let unstake = 200_000u64;
        let result = safe_sub(total_votes, unstake);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 725_000);
    }

    #[test]
    fn test_realistic_voting_scenario() {
        // Simulate a realistic voting scenario

        // User starts with balance
        let mut user_balance = 10_000_000u64;

        // User stakes 1M tokens to vote Fair
        let stake1 = 1_000_000u64;
        user_balance = safe_sub(user_balance, stake1).unwrap();
        assert_eq!(user_balance, 9_000_000);

        let mut fair_weight = stake1;
        let mut unfair_weight = 0u64;

        // User stakes another 500K to vote Fair
        let stake2 = 500_000u64;
        user_balance = safe_sub(user_balance, stake2).unwrap();
        fair_weight = safe_add(fair_weight, stake2).unwrap();
        assert_eq!(user_balance, 8_500_000);
        assert_eq!(fair_weight, 1_500_000);

        // User stakes 300K to vote Unfair
        let stake3 = 300_000u64;
        user_balance = safe_sub(user_balance, stake3).unwrap();
        unfair_weight = safe_add(unfair_weight, stake3).unwrap();
        assert_eq!(user_balance, 8_200_000);
        assert_eq!(unfair_weight, 300_000);

        // Calculate total staked
        let total_staked = safe_add(fair_weight, unfair_weight).unwrap();
        assert_eq!(total_staked, 1_800_000);

        // User unstakes 900K proportionally
        let unstake_amount = 900_000u64;
        let total_weight = total_staked;

        let unfair_to_remove = (unfair_weight as u128 * unstake_amount as u128 / total_weight as u128) as u64;
        let fair_to_remove = unstake_amount - unfair_to_remove;

        unfair_weight = safe_sub(unfair_weight, unfair_to_remove).unwrap();
        fair_weight = safe_sub(fair_weight, fair_to_remove).unwrap();
        user_balance = safe_add(user_balance, unstake_amount).unwrap();

        // Verify final state
        assert_eq!(user_balance, 9_100_000);
        assert_eq!(fair_weight + unfair_weight, 900_000);
    }

    #[test]
    fn test_topic_statistics_updates() {
        // Test topic vote statistics updates
        let mut total_fair_votes = 5_000_000u64;
        let mut total_unfair_votes = 3_000_000u64;
        let mut total_fair_voters = 50u64;
        let mut total_unfair_voters = 30u64;

        // New fair vote
        let new_vote_weight = 100_000u64;
        total_fair_votes = safe_add(total_fair_votes, new_vote_weight).unwrap();
        total_fair_voters = safe_add(total_fair_voters, 1).unwrap();

        assert_eq!(total_fair_votes, 5_100_000);
        assert_eq!(total_fair_voters, 51);

        // Remove a vote (unstake from active topic)
        let remove_weight = 50_000u64;
        total_unfair_votes = safe_sub(total_unfair_votes, remove_weight).unwrap();
        total_unfair_voters = safe_sub(total_unfair_voters, 1).unwrap();

        assert_eq!(total_unfair_votes, 2_950_000);
        assert_eq!(total_unfair_voters, 29);
    }

    #[test]
    fn test_boundary_conditions() {
        // Test zero values
        assert_eq!(safe_add(0, 0), Ok(0));
        assert_eq!(safe_mul(0, 100), Ok(0));
        assert_eq!(safe_mul(100, 0), Ok(0));

        // Test division by non-zero
        assert_eq!(safe_div(0, 100), Ok(0));

        // Test max value boundaries
        let max_minus_one = u64::MAX - 1;
        assert_eq!(safe_add(max_minus_one, 1), Ok(u64::MAX));
        assert_eq!(safe_add(max_minus_one, 2), Err(ERROR_OVERFLOW));

        // Test subtraction boundaries
        assert_eq!(safe_sub(100, 100), Ok(0));
        assert_eq!(safe_sub(100, 101), Err(ERROR_UNDERFLOW));
    }
}
