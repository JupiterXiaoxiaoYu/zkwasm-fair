/**
 * ====================================================================================================
 * Market Resolution Tool
 * ====================================================================================================
 *
 * FEATURES:
 * - Interactive market selection and resolution
 * - Display detailed market statistics and analytics
 * - Simulate payouts for both YES and NO outcomes
 * - View recent market transaction activity
 * - Support both interactive and programmatic modes
 * - Multi-step confirmation to prevent errors
 *
 * ====================================================================================================
 * USAGE:
 * ====================================================================================================
 *
 * Method 1: Interactive Mode (Recommended)
 * -----------------------------------------
 * Run the script and follow the prompts:
 *
 *   cd ts
 *   npm run build                    # Compile TypeScript
 *   node dist/resolve_market.js      # Run the script
 *
 * Workflow:
 *   1. Admin key is loaded automatically from server configuration
 *   2. View list of all unresolved markets with current statistics
 *   3. Select market number to resolve
 *   4. Review detailed market statistics (liquidity, prices, shares, volume)
 *   5. View payout simulation for both YES and NO outcomes
 *   6. Confirm you want to resolve the selected market
 *   7. Select outcome (1 = YES wins, 2 = NO wins)
 *   8. Final confirmation before submitting transaction
 *   9. View updated market state after resolution
 *
 * Method 2: Programmatic Mode
 * ----------------------------
 * Import and use in other scripts:
 *
 *   import { resolveMarketInteractive, resolveMarketById } from './resolve_market.js';
 *
 *   // Interactive mode
 *   await resolveMarketInteractive();
 *
 *   // Directly resolve specific market (non-interactive)
 *   await resolveMarketById('1', true);   // Resolve market 1, YES wins
 *   await resolveMarketById('2', false);  // Resolve market 2, NO wins
 *
 * Method 3: Direct Execution with ts-node
 * ----------------------------------------
 * Run TypeScript directly without compilation:
 *
 *   npx ts-node src/resolve_market.ts
 *
 * ====================================================================================================
 * REQUIREMENTS:
 * ====================================================================================================
 *
 * 1. Server must be running
 *    node dist/service.js
 *
 * 2. MongoDB must be online and accessible
 *
 * 3. Admin key file must exist
 *    src/admin.pubkey
 *
 * 4. Environment variables (optional)
 *    API_BASE_URL=http://127.0.0.1:3000
 *
 * ====================================================================================================
 * OUTPUT INFORMATION:
 * ====================================================================================================
 *
 * Market Statistics:
 *   - Market ID: Unique market identifier
 *   - Title: Market question/description
 *   - Timing: Start/End/Resolution times (in counter ticks)
 *   - Liquidity: AMM liquidity pools (YES/NO)
 *   - Current Prices: Real-time price percentages
 *   - Shares Issued: Total shares distributed (YES/NO)
 *   - Prize Pool: Real user funds available for winner payouts
 *   - Total Volume: Cumulative trading volume
 *   - Fees Collected: Platform fees accumulated
 *
 * Payout Simulation:
 *   - Shows potential payouts if YES wins vs NO wins
 *   - Payout per share for each outcome
 *   - Example payouts for different share amounts
 *
 * Resolution Summary:
 *   - Winning side (YES or NO)
 *   - Total winning and losing shares
 *   - Total prize pool to be claimed
 *   - Payout rate per share
 *
 * ====================================================================================================
 * NEXT STEPS AFTER RESOLUTION:
 * ====================================================================================================
 *
 * After resolving a market:
 *   1. Winners can claim their winnings using the CLAIM command
 *   2. Admin can withdraw collected fees using the WITHDRAW_FEES command
 *   3. Use test_query.ts to view updated market state and verify resolution
 *
 * ====================================================================================================
 * ERROR HANDLING:
 * ====================================================================================================
 *
 * Common Errors:
 *   - "Failed to load admin key": Check that src/admin.pubkey file exists
 *   - "Market already resolved": This market has already been resolved
 *   - "Connection refused": Server is not running, start with 'node dist/service.js'
 *   - "Market not found": Invalid market ID
 *   - "MarketNotResolved": Market resolution time hasn't been reached yet
 *
 * ====================================================================================================
 */

import { Player, PredictionMarketAPI } from "./api.js";
import { LeHexBN, query, ZKWasmAppRpc } from "zkwasm-ts-server";
import { get_server_admin_key } from "zkwasm-ts-server/src/config.js";
import * as readline from 'readline';

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:3000";

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Helper function to prompt user for input
function prompt(question: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
}

// Helper function to pause execution
function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Format large numbers for display
function formatNumber(value: string | bigint): string {
    const num = typeof value === 'string' ? BigInt(value) : value;
    return num.toLocaleString('en-US');
}

// Calculate and display market statistics
function displayMarketStats(market: any, api: PredictionMarketAPI) {
    console.log("\n" + "=".repeat(80));
    console.log("MARKET STATISTICS");
    console.log("=".repeat(80));

    const yesLiq = BigInt(market.yesLiquidity);
    const noLiq = BigInt(market.noLiquidity);
    const prices = api.calculatePrices(yesLiq, noLiq);

    console.log(`Market ID:           ${market.marketId}`);
    console.log(`Title:               ${market.titleString || 'No title'}`);
    console.log(`\nTiming Information:`);
    console.log(`  Start Time:        Counter ${market.startTime}`);
    console.log(`  End Time:          Counter ${market.endTime}`);
    console.log(`  Resolution Time:   Counter ${market.resolutionTime}`);
    console.log(`  Status:            ${market.resolved ? '✓ RESOLVED' : '○ ACTIVE'}`);

    console.log(`\nLiquidity (AMM):`);
    console.log(`  YES Liquidity:     ${formatNumber(market.yesLiquidity)}`);
    console.log(`  NO Liquidity:      ${formatNumber(market.noLiquidity)}`);
    console.log(`  Total Liquidity:   ${formatNumber(yesLiq + noLiq)}`);

    console.log(`\nCurrent Prices:`);
    console.log(`  YES Price:         ${(prices.yesPrice * 100).toFixed(2)}%`);
    console.log(`  NO Price:          ${(prices.noPrice * 100).toFixed(2)}%`);

    console.log(`\nShares Issued:`);
    console.log(`  Total YES Shares:  ${formatNumber(market.totalYesShares)}`);
    console.log(`  Total NO Shares:   ${formatNumber(market.totalNoShares)}`);
    console.log(`  Total Shares:      ${formatNumber(BigInt(market.totalYesShares) + BigInt(market.totalNoShares))}`);

    console.log(`\nFinancial Summary:`);
    console.log(`  Prize Pool:        ${formatNumber(market.prizePool)} (real user funds)`);
    console.log(`  Total Volume:      ${formatNumber(market.totalVolume)}`);
    console.log(`  Fees Collected:    ${formatNumber(market.totalFeesCollected)}`);

    if (market.resolved) {
        console.log(`\nResolution:`);
        console.log(`  Outcome:           ${market.outcome ? 'YES ✓' : 'NO ✓'}`);
        console.log(`  Winning Side:      ${market.outcome ? 'YES holders' : 'NO holders'}`);

        const winningShares = market.outcome ? BigInt(market.totalYesShares) : BigInt(market.totalNoShares);
        const prizePool = BigInt(market.prizePool);

        if (winningShares > 0n) {
            const payoutPerShare = (prizePool * 1000000n) / winningShares;
            console.log(`  Payout per Share:  ${(Number(payoutPerShare) / 1000000).toFixed(6)} per 1 share`);
        }
    }

    console.log("=".repeat(80) + "\n");
}

// Display payout simulation for both outcomes
function displayPayoutSimulation(market: any) {
    console.log("\n" + "=".repeat(80));
    console.log("PAYOUT SIMULATION");
    console.log("=".repeat(80));

    const prizePool = BigInt(market.prizePool);
    const yesShares = BigInt(market.totalYesShares);
    const noShares = BigInt(market.totalNoShares);

    console.log(`Prize Pool: ${formatNumber(prizePool)}`);
    console.log(`\nScenario 1: If YES wins`);
    if (yesShares > 0n) {
        const yesPayoutPerShare = (prizePool * 1000000n) / yesShares;
        console.log(`  ${formatNumber(yesShares)} YES shares will split the prize pool`);
        console.log(`  Payout per YES share: ${(Number(yesPayoutPerShare) / 1000000).toFixed(6)}`);
        console.log(`  Example: 1000 YES shares → ${formatNumber((1000n * prizePool) / yesShares)} payout`);
    } else {
        console.log(`  No YES shares issued - prize pool remains`);
    }

    console.log(`\nScenario 2: If NO wins`);
    if (noShares > 0n) {
        const noPayoutPerShare = (prizePool * 1000000n) / noShares;
        console.log(`  ${formatNumber(noShares)} NO shares will split the prize pool`);
        console.log(`  Payout per NO share: ${(Number(noPayoutPerShare) / 1000000).toFixed(6)}`);
        console.log(`  Example: 1000 NO shares → ${formatNumber((1000n * prizePool) / noShares)} payout`);
    } else {
        console.log(`  No NO shares issued - prize pool remains`);
    }

    console.log("=".repeat(80) + "\n");
}

// Main resolve market function
async function resolveMarketInteractive() {
    console.log("\n" + "█".repeat(80));
    console.log("█" + " ".repeat(24) + "MARKET RESOLUTION TOOL" + " ".repeat(33) + "█");
    console.log("█".repeat(80) + "\n");

    const api = new PredictionMarketAPI(API_BASE_URL);
    const rpc = new ZKWasmAppRpc(API_BASE_URL);

    // Get admin key from environment or server config
    let adminKey: string;
    try {
        adminKey = get_server_admin_key();
        console.log("✓ Admin key loaded from server configuration");
    } catch (e) {
        console.error("✗ Failed to load admin key from server configuration");
        console.error("  Make sure the server is running and admin.pubkey is available");
        rl.close();
        process.exit(1);
    }

    const adminPlayer = new Player(adminKey, rpc);
    const adminPubkey = new LeHexBN(query(adminKey).pkx).toU64Array();

    console.log(`Admin Public Key: [${adminPubkey[0]}, ${adminPubkey[1]}, ${adminPubkey[2]}, ${adminPubkey[3]}]`);
    console.log("");

    try {
        // Step 1: Fetch all markets
        console.log("⟳ Fetching all markets...");
        const allMarkets = await api.getAllMarkets();
        console.log(`✓ Found ${allMarkets.length} total markets\n`);

        if (allMarkets.length === 0) {
            console.log("No markets available. Please create markets first.");
            rl.close();
            return;
        }

        // Step 2: Filter unresolved markets
        const unresolvedMarkets = allMarkets.filter(m => !m.resolved);
        const resolvedMarkets = allMarkets.filter(m => m.resolved);

        console.log("Market Status Summary:");
        console.log(`  Active (unresolved):  ${unresolvedMarkets.length}`);
        console.log(`  Resolved:             ${resolvedMarkets.length}`);
        console.log("");

        if (unresolvedMarkets.length === 0) {
            console.log("All markets have been resolved!");
            console.log("\nResolved Markets:");
            resolvedMarkets.forEach((market, idx) => {
                console.log(`  ${idx + 1}. [Market ${market.marketId}] ${market.titleString || 'No title'}`);
                console.log(`     Outcome: ${market.outcome ? 'YES ✓' : 'NO ✓'}, Prize Pool: ${formatNumber(market.prizePool)}`);
            });
            rl.close();
            return;
        }

        // Step 3: Display unresolved markets
        console.log("Unresolved Markets:");
        console.log("-".repeat(80));
        unresolvedMarkets.forEach((market, idx) => {
            const yesLiq = BigInt(market.yesLiquidity);
            const noLiq = BigInt(market.noLiquidity);
            const prices = api.calculatePrices(yesLiq, noLiq);

            console.log(`${idx + 1}. [Market ${market.marketId}] ${market.titleString || 'No title'}`);
            console.log(`   Prize Pool: ${formatNumber(market.prizePool)} | Volume: ${formatNumber(market.totalVolume)}`);
            console.log(`   YES: ${(prices.yesPrice * 100).toFixed(2)}% (${formatNumber(market.totalYesShares)} shares)`);
            console.log(`   NO:  ${(prices.noPrice * 100).toFixed(2)}% (${formatNumber(market.totalNoShares)} shares)`);
            console.log("");
        });

        // Step 4: Let user select a market
        const marketChoice = await prompt(`Select market to resolve (1-${unresolvedMarkets.length}), or 'q' to quit: `);

        if (marketChoice.toLowerCase() === 'q') {
            console.log("Exiting...");
            rl.close();
            return;
        }

        const marketIndex = parseInt(marketChoice) - 1;
        if (isNaN(marketIndex) || marketIndex < 0 || marketIndex >= unresolvedMarkets.length) {
            console.log("Invalid selection. Exiting...");
            rl.close();
            return;
        }

        const selectedMarket = unresolvedMarkets[marketIndex];

        // Step 5: Display detailed market statistics
        displayMarketStats(selectedMarket, api);

        // Step 6: Get recent market activity
        console.log("⟳ Fetching recent market activity...");
        const recentTxs = await api.getMarketRecentTransactions(selectedMarket.marketId);
        console.log(`✓ Found ${recentTxs.length} recent transactions\n`);

        if (recentTxs.length > 0) {
            console.log("Recent Activity (last 10 transactions):");
            console.log("-".repeat(80));
            recentTxs.slice(0, 10).forEach((tx, idx) => {
                const playerShort = `[${tx.pid[0].toString().slice(0, 6)}...${tx.pid[1].toString().slice(0, 6)}]`;
                console.log(`${idx + 1}. ${playerShort} - ${tx.transactionType}: ${formatNumber(tx.amount)} → ${formatNumber(tx.shares)} shares`);
            });
            console.log("");
        }

        // Step 7: Display payout simulation
        displayPayoutSimulation(selectedMarket);

        // Step 8: Confirm resolution
        const confirmResolve = await prompt(`Are you sure you want to resolve Market ${selectedMarket.marketId}? (yes/no): `);

        if (confirmResolve.toLowerCase() !== 'yes') {
            console.log("Resolution cancelled. Exiting...");
            rl.close();
            return;
        }

        // Step 9: Get outcome
        console.log("\nOutcome Options:");
        console.log("  1. YES wins");
        console.log("  2. NO wins");
        const outcomeChoice = await prompt("Select outcome (1 or 2): ");

        let outcome: boolean;
        if (outcomeChoice === '1') {
            outcome = true;
            console.log("✓ Outcome: YES wins");
        } else if (outcomeChoice === '2') {
            outcome = false;
            console.log("✓ Outcome: NO wins");
        } else {
            console.log("Invalid outcome selection. Exiting...");
            rl.close();
            return;
        }

        // Step 10: Final confirmation
        const finalConfirm = await prompt(`\nFinal confirmation - Resolve Market ${selectedMarket.marketId} with outcome ${outcome ? 'YES' : 'NO'}? (yes/no): `);

        if (finalConfirm.toLowerCase() !== 'yes') {
            console.log("Resolution cancelled. Exiting...");
            rl.close();
            return;
        }

        // Step 11: Execute resolution
        console.log("\n⟳ Resolving market...");
        console.log(`  Market ID: ${selectedMarket.marketId}`);
        console.log(`  Outcome: ${outcome ? 'YES' : 'NO'}`);

        try {
            const result = await adminPlayer.resolveMarket(BigInt(selectedMarket.marketId), outcome);
            console.log("✓ Market resolution transaction submitted successfully!");
            console.log(`  Transaction result:`, result);
        } catch (error) {
            console.error("✗ Market resolution failed:");
            if (error instanceof Error) {
                console.error(`  Error: ${error.message}`);
            } else {
                console.error(`  Error:`, error);
            }
            rl.close();
            return;
        }

        // Step 12: Wait for transaction to be processed
        console.log("\n⟳ Waiting for transaction to be processed...");
        await delay(3000);

        // Step 13: Fetch updated market state
        console.log("⟳ Fetching updated market state...");
        const updatedMarket = await api.getMarket(selectedMarket.marketId);

        if (updatedMarket.resolved) {
            console.log("✓ Market successfully resolved!\n");
            displayMarketStats(updatedMarket, api);

            // Calculate winner statistics
            const winningShares = outcome ? BigInt(updatedMarket.totalYesShares) : BigInt(updatedMarket.totalNoShares);
            const losingShares = outcome ? BigInt(updatedMarket.totalNoShares) : BigInt(updatedMarket.totalYesShares);
            const prizePool = BigInt(updatedMarket.prizePool);

            console.log("Resolution Summary:");
            console.log("-".repeat(80));
            console.log(`Winning Side:          ${outcome ? 'YES' : 'NO'}`);
            console.log(`Winning Shares:        ${formatNumber(winningShares)}`);
            console.log(`Losing Shares:         ${formatNumber(losingShares)}`);
            console.log(`Prize Pool to Claim:   ${formatNumber(prizePool)}`);

            if (winningShares > 0n) {
                const payoutPerShare = (prizePool * 1000000n) / winningShares;
                console.log(`Payout per Share:      ${(Number(payoutPerShare) / 1000000).toFixed(6)}`);
                console.log(`\nExample Payouts:`);
                console.log(`  100 shares   → ${formatNumber((100n * prizePool) / winningShares)} payout`);
                console.log(`  1000 shares  → ${formatNumber((1000n * prizePool) / winningShares)} payout`);
                console.log(`  10000 shares → ${formatNumber((10000n * prizePool) / winningShares)} payout`);
            }
            console.log("-".repeat(80));

            console.log("\nNext Steps:");
            console.log("  1. Winners can now claim their winnings using the CLAIM command");
            console.log("  2. Admin can withdraw collected fees using the WITHDRAW_FEES command");
            console.log(`  3. Total fees available: ${formatNumber(updatedMarket.totalFeesCollected)}`);

        } else {
            console.log("⚠ Market resolution may still be processing. Please check the market state again in a moment.");
        }

    } catch (error) {
        console.error("\n✗ An error occurred:");
        if (error instanceof Error) {
            console.error(`  ${error.message}`);
            console.error(`  Stack: ${error.stack}`);
        } else {
            console.error(error);
        }
    } finally {
        rl.close();
        console.log("\n" + "█".repeat(80));
        console.log("█" + " ".repeat(30) + "RESOLUTION COMPLETE" + " ".repeat(30) + "█");
        console.log("█".repeat(80) + "\n");
    }
}

// Additional utility function: Resolve market by ID (non-interactive)
export async function resolveMarketById(marketId: string, outcome: boolean) {
    console.log(`\n=== Resolving Market ${marketId} (Non-Interactive Mode) ===\n`);

    const api = new PredictionMarketAPI(API_BASE_URL);
    const rpc = new ZKWasmAppRpc(API_BASE_URL);

    let adminKey: string;
    try {
        adminKey = get_server_admin_key();
    } catch (e) {
        throw new Error("Failed to load admin key from server configuration");
    }

    const adminPlayer = new Player(adminKey, rpc);

    try {
        // Fetch market details
        console.log(`⟳ Fetching market ${marketId} details...`);
        const market = await api.getMarket(marketId);

        if (market.resolved) {
            console.log(`✗ Market ${marketId} is already resolved with outcome: ${market.outcome ? 'YES' : 'NO'}`);
            return false;
        }

        displayMarketStats(market, api);

        // Execute resolution
        console.log(`⟳ Resolving market ${marketId} with outcome ${outcome ? 'YES' : 'NO'}...`);
        const result = await adminPlayer.resolveMarket(BigInt(marketId), outcome);
        console.log("✓ Market resolution transaction submitted!");
        console.log(`  Transaction result:`, result);

        // Wait and fetch updated state
        console.log("\n⟳ Waiting for transaction processing...");
        await delay(3000);

        const updatedMarket = await api.getMarket(marketId);
        if (updatedMarket.resolved) {
            console.log("✓ Market successfully resolved!");
            displayMarketStats(updatedMarket, api);
            return true;
        } else {
            console.log("⚠ Market resolution may still be processing.");
            return false;
        }

    } catch (error) {
        console.error("✗ Resolution failed:");
        console.error(error);
        throw error;
    }
}

// Export the main function
export { resolveMarketInteractive };

// Run interactive mode if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    resolveMarketInteractive();
}
