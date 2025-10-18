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
    // Note: Balance/deposit/withdraw/stake/unstake tests removed
    // New architecture uses external ERC20 balance with single permanent vote per topic

    #[test]
    fn test_vote_weight_calculations() {
        // Test vote weight accumulation (Fair votes)
        let existing_fair_weight = 1_000_000u64;
        let new_vote_weight = 250_000u64;

        let total_fair_weight = safe_add(existing_fair_weight, new_vote_weight);
        assert!(total_fair_weight.is_ok());
        assert_eq!(total_fair_weight.unwrap(), 1_250_000);

        // Test adding more votes (new architecture: votes are permanent, no removal)
        let another_vote = 100_000u64;
        let updated_weight = safe_add(total_fair_weight.unwrap(), another_vote);
        assert!(updated_weight.is_ok());
        assert_eq!(updated_weight.unwrap(), 1_350_000);

        // Test overflow on massive vote weight accumulation
        let huge_weight = u64::MAX / 2;
        let result = safe_add(huge_weight, huge_weight);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), u64::MAX - 1);

        // Verify adding 2 more causes overflow
        let result = safe_add(huge_weight + huge_weight, 2);
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
        // Simulate multiple different users voting on a topic
        let mut total_votes = 0u64;
        let vote_amounts = vec![100_000, 250_000, 75_000, 500_000];

        for amount in vote_amounts {
            let result = safe_add(total_votes, amount);
            assert!(result.is_ok());
            total_votes = result.unwrap();
        }

        assert_eq!(total_votes, 925_000);
    }

    #[test]
    fn test_topic_statistics_updates() {
        // Test topic vote statistics updates (new architecture: add only, no removal)
        let mut total_fair_votes = 5_000_000u64;
        let mut total_fair_voters = 50u64;

        // New fair vote (each vote is permanent)
        let new_vote_weight = 100_000u64;
        total_fair_votes = safe_add(total_fair_votes, new_vote_weight).unwrap();
        total_fair_voters = safe_add(total_fair_voters, 1).unwrap();

        assert_eq!(total_fair_votes, 5_100_000);
        assert_eq!(total_fair_voters, 51);

        // Another vote from different user
        let another_vote = 250_000u64;
        total_fair_votes = safe_add(total_fair_votes, another_vote).unwrap();
        total_fair_voters = safe_add(total_fair_voters, 1).unwrap();

        assert_eq!(total_fair_votes, 5_350_000);
        assert_eq!(total_fair_voters, 52);
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
