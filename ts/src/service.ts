import { Express } from "express";
import mongoose from 'mongoose';
import { Event, EventModel, Service, TxStateManager, TxWitness } from "zkwasm-ts-server";
import { merkleRootToBeHexString } from "zkwasm-ts-server/src/lib.js";
import {
    TopicModel,
    VoteEventModel,
    UnstakeEventModel,
    PlayerTopicVoteModel,
    docToJSON,
    IndexedObject,
    VoteEventData,
    UnstakeEventData,
    EVENT_INDEXED_OBJECT,
    EVENT_VOTE,
    EVENT_UNSTAKE,
    EVENT_TOPIC_CLOSED
} from "./models.js";

const service = new Service(eventCallback, batchedCallback, extra);
await service.initialize();

let txStateManager = new TxStateManager(merkleRootToBeHexString(service.merkleRoot));

const VOTE_COMMAND = 1n;

// Front end
/*
public async sendVote(address, signature, topicid): Promise<any> {
    try {
      let resp:any = await XXX call vote
      for (let i=0; i<5; i++) {//detect job status with 1 sec delay
        await delay(1000);
        let jobStatus;
        try {
            jobStatus = await this.queryJobStatus(resp.jobid);
            if(jobStatus.finishedOn == undefined) {
              throw Error("WaitingForProcess");
            }
        } catch(e) {
          continue
        }
        if (jobStatus) {
          if (jobStatus.finishedOn != undefined && jobStatus.failedReason == undefined ) {
            return jobStatus.returnvalue;
          } else {
            throw Error(jobStatus.failedReason)
          }
        }
      }
      throw Error("MonitorTransactionFail");
    } catch(e) {
      //console.log(e);
      throw e;
    }
  }
*/


function extra(app: Express) {
    app.post('/vote', async (req, res) => {
      const value = req.body;
      // let signature = XXX
      // let addr = XXX
      let topicId = BigInt(value.topicId);
      // verifyErcSignature(topic, addr, signature);
      let fair = BigInt(value.fair);

      try {
        let balance = verify_and_get_balance();
        let signatureValue = sign(createCommand(0n, VOTE_COMMAND, [topicId, fair]), get_server_admin_key());
        const job = await service.queue!.add('transaction', { value });
        res.status(201).send({
            success: true,
            jobid: job.id
        });
        }
      } catch (error) {
        console.error('Error adding job to the queue:', error);
        res.status(500).send('Failed to add job to the queue');
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

    // Get recent unstake events for specific topic
    app.get("/data/topic/:topicId/unstakes", async (req: any, res) => {
        try {
            const topicId = req.params.topicId;

            const doc = await UnstakeEventModel.find({ topicId: topicId })
                .sort({ counter: -1 })
                .limit(100);

            let data = doc.map((d: mongoose.Document) => {
                const unstake = docToJSON(d);
                unstake.transactionType = 'UNSTAKE';
                return unstake;
            });

            res.status(200).send({
                success: true,
                data: data,
            });
        } catch (e) {
            console.error("Error fetching topic unstakes:", e);
            res.status(500).send({
                success: false,
                error: "Failed to fetch topic unstakes"
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
                // Return default empty vote state
                res.status(200).send({
                    success: true,
                    data: {
                        pid: [pid1, pid2],
                        topicId: topicId,
                        stakedAmount: "0",
                        fairWeight: "0",
                        unfairWeight: "0",
                        firstVoteTime: "0",
                        lastVoteTime: "0",
                        lastFairVoteTime: "0",
                        lastUnfairVoteTime: "0"
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
            const topicId = req.params.topicId;

            // Get vote count
            const voteCount = await VoteEventModel.countDocuments({ topicId: topicId });

            // Get unstake count
            const unstakeCount = await UnstakeEventModel.countDocuments({ topicId: topicId });

            // Get unique voters
            const uniqueVotersResult = await VoteEventModel.aggregate([
                { $match: { topicId: topicId } },
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
                voteCount,
                unstakeCount,
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
    let doc = new EventModel({
        id: event.id.toString(),
        data: Buffer.from(event.data.buffer)
    });

    try {
        let result = await doc.save();
        if (!result) {
            console.error("Failed to save event");
            throw new Error("save event to db failed");
        }
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
            case EVENT_UNSTAKE:
                await handleUnstakeEvent(arg, eventData);
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

        console.log(`Vote Event: Player [${voteObj.pid[0]}, ${voteObj.pid[1]}] voted ${voteObj.voteType} with ${voteObj.stakeAmount} on topic ${voteObj.topicId}`);

        // Store vote event in database
        await VoteEventModel.create(voteObj);

        // Update or create player topic vote record
        const existingVote = await PlayerTopicVoteModel.findOne({
            pid: voteObj.pid,
            topicId: voteObj.topicId
        });

        if (existingVote) {
            // Update existing vote
            if (voteObj.voteType === 1) { // Fair
                existingVote.fairWeight = (BigInt(existingVote.fairWeight) + BigInt(voteObj.stakeAmount)).toString() as any;
                if (BigInt(existingVote.lastFairVoteTime) === 0n) {
                    existingVote.lastFairVoteTime = voteObj.counter.toString() as any;
                }
            } else { // Unfair
                existingVote.unfairWeight = (BigInt(existingVote.unfairWeight) + BigInt(voteObj.stakeAmount)).toString() as any;
                if (BigInt(existingVote.lastUnfairVoteTime) === 0n) {
                    existingVote.lastUnfairVoteTime = voteObj.counter.toString() as any;
                }
            }
            existingVote.stakedAmount = (BigInt(existingVote.stakedAmount) + BigInt(voteObj.stakeAmount)).toString() as any;
            existingVote.lastVoteTime = voteObj.counter.toString() as any;
            await existingVote.save();
        } else {
            // Create new vote record
            const newVote: any = {
                pid: voteObj.pid,
                topicId: voteObj.topicId,
                stakedAmount: voteObj.stakeAmount.toString(),
                fairWeight: voteObj.voteType === 1 ? voteObj.stakeAmount.toString() : "0",
                unfairWeight: voteObj.voteType === 0 ? voteObj.stakeAmount.toString() : "0",
                firstVoteTime: voteObj.counter.toString(),
                lastVoteTime: voteObj.counter.toString(),
                lastFairVoteTime: voteObj.voteType === 1 ? voteObj.counter.toString() : "0",
                lastUnfairVoteTime: voteObj.voteType === 0 ? voteObj.counter.toString() : "0"
            };
            await PlayerTopicVoteModel.create(newVote);
        }

        console.log(`Vote record saved to database for topic ${voteObj.topicId}`);

    } catch (error) {
        console.error("Error handling vote event:", error);
        console.error("Error details:", error);
    }
}

async function handleUnstakeEvent(arg: TxWitness, data: BigUint64Array) {
    try {
        console.log(`Unstake Event received with data length: ${data.length}`);
        console.log("Full unstake event data:", Array.from(data));

        // Parse unstake event using UnstakeEventData class
        const unstakeEvent = UnstakeEventData.fromEvent(data);
        const unstakeObj = unstakeEvent.toObject();

        console.log(`Unstake Event: Player [${unstakeObj.pid[0]}, ${unstakeObj.pid[1]}] unstaked ${unstakeObj.amount} from topic ${unstakeObj.topicId}`);

        // Store unstake event in database
        await UnstakeEventModel.create(unstakeObj);

        // Update player topic vote record
        const existingVote = await PlayerTopicVoteModel.findOne({
            pid: unstakeObj.pid,
            topicId: unstakeObj.topicId
        });

        if (existingVote) {
            existingVote.stakedAmount = (BigInt(existingVote.stakedAmount) - BigInt(unstakeObj.amount)).toString() as any;
            await existingVote.save();
        }

        console.log(`Unstake record saved to database for topic ${unstakeObj.topicId}`);

    } catch (error) {
        console.error("Error handling unstake event:", error);
        console.error("Error details:", error);
    }
}

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
