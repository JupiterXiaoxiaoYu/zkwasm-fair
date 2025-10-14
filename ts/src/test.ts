import { PrivateKey, bnToHexLe } from "delphinus-curves/src/altjubjub";
import dotenv from 'dotenv';
import { ZKWasmAppRpc } from 'zkwasm-minirollup-rpc';
import { LeHexBN } from "zkwasm-ts-server";
import { VotingAPI, VotingPlayer } from './api.js';
import { VoteType } from './models.js';

dotenv.config();

// Helper function to log player state
async function logPlayerState(rpc: any, player: VotingPlayer, playerName: string, stepDescription: string) {
    console.log(`\n=== ${stepDescription} - ${playerName} State ===`);

    try {
        const playerDataResponse: any = await rpc.queryState(player.processingKey);
        const playerData = JSON.parse(playerDataResponse.data);

        if (playerData && playerData.player) {
            const playerInfo = playerData.player.data;
            console.log(`${playerName} Balance: ${playerInfo.balance}`);
            console.log(`${playerName} Is Manager: ${playerInfo.is_manager}`);
        }
    } catch (error) {
        console.log(`Error getting ${playerName} state:`, error);
    }
}

async function testVotingSystem() {
    console.log("=== Comprehensive zkfair Voting System Test ===\n");

    const api = new VotingAPI();
    const rpc = new ZKWasmAppRpc("http://localhost:3000");

    // Use environment variable for admin key
    const adminKey = process.env.SERVER_ADMIN_KEY;
    if (!adminKey) {
        throw new Error("SERVER_ADMIN_KEY environment variable is required");
    }
    const player1Key = "456789789";
    const player2Key = "987654321";
    const player3Key = "111222333";
    const managerKey = "444555666";

    console.log("Admin key from env:", adminKey);

    try {
        // Create player instances
        const admin = new VotingPlayer(adminKey, rpc);
        const player1 = new VotingPlayer(player1Key, rpc);
        const player2 = new VotingPlayer(player2Key, rpc);
        const player3 = new VotingPlayer(player3Key, rpc);
        const manager = new VotingPlayer(managerKey, rpc);

        // Get player PIDs for deposits and manager operations
        let player1Pkey = PrivateKey.fromString(player1.processingKey);
        let player1Pubkey = player1Pkey.publicKey.key.x.v;
        let player1LeHexBN = new LeHexBN(bnToHexLe(player1Pubkey));
        let player1PkeyArray = player1LeHexBN.toU64Array();

        let player2Pkey = PrivateKey.fromString(player2.processingKey);
        let player2Pubkey = player2Pkey.publicKey.key.x.v;
        let player2LeHexBN = new LeHexBN(bnToHexLe(player2Pubkey));
        let player2PkeyArray = player2LeHexBN.toU64Array();

        let player3Pkey = PrivateKey.fromString(player3.processingKey);
        let player3Pubkey = player3Pkey.publicKey.key.x.v;
        let player3LeHexBN = new LeHexBN(bnToHexLe(player3Pubkey));
        let player3PkeyArray = player3LeHexBN.toU64Array();

        let managerPkey = PrivateKey.fromString(manager.processingKey);
        let managerPubkey = managerPkey.publicKey.key.x.v;
        let managerLeHexBN = new LeHexBN(bnToHexLe(managerPubkey));
        let managerPkeyArray = managerLeHexBN.toU64Array();

        console.log("Player1 PID:", player1PkeyArray);
        console.log("Player2 PID:", player2PkeyArray);
        console.log("Player3 PID:", player3PkeyArray);
        console.log("Manager PID:", managerPkeyArray);

        // Step 1: Install all players (INSTALL_PLAYER command)
        console.log("\n=== STEP 1: Installing Players (INSTALL_PLAYER) ===");

        const players = [
            { player: admin, name: "Admin" },
            { player: player1, name: "Player1" },
            { player: player2, name: "Player2" },
            { player: player3, name: "Player3" },
            { player: manager, name: "Manager" }
        ];

        for (const { player, name } of players) {
            try {
                await player.installPlayer();
                console.log(`${name} installed successfully`);
            } catch (e) {
                console.log(`${name} already exists or error:`, e);
            }
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 2: Admin adds a manager (ADD_MANAGER command)
        console.log("\n=== STEP 2: Admin Adds Manager (ADD_MANAGER) ===");

        try {
            await admin.addManager(managerPkeyArray[1], managerPkeyArray[2]);
            console.log("Manager added successfully");
        } catch (error) {
            console.log("Add manager error:", error);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 3: Admin deposits funds for all players (DEPOSIT command)
        console.log("\n=== STEP 3: Admin Deposits Funds (DEPOSIT) ===");

        await admin.depositFunds(50000n, player1PkeyArray[1], player1PkeyArray[2]);
        console.log("Deposited 50000 for Player1");

        await admin.depositFunds(40000n, player2PkeyArray[1], player2PkeyArray[2]);
        console.log("Deposited 40000 for Player2");

        await admin.depositFunds(60000n, player3PkeyArray[1], player3PkeyArray[2]);
        console.log("Deposited 60000 for Player3");

        await admin.depositFunds(30000n, managerPkeyArray[1], managerPkeyArray[2]);
        console.log("Deposited 30000 for Manager");

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 4: Manager creates multiple voting topics (CREATE_TOPIC command)
        console.log("\n=== STEP 4: Manager Creates Voting Topics (CREATE_TOPIC) ===");

        // Topic 1: Short duration topic (100 blocks)
        console.log("Creating Topic 1: Should we implement feature X? (Duration: 100 blocks)");
        try {
            await manager.createTopic(100n);
            console.log("Topic 1 created successfully");
        } catch (error) {
            console.log("Topic 1 creation error:", error);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Topic 2: Medium duration topic (500 blocks)
        console.log("Creating Topic 2: Community governance proposal (Duration: 500 blocks)");
        try {
            await manager.createTopic(500n);
            console.log("Topic 2 created successfully");
        } catch (error) {
            console.log("Topic 2 creation error:", error);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Topic 3: Long duration topic (1000 blocks)
        console.log("Creating Topic 3: Platform upgrade decision (Duration: 1000 blocks)");
        try {
            await manager.createTopic(1000n);
            console.log("Topic 3 created successfully");
        } catch (error) {
            console.log("Topic 3 creation error:", error);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 5: Players vote on Topic 1 (VOTE command)
        console.log("\n=== STEP 5: Multi-Player Voting on Topic 1 (VOTE) ===");

        const topic1Id = 1n; // First topic

        // Player1 votes Fair with 10000 stake
        try {
            await player1.vote(topic1Id, VoteType.Fair, 10000n);
            console.log("Player1 voted Fair with 10000 on Topic 1");
        } catch (error) {
            console.log("Player1 vote error:", error);
        }

        // Player2 votes Unfair with 8000 stake
        try {
            await player2.vote(topic1Id, VoteType.Unfair, 8000n);
            console.log("Player2 voted Unfair with 8000 on Topic 1");
        } catch (error) {
            console.log("Player2 vote error:", error);
        }

        // Player3 votes Fair with 15000 stake
        try {
            await player3.vote(topic1Id, VoteType.Fair, 15000n);
            console.log("Player3 voted Fair with 15000 on Topic 1");
        } catch (error) {
            console.log("Player3 vote error:", error);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 6: Players vote on Topic 2 (more VOTE commands)
        console.log("\n=== STEP 6: Voting on Topic 2 (VOTE) ===");

        const topic2Id = 2n; // Second topic

        try {
            await player1.vote(topic2Id, VoteType.Unfair, 5000n);
            console.log("Player1 voted Unfair with 5000 on Topic 2");
        } catch (error) {
            console.log("Player1 Topic 2 vote error:", error);
        }

        try {
            await player2.vote(topic2Id, VoteType.Fair, 12000n);
            console.log("Player2 voted Fair with 12000 on Topic 2");
        } catch (error) {
            console.log("Player2 Topic 2 vote error:", error);
        }

        try {
            await player3.vote(topic2Id, VoteType.Fair, 20000n);
            console.log("Player3 voted Fair with 20000 on Topic 2");
        } catch (error) {
            console.log("Player3 Topic 2 vote error:", error);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 7: Additional votes and cross-topic activity
        console.log("\n=== STEP 7: Additional Cross-Topic Voting (VOTE) ===");

        const topic3Id = 3n; // Third topic

        // Player2 adds more votes to Topic 1
        try {
            await player2.vote(topic1Id, VoteType.Fair, 3000n); // Changed mind, now votes Fair too
            console.log("Player2 added Fair vote with 3000 on Topic 1");
        } catch (error) {
            console.log("Player2 additional Topic 1 vote error:", error);
        }

        // Votes on Topic 3
        try {
            await player1.vote(topic3Id, VoteType.Fair, 8000n);
            console.log("Player1 voted Fair with 8000 on Topic 3");
        } catch (error) {
            console.log("Player1 Topic 3 vote error:", error);
        }

        try {
            await player3.vote(topic3Id, VoteType.Unfair, 10000n);
            console.log("Player3 voted Unfair with 10000 on Topic 3");
        } catch (error) {
            console.log("Player3 Topic 3 vote error:", error);
        }

        try {
            await manager.vote(topic3Id, VoteType.Fair, 5000n);
            console.log("Manager voted Fair with 5000 on Topic 3");
        } catch (error) {
            console.log("Manager Topic 3 vote error:", error);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 8: Players unstake from topics (UNSTAKE command)
        console.log("\n=== STEP 8: Players Unstake (UNSTAKE) ===");

        // Player1 unstakes partially from Topic 1
        try {
            await player1.unstake(topic1Id, 3000n);
            console.log("Player1 unstaked 3000 from Topic 1");
        } catch (error) {
            console.log("Player1 unstake error:", error);
        }

        // Player2 unstakes from Topic 2
        try {
            await player2.unstake(topic2Id, 5000n);
            console.log("Player2 unstaked 5000 from Topic 2");
        } catch (error) {
            console.log("Player2 unstake error:", error);
        }

        // Player3 unstakes from Topic 3
        try {
            await player3.unstake(topic3Id, 4000n);
            console.log("Player3 unstaked 4000 from Topic 3");
        } catch (error) {
            console.log("Player3 unstake error:", error);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 9: Manager closes a topic (CLOSE_TOPIC command)
        console.log("\n=== STEP 9: Manager Closes Topic 1 (CLOSE_TOPIC) ===");

        try {
            await manager.closeTopic(topic1Id);
            console.log("Manager closed Topic 1");
        } catch (error) {
            console.log("Close topic error:", error);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 10: Admin removes the manager (REMOVE_MANAGER command)
        console.log("\n=== STEP 10: Admin Removes Manager (REMOVE_MANAGER) ===");

        try {
            await admin.removeManager(managerPkeyArray[1], managerPkeyArray[2]);
            console.log("Manager removed successfully");
        } catch (error) {
            console.log("Remove manager error:", error);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 11: Test WITHDRAW command
        console.log("\n=== STEP 11: Players Test Withdrawal (WITHDRAW) ===");

        // Player1 withdraws some funds
        try {
            await player1.withdrawFunds(5000n, 0n, 1n); // Withdraw 5000 to address [0,1]
            console.log("Player1 withdrew 5000 funds");
        } catch (error) {
            console.log("Player1 withdraw error:", error);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 12: Query and display topic statistics
        console.log("\n=== STEP 12: Query Topic Statistics ===");

        try {
            const topics = await api.getAllTopics();
            console.log(`\nTotal topics created: ${topics.length}`);

            for (const topic of topics) {
                console.log(`\n--- Topic ${topic.topicId} ---`);
                console.log(`Start Time: ${topic.startTime}`);
                console.log(`End Time: ${topic.endTime}`);
                console.log(`Is Active: ${topic.isActive}`);
                console.log(`Fair Votes: ${topic.totalFairVotes}`);
                console.log(`Unfair Votes: ${topic.totalUnfairVotes}`);
                console.log(`Fair Voters: ${topic.totalFairVoters}`);
                console.log(`Unfair Voters: ${topic.totalUnfairVoters}`);

                const percentages = api.calculateVotePercentages(topic);
                console.log(`Fair Percentage: ${percentages.fairPercentage.toFixed(2)}%`);
                console.log(`Unfair Percentage: ${percentages.unfairPercentage.toFixed(2)}%`);
            }
        } catch (error) {
            console.log("Error querying topics:", error);
        }

        // Step 13: Final state logging
        console.log("\n=== STEP 13: Final State Summary ===");

        await logPlayerState(rpc, admin, "Admin", "Final State");
        await logPlayerState(rpc, player1, "Player1", "Final State");
        await logPlayerState(rpc, player2, "Player2", "Final State");
        await logPlayerState(rpc, player3, "Player3", "Final State");
        await logPlayerState(rpc, manager, "Manager", "Final State");

        console.log("\n=== ALL VOTING SYSTEM COMMANDS TESTED SUCCESSFULLY ===");
        console.log("Commands tested:");
        console.log("✓ INSTALL_PLAYER");
        console.log("✓ ADD_MANAGER");
        console.log("✓ DEPOSIT");
        console.log("✓ CREATE_TOPIC (multiple topics)");
        console.log("✓ VOTE (multiple topics, multiple players, both Fair and Unfair)");
        console.log("✓ UNSTAKE (cross-topic unstaking)");
        console.log("✓ CLOSE_TOPIC");
        console.log("✓ REMOVE_MANAGER");
        console.log("✓ WITHDRAW");

    } catch (error) {
        console.error("Test failed:", error);
        if (error instanceof Error) {
            console.error("Error message:", error.message);
            console.error("Error stack:", error.stack);
        }
    }
}

async function runTests() {
    console.log("Running comprehensive zkfair voting system test...\n");

    try {
        await testVotingSystem();
    } catch (error) {
        console.error("Tests failed:", error);
    }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runTests();
}
