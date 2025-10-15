import dotenv from 'dotenv';

dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

// Test PIDs from test.ts (using indices [1] and [2] from PkeyArray, not [0] and [1])
// Player1 key: "456789789"
const TEST_PLAYER1_PID = ["2420352573086048174", "5517301172192964977"];
// Player2 key: "987654321"
const TEST_PLAYER2_PID = ["15318808986382071384", "8474773755051222485"];
// Player3 key: "111222333"
const TEST_PLAYER3_PID = ["7677604866847015618", "17897725035033706871"];

// Test topic IDs
const TEST_TOPIC_IDS = ["1", "2", "3"];

// Helper function for API calls
async function apiCall(endpoint: string): Promise<any> {
    const url = `${API_BASE_URL}${endpoint}`;
    console.log(`\n📡 Fetching: ${endpoint}`);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`❌ Error fetching ${endpoint}:`, error);
        throw error;
    }
}

// Helper function to print JSON nicely
function printJSON(label: string, data: any) {
    console.log(`\n${label}:`);
    console.log(JSON.stringify(data, null, 2));
}

// Test 1: Get all topics
async function testGetAllTopics() {
    console.log("\n" + "=".repeat(60));
    console.log("TEST 1: GET /data/topics - Get all topics");
    console.log("=".repeat(60));

    try {
        const result = await apiCall('/data/topics');
        console.log(`✅ Success! Found ${result.data.length} topics`);

        if (result.data.length > 0) {
            console.log("\nFirst topic details:");
            const topic = result.data[0];
            console.log(`  Topic ID: ${topic.topicId}`);
            console.log(`  Start Time: ${topic.startTime}`);
            console.log(`  End Time: ${topic.endTime}`);
            console.log(`  Is Active: ${topic.isActive}`);
            console.log(`  Fair Votes: ${topic.totalFairVotes}`);
            console.log(`  Unfair Votes: ${topic.totalUnfairVotes}`);
            console.log(`  Fair Voters: ${topic.totalFairVoters}`);
            console.log(`  Unfair Voters: ${topic.totalUnfairVoters}`);
        }

        return result;
    } catch (error) {
        console.error("❌ Test failed:", error);
        return null;
    }
}

// Test 2: Get specific topic
async function testGetTopic(topicId: string) {
    console.log("\n" + "=".repeat(60));
    console.log(`TEST 2: GET /data/topic/${topicId} - Get specific topic`);
    console.log("=".repeat(60));

    try {
        const result = await apiCall(`/data/topic/${topicId}`);
        console.log(`✅ Success! Topic ${topicId} details:`);
        console.log(`  Start Time: ${result.data.startTime}`);
        console.log(`  End Time: ${result.data.endTime}`);
        console.log(`  Is Active: ${result.data.isActive}`);
        console.log(`  Fair Votes: ${result.data.totalFairVotes}`);
        console.log(`  Unfair Votes: ${result.data.totalUnfairVotes}`);
        console.log(`  Fair Voters: ${result.data.totalFairVoters}`);
        console.log(`  Unfair Voters: ${result.data.totalUnfairVoters}`);

        // Calculate percentages
        const fairVotes = BigInt(result.data.totalFairVotes);
        const unfairVotes = BigInt(result.data.totalUnfairVotes);
        const totalVotes = fairVotes + unfairVotes;

        if (totalVotes > 0n) {
            const fairPercentage = Number(fairVotes * 10000n / totalVotes) / 100;
            const unfairPercentage = 100 - fairPercentage;
            console.log(`  Fair Percentage: ${fairPercentage.toFixed(2)}%`);
            console.log(`  Unfair Percentage: ${unfairPercentage.toFixed(2)}%`);
        }

        return result;
    } catch (error) {
        console.error("❌ Test failed:", error);
        return null;
    }
}

// Test 3: Get topic votes
async function testGetTopicVotes(topicId: string) {
    console.log("\n" + "=".repeat(60));
    console.log(`TEST 3: GET /data/topic/${topicId}/votes - Get recent votes`);
    console.log("=".repeat(60));

    try {
        const result = await apiCall(`/data/topic/${topicId}/votes`);
        console.log(`✅ Success! Found ${result.data.length} vote events`);

        if (result.data.length > 0) {
            console.log("\nFirst 3 votes:");
            result.data.slice(0, 3).forEach((vote: any, index: number) => {
                console.log(`\n  Vote ${index + 1}:`);
                console.log(`    PID: [${vote.pid[0]}, ${vote.pid[1]}]`);
                console.log(`    Topic ID: ${vote.topicId}`);
                console.log(`    Vote Type: ${vote.voteType === 1 ? 'Fair' : 'Unfair'}`);
                console.log(`    Stake Amount: ${vote.stakeAmount}`);
                console.log(`    Counter: ${vote.counter}`);
                console.log(`    Transaction Type: ${vote.transactionType}`);
            });
        }

        return result;
    } catch (error) {
        console.error("❌ Test failed:", error);
        return null;
    }
}

// Test 4: Get topic unstakes
async function testGetTopicUnstakes(topicId: string) {
    console.log("\n" + "=".repeat(60));
    console.log(`TEST 4: GET /data/topic/${topicId}/unstakes - Get recent unstakes`);
    console.log("=".repeat(60));

    try {
        const result = await apiCall(`/data/topic/${topicId}/unstakes`);
        console.log(`✅ Success! Found ${result.data.length} unstake events`);

        if (result.data.length > 0) {
            console.log("\nFirst 3 unstakes:");
            result.data.slice(0, 3).forEach((unstake: any, index: number) => {
                console.log(`\n  Unstake ${index + 1}:`);
                console.log(`    PID: [${unstake.pid[0]}, ${unstake.pid[1]}]`);
                console.log(`    Topic ID: ${unstake.topicId}`);
                console.log(`    Amount: ${unstake.amount}`);
                console.log(`    Counter: ${unstake.counter}`);
                console.log(`    Transaction Type: ${unstake.transactionType}`);
            });
        }

        return result;
    } catch (error) {
        console.error("❌ Test failed:", error);
        return null;
    }
}

// Test 5: Get player votes
async function testGetPlayerVotes(pid1: string, pid2: string) {
    console.log("\n" + "=".repeat(60));
    console.log(`TEST 5: GET /data/player/${pid1}/${pid2}/votes - Get player's recent votes`);
    console.log("=".repeat(60));

    try {
        const result = await apiCall(`/data/player/${pid1}/${pid2}/votes`);
        console.log(`✅ Success! Found ${result.data.length} votes by this player`);

        if (result.data.length > 0) {
            console.log("\nPlayer's votes:");
            result.data.forEach((vote: any, index: number) => {
                console.log(`\n  Vote ${index + 1}:`);
                console.log(`    Topic ID: ${vote.topicId}`);
                console.log(`    Vote Type: ${vote.voteType === 1 ? 'Fair' : 'Unfair'}`);
                console.log(`    Stake Amount: ${vote.stakeAmount}`);
                console.log(`    Counter: ${vote.counter}`);
            });
        }

        return result;
    } catch (error) {
        console.error("❌ Test failed:", error);
        return null;
    }
}

// Test 6: Get player topic vote
async function testGetPlayerTopicVote(pid1: string, pid2: string, topicId: string) {
    console.log("\n" + "=".repeat(60));
    console.log(`TEST 6: GET /data/player/${pid1}/${pid2}/topic/${topicId} - Get player's position`);
    console.log("=".repeat(60));

    try {
        const result = await apiCall(`/data/player/${pid1}/${pid2}/topic/${topicId}`);
        console.log(`✅ Success! Player's position on Topic ${topicId}:`);
        console.log(`  Staked Amount: ${result.data.stakedAmount}`);
        console.log(`  Fair Weight: ${result.data.fairWeight}`);
        console.log(`  Unfair Weight: ${result.data.unfairWeight}`);
        console.log(`  First Vote Time: ${result.data.firstVoteTime}`);
        console.log(`  Last Vote Time: ${result.data.lastVoteTime}`);
        console.log(`  Last Fair Vote Time: ${result.data.lastFairVoteTime}`);
        console.log(`  Last Unfair Vote Time: ${result.data.lastUnfairVoteTime}`);

        // Determine vote type
        if (BigInt(result.data.fairWeight) > 0n) {
            console.log(`  → This player voted FAIR on this topic`);
        } else if (BigInt(result.data.unfairWeight) > 0n) {
            console.log(`  → This player voted UNFAIR on this topic`);
        } else {
            console.log(`  → This player has not voted on this topic`);
        }

        return result;
    } catch (error) {
        console.error("❌ Test failed:", error);
        return null;
    }
}

// Test 7: Get player all topics
async function testGetPlayerTopics(pid1: string, pid2: string) {
    console.log("\n" + "=".repeat(60));
    console.log(`TEST 7: GET /data/player/${pid1}/${pid2}/topics - Get player's all positions`);
    console.log("=".repeat(60));

    try {
        const result = await apiCall(`/data/player/${pid1}/${pid2}/topics`);
        console.log(`✅ Success! Player has positions on ${result.data.length} topics`);

        if (result.data.length > 0) {
            console.log("\nPlayer's positions:");
            result.data.forEach((position: any) => {
                console.log(`\n  Topic ${position.topicId}:`);
                console.log(`    Staked Amount: ${position.stakedAmount}`);
                console.log(`    Fair Weight: ${position.fairWeight}`);
                console.log(`    Unfair Weight: ${position.unfairWeight}`);

                if (BigInt(position.fairWeight) > 0n) {
                    console.log(`    → Voted FAIR`);
                } else if (BigInt(position.unfairWeight) > 0n) {
                    console.log(`    → Voted UNFAIR`);
                }
            });
        }

        return result;
    } catch (error) {
        console.error("❌ Test failed:", error);
        return null;
    }
}

// Test 8: Get topic stats
async function testGetTopicStats(topicId: string) {
    console.log("\n" + "=".repeat(60));
    console.log(`TEST 8: GET /data/topic/${topicId}/stats - Get topic statistics`);
    console.log("=".repeat(60));

    try {
        const result = await apiCall(`/data/topic/${topicId}/stats`);
        console.log(`✅ Success! Topic ${topicId} statistics:`);
        console.log(`  Vote Count: ${result.data.voteCount}`);
        console.log(`  Unstake Count: ${result.data.unstakeCount}`);
        console.log(`  Unique Voters: ${result.data.uniqueVoters}`);
        console.log(`  Total Vote Weight: ${result.data.totalVoteWeight}`);
        console.log(`  Total Unstake Amount: ${result.data.totalUnstakeAmount}`);

        return result;
    } catch (error) {
        console.error("❌ Test failed:", error);
        return null;
    }
}

// Test 9: Get platform stats
async function testGetPlatformStats() {
    console.log("\n" + "=".repeat(60));
    console.log("TEST 9: GET /data/platform/stats - Get platform-wide statistics");
    console.log("=".repeat(60));

    try {
        const result = await apiCall('/data/platform/stats');
        console.log(`✅ Success! Platform statistics:`);
        console.log(`  Total Topics: ${result.data.totalTopics}`);
        console.log(`  Total Votes: ${result.data.totalVotes}`);
        console.log(`  Total Unstakes: ${result.data.totalUnstakes}`);
        console.log(`  Unique Voters: ${result.data.uniqueVoters}`);

        return result;
    } catch (error) {
        console.error("❌ Test failed:", error);
        return null;
    }
}

// Main test runner
async function runAllTests() {
    console.log("\n" + "=".repeat(60));
    console.log("🧪 zkfair Service API Test Suite");
    console.log("=".repeat(60));
    console.log(`API Base URL: ${API_BASE_URL}`);
    console.log("=".repeat(60));

    const results = {
        passed: 0,
        failed: 0,
        tests: [] as string[]
    };

    try {
        // Test 1: Get all topics
        const allTopics = await testGetAllTopics();
        if (allTopics) {
            results.passed++;
            results.tests.push("✅ GET /data/topics");
        } else {
            results.failed++;
            results.tests.push("❌ GET /data/topics");
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        // Test 2: Get specific topic (use first available topic)
        const topicId = TEST_TOPIC_IDS[0];
        const specificTopic = await testGetTopic(topicId);
        if (specificTopic) {
            results.passed++;
            results.tests.push(`✅ GET /data/topic/${topicId}`);
        } else {
            results.failed++;
            results.tests.push(`❌ GET /data/topic/${topicId}`);
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        // Test 3: Get topic votes
        const topicVotes = await testGetTopicVotes(topicId);
        if (topicVotes) {
            results.passed++;
            results.tests.push(`✅ GET /data/topic/${topicId}/votes`);
        } else {
            results.failed++;
            results.tests.push(`❌ GET /data/topic/${topicId}/votes`);
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        // Test 4: Get topic unstakes
        const topicUnstakes = await testGetTopicUnstakes(topicId);
        if (topicUnstakes) {
            results.passed++;
            results.tests.push(`✅ GET /data/topic/${topicId}/unstakes`);
        } else {
            results.failed++;
            results.tests.push(`❌ GET /data/topic/${topicId}/unstakes`);
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        // Test 5: Get player votes
        const playerVotes = await testGetPlayerVotes(TEST_PLAYER1_PID[0], TEST_PLAYER1_PID[1]);
        if (playerVotes) {
            results.passed++;
            results.tests.push(`✅ GET /data/player/{pid}/votes`);
        } else {
            results.failed++;
            results.tests.push(`❌ GET /data/player/{pid}/votes`);
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        // Test 6: Get player topic vote
        const playerTopicVote = await testGetPlayerTopicVote(
            TEST_PLAYER1_PID[0],
            TEST_PLAYER1_PID[1],
            topicId
        );
        if (playerTopicVote) {
            results.passed++;
            results.tests.push(`✅ GET /data/player/{pid}/topic/{topicId}`);
        } else {
            results.failed++;
            results.tests.push(`❌ GET /data/player/{pid}/topic/{topicId}`);
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        // Test 7: Get player all topics
        const playerTopics = await testGetPlayerTopics(TEST_PLAYER1_PID[0], TEST_PLAYER1_PID[1]);
        if (playerTopics) {
            results.passed++;
            results.tests.push(`✅ GET /data/player/{pid}/topics`);
        } else {
            results.failed++;
            results.tests.push(`❌ GET /data/player/{pid}/topics`);
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        // Test 8: Get topic stats
        const topicStats = await testGetTopicStats(topicId);
        if (topicStats) {
            results.passed++;
            results.tests.push(`✅ GET /data/topic/${topicId}/stats`);
        } else {
            results.failed++;
            results.tests.push(`❌ GET /data/topic/${topicId}/stats`);
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        // Test 9: Get platform stats
        const platformStats = await testGetPlatformStats();
        if (platformStats) {
            results.passed++;
            results.tests.push(`✅ GET /data/platform/stats`);
        } else {
            results.failed++;
            results.tests.push(`❌ GET /data/platform/stats`);
        }

    } catch (error) {
        console.error("\n❌ Test suite failed with error:", error);
    }

    // Print final results
    console.log("\n" + "=".repeat(60));
    console.log("📊 TEST RESULTS SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total Tests: ${results.passed + results.failed}`);
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log("\nTest Details:");
    results.tests.forEach(test => console.log(`  ${test}`));
    console.log("=".repeat(60));

    if (results.failed === 0) {
        console.log("\n🎉 All tests passed!");
    } else {
        console.log(`\n⚠️  ${results.failed} test(s) failed. Please check the logs above.`);
    }
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllTests().catch(error => {
        console.error("Fatal error:", error);
        process.exit(1);
    });
}
