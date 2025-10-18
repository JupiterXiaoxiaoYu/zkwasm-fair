import { Express } from "express";
import mongoose from 'mongoose';
import { Event, EventModel, Service, TxStateManager, TxWitness } from "zkwasm-ts-server";
import { merkleRootToBeHexString } from "zkwasm-ts-server/src/lib.js";
import {
    TopicModel,
    VoteEventModel,
    PlayerTopicVoteModel,
    docToJSON,
    IndexedObject,
    VoteEventData,
    EVENT_INDEXED_OBJECT,
    EVENT_VOTE,
    EVENT_TOPIC_CLOSED
} from "./models.js";
import { verifyVoteSignature } from "./signature.js";
import { getVoteWeight, defaultERC20Config } from "./balance_query.js";
import { createCommand } from "zkwasm-minirollup-rpc";
import { get_server_admin_key } from "zkwasm-ts-server/src/config.js";

const service = new Service(eventCallback, batchedCallback, extra);
await service.initialize();

let txStateManager = new TxStateManager(merkleRootToBeHexString(service.merkleRoot));

const VOTE_COMMAND = 7;  // Vote command ID

function extra(app: Express) {
    /**
     * POST /vote - Submit a vote with Ethereum signature verification
     * Request body:
     * {
     *   player_id: [u64, u64],     // zkWasm player_id
     *   topic_id: string,           // Topic ID
     *   vote_type: "Fair" | "Unfair",
     *   signature: string,          // Ethereum signature
     *   timestamp: number           // Unix timestamp when signed
     * }
     */
    app.post('/vote', async (req, res) => {
        const { player_id, topic_id, vote_type, signature, timestamp } = req.body;

        try {
            // Validate input
            if (!player_id || !Array.isArray(player_id) || player_id.length !== 2) {
                return res.status(400).send({
                    success: false,
                    error: 'Invalid player_id format. Expected [u64, u64]'
                });
            }

            if (!topic_id) {
                return res.status(400).send({
                    success: false,
                    error: 'Missing topic_id'
                });
            }

            if (vote_type !== 'Fair' && vote_type !== 'Unfair') {
                return res.status(400).send({
                    success: false,
                    error: 'Invalid vote_type. Expected "Fair" or "Unfair"'
                });
            }

            if (!signature) {
                return res.status(400).send({
                    success: false,
                    error: 'Missing signature'
                });
            }

            if (!timestamp || typeof timestamp !== 'number') {
                return res.status(400).send({
                    success: false,
                    error: 'Invalid timestamp'
                });
            }

            const topicId = BigInt(topic_id);
            const voteTypeNum = vote_type === 'Fair' ? 1 : 0;

            // 1. Verify Ethereum signature and recover address
            const ethAddress = verifyVoteSignature(topicId, voteTypeNum, timestamp, signature);
            console.log(`Vote request from Ethereum address: ${ethAddress}`);

            // 2. Query ERC20 balance for vote weight
            const voteWeight = await getVoteWeight(
                defaultERC20Config.rpcUrl,
                defaultERC20Config.tokenAddress,
                ethAddress,
                defaultERC20Config.decimals
            );

            console.log(`Vote weight for ${ethAddress}: ${voteWeight}`);

            if (voteWeight === 0n) {
                return res.status(400).send({
                    success: false,
                    error: 'Insufficient ERC20 balance to vote'
                });
            }

            // 3. Admin submits vote command on behalf of user
            // Note: Deduplication is enforced by Rust layer (PlayerVoteManager)
            const adminKey = get_server_admin_key();
            const cmd = createCommand(
                0n,  // Admin nonce will be handled by zkWasm
                BigInt(VOTE_COMMAND),
                [
                    BigInt(player_id[0]),
                    BigInt(player_id[1]),
                    topicId,
                    BigInt(voteTypeNum),
                    voteWeight
                ]
            );

            // 4. Add transaction to queue
            // Note: Deduplication is enforced ONLY by Rust layer (PlayerVoteManager)
            // If vote fails (e.g., already voted), the transaction will fail with ERROR_ALREADY_VOTED
            const job = await service.queue!.add('transaction', {
                command: Array.from(cmd),
                processingKey: adminKey
            });

            res.status(201).send({
                success: true,
                jobid: job.id,
                eth_address: ethAddress,
                vote_weight: voteWeight.toString()
            });

        } catch (error: any) {
            console.error('Error processing vote:', error);
            res.status(500).send({
                success: false,
                error: error.message || 'Failed to process vote'
            });
        }
    });

    // Get all topics
    app.get("/data/topics", async (req: any, res) => {
        try {
            const doc = await TopicModel.find({}).sort({ topicId: 1 });

            if (doc.length === 0) {
                res.status(200).send({
                    success: true,
                    data: [],
                });
                return;
            }

            let data = doc.map((d) => docToJSON(d));

            res.status(200).send({
                success: true,
                data: data,
            });
        } catch (e: any) {
            console.error("Error fetching topics:", e);
            res.status(500).send({
                success: false,
                error: "Failed to fetch topics"
            });
        }
    });

    // Get specific topic by ID
    app.get("/data/topic/:topicId", async (req: any, res) => {
        try {
            const topicId = req.params.topicId;
            const doc = await TopicModel.findOne({ topicId: topicId });

            if (!doc) {
                res.status(404).send({
                    success: false,
                    error: "Topic not found"
                });
                return;
            }

            const topic = docToJSON(doc);

            res.status(200).send({
                success: true,
                data: topic,
            });
        } catch (e) {
            console.error("Error fetching topic:", e);
            res.status(500).send({
                success: false,
                error: "Failed to fetch topic"
            });
        }
    });

    // Get recent vote events for specific topic
    app.get("/data/topic/:topicId/votes", async (req: any, res) => {
        try {
            const topicId = req.params.topicId;

            const doc = await VoteEventModel.find({ topicId: topicId })
                .sort({ counter: -1 })
                .limit(100);

            let data = doc.map((d: mongoose.Document) => {
                const vote = docToJSON(d);
                vote.transactionType = 'VOTE';
                return vote;
            });

            res.status(200).send({
                success: true,
                data: data,
            });
        } catch (e) {
            console.error("Error fetching topic votes:", e);
            res.status(500).send({
                success: false,
                error: "Failed to fetch topic votes"
            });
        }
    });


    // Get player's recent vote events across all topics
    app.get("/data/player/:pid1/:pid2/votes", async (req: any, res) => {
        try {
            const pid1 = req.params.pid1;
            const pid2 = req.params.pid2;

            const doc = await VoteEventModel.find({
                pid: [pid1, pid2],
            })
                .sort({ counter: -1 })
                .limit(50);

            let data = doc.map((d: mongoose.Document) => {
                const vote = docToJSON(d);
                vote.transactionType = 'VOTE';
                return vote;
            });

            res.status(200).send({
                success: true,
                data: data,
            });
        } catch (e) {
            console.error("Error fetching player votes:", e);
            res.status(500).send({
                success: false,
                error: "Failed to fetch player votes"
            });
        }
    });

    // Get player's topic vote data
    app.get("/data/player/:pid1/:pid2/topic/:topicId", async (req: any, res) => {
        try {
            const pid1 = req.params.pid1;
            const pid2 = req.params.pid2;
            const topicId = req.params.topicId;

            const doc = await PlayerTopicVoteModel.findOne({
                pid: [pid1, pid2],
                topicId: topicId
            });

            if (!doc) {
                // Return default empty vote state (new architecture: single vote per topic)
                res.status(200).send({
                    success: true,
                    data: {
                        pid: [pid1, pid2],
                        topicId: topicId,
                        voteWeight: "0",  // ERC20 balance at vote time
                        voteType: null,   // null = not voted, 1 = Fair, 0 = Unfair
                        voteTime: "0"     // Counter when voted
                    }
                });
                return;
            }

            const voteData = docToJSON(doc);

            res.status(200).send({
                success: true,
                data: voteData,
            });
        } catch (e) {
            console.error("Error fetching player topic vote:", e);
            res.status(500).send({
                success: false,
                error: "Failed to fetch player topic vote"
            });
        }
    });

    // Get all player's topic votes
    app.get("/data/player/:pid1/:pid2/topics", async (req: any, res) => {
        try {
            const pid1 = req.params.pid1;
            const pid2 = req.params.pid2;

            const doc = await PlayerTopicVoteModel.find({
                pid: [pid1, pid2]
            });

            let data = doc.map((d: mongoose.Document) => docToJSON(d));

            res.status(200).send({
                success: true,
                data: data,
            });
        } catch (e) {
            console.error("Error fetching player topic votes:", e);
            res.status(500).send({
                success: false,
                error: "Failed to fetch player topic votes"
            });
        }
    });

    // Get topic statistics
    app.get("/data/topic/:topicId/stats", async (req: any, res) => {
        try {
            const topicId = BigInt(req.params.topicId);

            // Get vote count
            const voteCount = await VoteEventModel.countDocuments({ topicId: topicId });

            // Get unique voters by fetching votes and counting unique PIDs
            // Note: Using aggregate with $match on BigInt fields has issues in MongoDB
            const votes = await VoteEventModel.find({ topicId: topicId }).select('pid');
            const uniquePids = new Set<string>();
            votes.forEach((vote: any) => {
                // Create a unique key from the pid array
                const pidKey = `${vote.pid[0]}-${vote.pid[1]}`;
                uniquePids.add(pidKey);
            });
            const uniqueVoters = uniquePids.size;

            const stats = {
                voteCount,
                uniqueVoters
            };

            res.status(200).send({
                success: true,
                data: stats,
            });
        } catch (e) {
            console.error("Error fetching topic stats:", e);
            res.status(500).send({
                success: false,
                error: "Failed to fetch topic stats"
            });
        }
    });

    // Get platform statistics
    app.get("/data/platform/stats", async (req: any, res) => {
        try {
            // Get total topics
            const totalTopics = await TopicModel.countDocuments();

            // Get total votes
            const totalVotes = await VoteEventModel.countDocuments();

            // Get unique voters
            const uniqueVotersResult = await VoteEventModel.aggregate([
                {
                    $group: {
                        _id: null,
                        uniqueVoters: { $addToSet: "$pid" }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        uniqueVoters: { $size: "$uniqueVoters" }
                    }
                }
            ]);

            const uniqueVoters = uniqueVotersResult.length > 0 ? uniqueVotersResult[0].uniqueVoters : 0;

            const stats = {
                totalTopics,
                totalVotes,
                uniqueVoters
            };

            res.status(200).send({
                success: true,
                data: stats,
            });
        } catch (e) {
            console.error("Error fetching platform stats:", e);
            res.status(500).send({
                success: false,
                error: "Failed to fetch platform stats"
            });
        }
    });
}

service.serve();

async function batchedCallback(_arg: TxWitness[], _preMerkle: string, postMerkle: string) {
    await txStateManager.moveToCommit(postMerkle);
}

async function eventCallback(arg: TxWitness, data: BigUint64Array) {
    console.log("Event callback triggered with data:", data);

    if (data.length == 0) {
        return;
    }

    if (data[0] != 0n) {
        console.error("Transaction failed with error code:", data[0]);
        return;
    }
    if (data.length <= 2) {
        return;
    }

    let event = new Event(data[1], data);

    // Use updateOne with upsert to prevent duplicate event storage on service restart
    try {
        await EventModel.updateOne(
            { id: event.id.toString() },
            {
                id: event.id.toString(),
                data: Buffer.from(event.data.buffer)
            },
            { upsert: true }
        );
    } catch (e) {
        console.error("Event save error:", e);
    }

    let i = 2; // start pos
    while (i < data.length) {
        let eventType = Number(data[i] >> 32n);
        let eventLength = data[i] & ((1n << 32n) - 1n);
        let eventData = data.slice(i + 1, i + 1 + Number(eventLength));

        console.log("Processing event type:", eventType, "length:", eventLength);

        switch (eventType) {
            case EVENT_INDEXED_OBJECT:
                try {
                    console.log("=== Processing IndexedObject event ===");
                    console.log("Event data:", Array.from(eventData));
                    let obj = IndexedObject.fromEvent(eventData);
                    console.log("Parsed object index:", obj.index, "data length:", obj.data.length);
                    if (obj.index === 1) { // TOPIC_INFO
                        console.log("This is a Topic event, topicId:", obj.data[0]);
                    }
                    await obj.storeRelatedObject();
                    console.log("IndexedObject stored successfully");
                    console.log("=== End IndexedObject processing ===");
                } catch (error) {
                    console.error("Error processing indexed object event:", error);
                }
                break;
            case EVENT_VOTE:
                await handleVoteEvent(arg, eventData);
                break;
            case EVENT_TOPIC_CLOSED:
                await handleTopicClosedEvent(arg, eventData);
                break;
            default:
                console.warn("Unknown event type:", eventType);
                break;
        }
        i += 1 + Number(eventLength);
    }
}

async function handleVoteEvent(arg: TxWitness, data: BigUint64Array) {
    try {
        console.log(`Vote Event received with data length: ${data.length}`);
        console.log("Full vote event data:", Array.from(data));

        // Parse vote event using VoteEventData class
        const voteEvent = VoteEventData.fromEvent(data);
        const voteObj = voteEvent.toObject();

        console.log(`Vote Event: Player [${voteObj.pid[0]}, ${voteObj.pid[1]}] voted ${voteObj.voteType === 1 ? 'Fair' : 'Unfair'} with weight ${voteObj.voteWeight} on topic ${voteObj.topicId}`);

        // Store vote event in database (use updateOne with upsert to prevent duplicates on service restart)
        await VoteEventModel.updateOne(
            {
                pid: voteObj.pid,
                topicId: voteObj.topicId,
                counter: voteObj.counter
            },
            voteObj,
            { upsert: true }
        );

        // Create or update player topic vote record (single vote per topic)
        const newVote = {
            pid: voteObj.pid,
            topicId: voteObj.topicId,
            voteWeight: voteObj.voteWeight,
            voteType: voteObj.voteType,  // 1 = Fair, 0 = Unfair (same as Rust enum)
            voteTime: voteObj.counter
        };

        await PlayerTopicVoteModel.findOneAndUpdate(
            {
                pid: voteObj.pid,
                topicId: voteObj.topicId
            },
            newVote,
            { upsert: true }
        );

        console.log(`Vote record saved to database for topic ${voteObj.topicId}`);

    } catch (error) {
        console.error("Error handling vote event:", error);
        console.error("Error details:", error);
    }
}

// Unstake event handler removed - votes are permanent in new model

async function handleTopicClosedEvent(arg: TxWitness, data: BigUint64Array) {
    try {
        console.log(`Topic Closed Event received with data length: ${data.length}`);
        console.log("Full topic closed event data:", Array.from(data));

        // Topic closed event format: [topic_id, counter]
        const topicId = data[0];
        const counter = data[1];

        console.log(`Topic Closed Event: Topic ${topicId} closed at counter ${counter}`);

        // Update topic's isActive status
        await TopicModel.findOneAndUpdate(
            { topicId: topicId.toString() },
            { isActive: false },
            { upsert: false }
        );

        console.log(`Topic ${topicId} marked as inactive`);

    } catch (error) {
        console.error("Error handling topic closed event:", error);
        console.error("Error details:", error);
    }
}

export default service;
