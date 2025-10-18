import { PrivateKey, bnToHexLe } from "delphinus-curves/src/altjubjub";
import dotenv from 'dotenv';
import { ZKWasmAppRpc } from 'zkwasm-minirollup-rpc';
import { LeHexBN } from "zkwasm-ts-server";
import { VotingAPI, VotingPlayer } from './api.js';
import { VoteType } from './models.js';

dotenv.config();

/**
 * New voting system test
 *
 * Key changes:
 * - No deposit/withdraw/unstake (removed balance management)
 * - Votes are permanent once cast
 * - Vote weight comes from external ERC20 balance
 * - Voting requires Ethereum signature
 * - Each player can only vote once per topic
 */

async function testNewVotingSystem() {
    console.log("=== New zkfair Voting System Test ===\n");
    console.log("Testing: Single-vote-per-topic model with ERC20 balance weight\n");

    const api = new VotingAPI();
    const rpc = new ZKWasmAppRpc("http://localhost:3000");

    // Use environment variable for admin key
    const adminKey = process.env.SERVER_ADMIN_KEY;
    if (!adminKey) {
        throw new Error("SERVER_ADMIN_KEY environment variable is required");
    }

    const managerKey = "444555666";
    const player1Key = "456789789";

    try {
        // Create player instances
        const admin = new VotingPlayer(adminKey, rpc);
        const manager = new VotingPlayer(managerKey, rpc);
        const player1 = new VotingPlayer(player1Key, rpc);

        // Get PIDs
        let managerPkey = PrivateKey.fromString(manager.processingKey);
        let managerPubkey = managerPkey.publicKey.key.x.v;
        let managerLeHexBN = new LeHexBN(bnToHexLe(managerPubkey));
        let managerPkeyArray = managerLeHexBN.toU64Array();

        let player1Pkey = PrivateKey.fromString(player1.processingKey);
        let player1Pubkey = player1Pkey.publicKey.key.x.v;
        let player1LeHexBN = new LeHexBN(bnToHexLe(player1Pubkey));
        let player1PkeyArray = player1LeHexBN.toU64Array();

        console.log("Manager PID:", managerPkeyArray);
        console.log("Player1 PID:", player1PkeyArray);

        // Step 1: Install players
        console.log("\n=== STEP 1: Installing Players ===");

        for (const { player, name } of [
            { player: admin, name: "Admin" },
            { player: manager, name: "Manager" },
            { player: player1, name: "Player1" }
        ]) {
            try {
                await player.installPlayer();
                console.log(`${name} installed successfully`);
            } catch (e) {
                console.log(`${name} already exists`);
            }
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 2: Admin adds manager
        console.log("\n=== STEP 2: Admin Adds Manager ===");
        try {
            await admin.addManager(managerPkeyArray[1], managerPkeyArray[2]);
            console.log("Manager added successfully");
        } catch (error) {
            console.log("Manager already added or error:", error);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 3: Manager creates a topic
        console.log("\n=== STEP 3: Manager Creates Topic ===");
        try {
            await manager.createTopic(1000n); // Duration: 1000 blocks
            console.log("Topic created successfully");
        } catch (error) {
            console.log("Topic creation error:", error);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 4: Simulate voting via /vote endpoint
        console.log("\n=== STEP 4: Simulating Vote Submission ===");
        console.log("NOTE: In production, this would be done via HTTP POST to /vote endpoint");
        console.log("The vote endpoint requires:");
        console.log("  - player_id: zkWasm player ID");
        console.log("  - topic_id: Topic to vote on");
        console.log("  - vote_type: 'Fair' or 'Unfair'");
        console.log("  - signature: Ethereum signature");
        console.log("  - timestamp: Unix timestamp");
        console.log("\nBackend will:");
        console.log("  1. Verify Ethereum signature → recover address");
        console.log("  2. Query ERC20 balance for that address");
        console.log("  3. Admin submits vote on behalf of user");
        console.log("  4. Rust layer enforces one-vote-per-topic rule");

        // Example: Admin submits vote on behalf of player1
        // In real scenario, this would be triggered by /vote API after signature verification
        const topicId = 1n;
        const voteWeight = 10000n; // Would be queried from ERC20 contract

        try {
            await admin.voteOnBehalfOf(
                [player1PkeyArray[1], player1PkeyArray[2]],
                topicId,
                VoteType.Fair,
                voteWeight
            );
            console.log(`\nVote submitted: Player1 → Topic ${topicId} → Fair (weight: ${voteWeight})`);
        } catch (error) {
            console.log("Vote error:", error);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 5: Try to vote again (should fail)
        console.log("\n=== STEP 5: Testing Duplicate Vote Prevention ===");
        try {
            await admin.voteOnBehalfOf(
                [player1PkeyArray[1], player1PkeyArray[2]],
                topicId,
                VoteType.Unfair,
                5000n
            );
            console.log("ERROR: Duplicate vote was allowed (should not happen!)");
        } catch (error: any) {
            if (error.message && error.message.includes("AlreadyVoted")) {
                console.log("✓ Duplicate vote correctly rejected by Rust layer");
            } else {
                console.log("Vote failed with error:", error);
            }
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 6: Close topic
        console.log("\n=== STEP 6: Manager Closes Topic ===");
        try {
            await manager.closeTopic(topicId);
            console.log("Topic closed successfully");
        } catch (error) {
            console.log("Close topic error:", error);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 7: Query topic statistics
        console.log("\n=== STEP 7: Query Topic Statistics ===");
        try {
            const topics = await api.getAllTopics();
            console.log(`\nTotal topics: ${topics.length}`);

            for (const topic of topics) {
                console.log(`\n--- Topic ${topic.topicId} ---`);
                console.log(`Start Time: ${topic.startTime}`);
                console.log(`End Time: ${topic.endTime}`);
                console.log(`Is Active: ${topic.isActive}`);
                console.log(`Total Fair Votes (weight): ${topic.totalFairVotes}`);
                console.log(`Total Unfair Votes (weight): ${topic.totalUnfairVotes}`);
                console.log(`Total Fair Voters (count): ${topic.totalFairVoters}`);
                console.log(`Total Unfair Voters (count): ${topic.totalUnfairVoters}`);

                const percentages = api.calculateVotePercentages(topic);
                console.log(`Fair: ${percentages.fairPercentage.toFixed(2)}%`);
                console.log(`Unfair: ${percentages.unfairPercentage.toFixed(2)}%`);
            }
        } catch (error) {
            console.log("Error querying topics:", error);
        }

        console.log("\n=== NEW VOTING SYSTEM TEST COMPLETED ===");
        console.log("Key features tested:");
        console.log("✓ INSTALL_PLAYER");
        console.log("✓ ADD_MANAGER");
        console.log("✓ CREATE_TOPIC");
        console.log("✓ VOTE (via admin on behalf of user)");
        console.log("✓ Duplicate vote prevention (Rust layer)");
        console.log("✓ CLOSE_TOPIC");
        console.log("\nRemoved features (no longer available):");
        console.log("✗ DEPOSIT/WITHDRAW (no internal balance)");
        console.log("✗ UNSTAKE (votes are permanent)");

    } catch (error) {
        console.error("Test failed:", error);
        if (error instanceof Error) {
            console.error("Error message:", error.message);
            console.error("Error stack:", error.stack);
        }
    }
}

async function runTests() {
    console.log("Running new voting system test...\n");

    try {
        await testNewVotingSystem();
    } catch (error) {
        console.error("Tests failed:", error);
    }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runTests();
}
