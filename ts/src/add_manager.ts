import dotenv from 'dotenv';
import { ZKWasmAppRpc } from 'zkwasm-minirollup-rpc';
import { VotingPlayer } from './api.js';

dotenv.config();

/**
 * Add Manager Script
 *
 * This script adds a specific player as a manager in the zkfair voting system.
 * Only admin can add managers.
 */

async function addManager() {
    console.log("=== Add Manager Script ===\n");

    const rpc = new ZKWasmAppRpc("http://localhost:3000");

    // Use environment variable for admin key
    const adminKey = process.env.SERVER_ADMIN_KEY;
    if (!adminKey) {
        throw new Error("SERVER_ADMIN_KEY environment variable is required");
    }

    // Target player to be added as manager
    const targetPid1 = 8827886221244760764n;
    const targetPid2 = 6020766400334736010n;

    try {
        // Create admin player instance
        const admin = new VotingPlayer(adminKey, rpc);

        console.log("Admin private key loaded");
        console.log(`Target player ID: [${targetPid1}, ${targetPid2}]\n`);

        // Step 1: Install admin player if not already installed
        console.log("Step 1: Installing admin player...");
        try {
            await admin.installPlayer();
            console.log("✅ Admin player installed successfully");
        } catch (e) {
            if (e instanceof Error && e.message === "PlayerAlreadyExists") {
                console.log("ℹ️  Admin player already exists");
            } else {
                throw e;
            }
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 2: Add target player as manager
        console.log("\nStep 2: Adding player as manager...");
        try {
            const result = await admin.addManager(targetPid1, targetPid2);
            console.log("✅ Manager added successfully!");
            console.log("Transaction result:", result);
        } catch (e) {
            if (e instanceof Error) {
                console.error("❌ Failed to add manager:", e.message);

                // Provide helpful error messages
                if (e.message.includes("PlayerNotExist")) {
                    console.error("\n⚠️  The target player does not exist in the system.");
                    console.error("   The player must first be installed before being added as a manager.");
                    console.error(`   Player ID: [${targetPid1}, ${targetPid2}]`);
                } else if (e.message.includes("Unauthorized")) {
                    console.error("\n⚠️  Only admin can add managers.");
                    console.error("   Make sure SERVER_ADMIN_KEY is set correctly.");
                }
            }
            throw e;
        }

        console.log("\n=== Manager Added Successfully ===");
        console.log(`Player [${targetPid1}, ${targetPid2}] is now a manager`);
        console.log("\nThis player can now:");
        console.log("  - Create new voting topics");
        console.log("  - Close existing topics");

    } catch (error) {
        console.error("\n💥 Script failed:", error);
        process.exit(1);
    }
}

// Main execution
async function main() {
    try {
        await addManager();
        process.exit(0);
    } catch (error) {
        console.error("Script execution failed:", error);
        process.exit(1);
    }
}

// Run the script
main();
