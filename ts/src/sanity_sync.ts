/**
 * ============================================================================
 * zkfair Sanity CMS Synchronization Script
 * ============================================================================
 *
 * 📚 Overview:
 * This script synchronizes voting topics between Sanity CMS (content) and
 * the zkfair backend (on-chain state). It uses a hybrid content model:
 *
 * - Sanity CMS: Stores rich content (title, description, images)
 * - zkfair Backend: Stores on-chain state (votes, timestamps, status)
 *
 * ============================================================================
 * 🏗️  Architecture
 * ============================================================================
 *
 * Topic Content Flow:
 * 1. Content creators create topics in Sanity Studio with title/description/image
 * 2. Set status to "published" when ready to deploy
 * 3. Run this sync script to create topics on-chain (sequential IDs)
 * 4. Frontend fetches:
 *    - On-chain data from zkfair API (votes, status, timestamps)
 *    - Content data from Sanity API (title, description, image)
 *    - Combines both using topicId as the key
 *
 * Why this approach?
 * - On-chain: Only essential voting logic (gas efficient, immutable)
 * - Off-chain: Rich content that can be updated (images, descriptions)
 * - Best of both worlds: Decentralized voting + Flexible content management
 *
 * ============================================================================
 * 📋 Prerequisites
 * ============================================================================
 *
 * 1. Sanity CMS Setup:
 *    - Create a Sanity project at https://www.sanity.io
 *    - Install Sanity Studio: npm install -g @sanity/cli
 *    - Initialize project: sanity init
 *    - Add the schema below to your Sanity Studio
 *
 * 2. Environment Variables (.env):
 *    SANITY_PROJECT_ID=your-project-id      # From Sanity dashboard
 *    SANITY_DATASET=production              # Usually "production"
 *    SANITY_TOKEN=your-token                # Generate in Sanity dashboard (Manage API)
 *    API_BASE_URL=http://localhost:3000     # zkfair backend URL
 *    MANAGER_KEY=your-manager-key           # Manager's private key for creating topics
 *
 * 3. Manager Permissions:
 *    - The MANAGER_KEY must be granted manager role via ADD_MANAGER command
 *    - Only managers can create topics on-chain
 *
 * ============================================================================
 * 🗂️  Sanity Schema Definition
 * ============================================================================
 *
 * Add this schema to your Sanity Studio project (schemas/topic.ts):
 *
 * ```typescript
 * export default {
 *   name: 'topic',
 *   title: 'Voting Topic',
 *   type: 'document',
 *   fields: [
 *     {
 *       name: 'topicId',
 *       title: 'Topic ID',
 *       type: 'number',
 *       description: 'Sequential topic ID (must match on-chain ID). Start from 1.',
 *       validation: (Rule) => Rule.required().positive().integer(),
 *     },
 *     {
 *       name: 'title',
 *       title: 'Title',
 *       type: 'string',
 *       description: 'The voting question (e.g., "Is Feature X Fair?")',
 *       validation: (Rule) => Rule.required().max(200),
 *     },
 *     {
 *       name: 'description',
 *       title: 'Description',
 *       type: 'text',
 *       description: 'Detailed description providing context',
 *       rows: 5,
 *     },
 *     {
 *       name: 'image',
 *       title: 'Cover Image',
 *       type: 'image',
 *       options: { hotspot: true },
 *       fields: [
 *         {
 *           name: 'alt',
 *           title: 'Alt Text',
 *           type: 'string',
 *         },
 *       ],
 *     },
 *     {
 *       name: 'duration',
 *       title: 'Duration (blocks)',
 *       type: 'number',
 *       description: 'How many blocks this topic will be active',
 *       validation: (Rule) => Rule.required().positive().integer().min(1),
 *       initialValue: 500,
 *     },
 *     {
 *       name: 'status',
 *       title: 'Status',
 *       type: 'string',
 *       description: 'Only "published" topics will be synced',
 *       options: {
 *         list: [
 *           { title: 'Draft', value: 'draft' },
 *           { title: 'Published', value: 'published' },
 *         ],
 *       },
 *       initialValue: 'draft',
 *       validation: (Rule) => Rule.required(),
 *     },
 *     {
 *       name: 'createdAt',
 *       title: 'Created At',
 *       type: 'datetime',
 *       initialValue: () => new Date().toISOString(),
 *     },
 *   ],
 *   preview: {
 *     select: {
 *       title: 'title',
 *       topicId: 'topicId',
 *       media: 'image',
 *       status: 'status',
 *     },
 *     prepare(selection) {
 *       const { title, topicId, media, status } = selection;
 *       return {
 *         title: `Topic #${topicId}: ${title}`,
 *         subtitle: `Status: ${status}`,
 *         media,
 *       };
 *     },
 *   },
 * };
 * ```
 *
 * ============================================================================
 * 🚀 Usage
 * ============================================================================
 *
 * 1. Create topics in Sanity Studio:
 *    - Open Sanity Studio (sanity start)
 *    - Create new topic documents
 *    - Set topicId sequentially (1, 2, 3, ...)
 *    - Add title, description, image, duration
 *    - Set status to "published"
 *
 * 2. Run synchronization:
 *    ```bash
 *    cd ts
 *    npx tsc --skipLibCheck  # Compile TypeScript
 *    node dist/sanity_sync.js  # Run sync
 *    ```
 *
 * 3. What happens:
 *    - Script fetches published topics from Sanity
 *    - Compares with existing on-chain topics
 *    - Creates missing topics on-chain (in order)
 *    - Verifies existing topics
 *
 * 4. Frontend integration:
 *    ```typescript
 *    // Fetch on-chain data
 *    const topics = await fetch('http://localhost:3000/data/topics').then(r => r.json());
 *
 *    // Fetch Sanity content for each topic
 *    const sanityContent = await sanityClient.fetch(
 *      `*[_type == "topic" && topicId == $topicId][0]`,
 *      { topicId: topic.topicId }
 *    );
 *
 *    // Combine both
 *    const fullTopic = {
 *      ...topic,              // On-chain data (votes, status)
 *      ...sanityContent,      // Content (title, description, image)
 *    };
 *    ```
 *
 * ============================================================================
 * ⚠️  Important Notes
 * ============================================================================
 *
 * 1. Sequential Topic IDs:
 *    - On-chain topics are auto-incremented (1, 2, 3, ...)
 *    - Sanity topicId MUST match on-chain ID exactly
 *    - Create topics in order to avoid ID conflicts
 *
 * 2. Content vs State Separation:
 *    - Title/description/image are NOT stored on-chain
 *    - Only duration parameter is used for on-chain creation
 *    - Frontend MUST fetch from both sources
 *
 * 3. Status Management:
 *    - Only "published" topics are synced
 *    - Draft topics are ignored
 *    - Closing topics happens on-chain (via CLOSE_TOPIC command)
 *
 * 4. ID Verification:
 *    - Script validates sequential IDs before creation
 *    - Aborts if non-sequential IDs detected
 *    - Prevents ID mismatches between Sanity and blockchain
 *
 * 5. Manager Permissions:
 *    - Only manager accounts can create topics
 *    - Ensure MANAGER_KEY has been granted manager role
 *    - Admin can grant via: addManager(managerPid1, managerPid2)
 *
 * ============================================================================
 * 🔍 Troubleshooting
 * ============================================================================
 *
 * Error: "Topic ID mismatch"
 * - Fix: Ensure Sanity topicId matches expected next on-chain ID
 * - Check: Backend has IDs [1,2,3], next must be 4
 *
 * Error: "Non-sequential topic IDs"
 * - Fix: Set Sanity topicIds to be sequential (no gaps)
 * - Example: If creating 3 new topics after ID 5, use [6,7,8]
 *
 * Error: "Manager player not authorized"
 * - Fix: Grant manager role to MANAGER_KEY account
 * - Command: admin.addManager(managerPid1, managerPid2)
 *
 * Error: "Failed to fetch topics from Sanity"
 * - Fix: Check SANITY_PROJECT_ID, SANITY_DATASET, SANITY_TOKEN
 * - Verify: Token has read permissions in Sanity dashboard
 *
 * ============================================================================
 */

import { createClient, SanityClient } from '@sanity/client';
import { VotingAPI, TopicData, VotingPlayer } from './api.js';
import { ZKWasmAppRpc } from 'zkwasm-minirollup-rpc';
import { get_server_admin_key } from 'zkwasm-ts-server/src/config.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Sanity topic interface - stores content (title, description, image) for each topic
interface SanityTopic {
  _id: string;
  _type: 'topic';
  topicId: number;           // Corresponds to on-chain topic ID
  title: string;             // Display title (e.g., "Is feature X fair?")
  description?: string;      // Detailed description of the topic
  image?: {                  // Cover image for the topic
    _type: 'image';
    asset: {
      _ref: string;
      _type: 'reference';
    };
  };
  duration: number;          // Duration in blocks (for creating new topics)
  createdAt?: string;        // Creation timestamp (for reference)
  status?: 'draft' | 'published'; // Status in Sanity CMS
}

class SanitySyncService {
  private sanityClient: SanityClient;
  private votingAPI: VotingAPI;
  private managerPlayer: VotingPlayer;

  constructor() {
    // Initialize Sanity client
    this.sanityClient = createClient({
      projectId: process.env.SANITY_PROJECT_ID || 'your-project-id',
      dataset: process.env.SANITY_DATASET || 'production',
      apiVersion: '2024-01-01',
      useCdn: true,
      token: process.env.SANITY_TOKEN // Required for write operations
    });

    // Initialize backend API
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    this.votingAPI = new VotingAPI(baseUrl);

    // Initialize manager player for creating topics
    const managerKey = process.env.MANAGER_KEY || get_server_admin_key();
    const rpc = new ZKWasmAppRpc(baseUrl);
    this.managerPlayer = new VotingPlayer(managerKey, rpc);
  }

  // Get all topics from Sanity (only published ones)
  async getSanityTopics(): Promise<SanityTopic[]> {
    try {
      const query = `
        *[_type == "topic" && status == "published"] | order(topicId asc) {
          _id,
          _type,
          topicId,
          title,
          description,
          image,
          duration,
          createdAt,
          status
        }
      `;

      const topics: SanityTopic[] = await this.sanityClient.fetch(query);
      console.log(`📊 Retrieved ${topics.length} published topics from Sanity`);
      return topics;
    } catch (error) {
      console.error('❌ Error fetching topics from Sanity:', error);
      throw error;
    }
  }

  // Get all topics from backend
  async getBackendTopics(): Promise<TopicData[]> {
    try {
      const topics = await this.votingAPI.getAllTopics();
      console.log(`🔧 Retrieved ${topics.length} topics from backend`);
      return topics;
    } catch (error) {
      console.error('❌ Error fetching topics from backend:', error);
      throw error;
    }
  }

  // Verify that backend topic exists (no need to compare content, Sanity is source of truth for content)
  verifyTopicExists(sanityTopic: SanityTopic, backendTopic: TopicData): boolean {
    // For zkfair, we only verify the topic exists on-chain
    // Sanity stores the content (title, description, image)
    // Backend stores the voting state (votes, isActive, etc.)

    const topicIdMatches = sanityTopic.topicId === parseInt(backendTopic.topicId);

    if (!topicIdMatches) {
      console.error(`❌ Topic ID mismatch: Sanity ${sanityTopic.topicId} vs Backend ${backendTopic.topicId}`);
      return false;
    }

    // Log the current state for verification
    console.log(`✅ Topic ${sanityTopic.topicId} exists on-chain:`);
    console.log(`   Title (Sanity): "${sanityTopic.title}"`);
    console.log(`   Status: ${backendTopic.isActive ? 'Active' : 'Closed'}`);
    console.log(`   Fair Votes: ${backendTopic.totalFairVotes}, Unfair Votes: ${backendTopic.totalUnfairVotes}`);

    return true;
  }

  // Create new topic on-chain based on Sanity data
  async createTopicFromSanity(sanityTopic: SanityTopic): Promise<void> {
    try {
      console.log(`🔨 Creating topic ${sanityTopic.topicId}: "${sanityTopic.title}"`);
      console.log(`   Duration: ${sanityTopic.duration} blocks`);

      if (sanityTopic.description) {
        console.log(`   Description: ${sanityTopic.description.substring(0, 100)}...`);
      }

      // Create topic on-chain with specified duration
      const result = await this.managerPlayer.createTopic(BigInt(sanityTopic.duration));

      console.log(`✅ Successfully created topic ${sanityTopic.topicId} on-chain`);
      console.log('   Transaction result:', result);
      console.log('   ⚠️  Note: Content (title, description, image) is stored in Sanity, not on-chain');
    } catch (error) {
      console.error(`❌ Failed to create topic ${sanityTopic.topicId}:`, error);
      throw error;
    }
  }

  // Install and verify manager player (ignore if already exists)
  async installManagerPlayer(): Promise<void> {
    try {
      console.log('🔧 Installing manager player...');
      await this.managerPlayer.installPlayer();
      console.log('✅ Manager player installed successfully');
      console.log('   ⚠️  Make sure this player has been granted manager permissions via ADD_MANAGER');
    } catch (error) {
      if (error instanceof Error && error.message === "PlayerAlreadyExists") {
        console.log('ℹ️  Manager player already exists, continuing...');
      } else {
        console.error('❌ Failed to install manager player:', error);
        throw error;
      }
    }
  }

  // Main sync function
  async syncTopics(): Promise<void> {
    console.log('🚀 Starting Sanity-Backend topic synchronization...\n');
    console.log('📝 About this sync:');
    console.log('   - Sanity: Content source (title, description, images)');
    console.log('   - Backend: On-chain state (votes, status, timestamps)');
    console.log('   - Topics are created sequentially with auto-incrementing IDs\n');

    try {
      // Install manager player first (ignore if already exists)
      await this.installManagerPlayer();

      // Wait for installation to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Fetch data from both sources
      const [sanityTopics, backendTopics] = await Promise.all([
        this.getSanityTopics(),
        this.getBackendTopics()
      ]);

      // Extract topic IDs
      const sanityTopicIds = sanityTopics.map(t => t.topicId);
      const backendTopicIds = backendTopics.map(t => parseInt(t.topicId));

      console.log(`\n📈 Sanity topic IDs: [${sanityTopicIds.join(', ')}]`);
      console.log(`🔧 Backend topic IDs: [${backendTopicIds.join(', ')}]`);

      // Verify sequential ordering
      const expectedNextId = backendTopicIds.length > 0 ? Math.max(...backendTopicIds) + 1 : 1;
      const newTopics = sanityTopics.filter(t => !backendTopicIds.includes(t.topicId));

      if (newTopics.length > 0) {
        console.log(`\n🆕 Found ${newTopics.length} new topics to create`);

        // Verify they start from the expected ID
        const firstNewId = Math.min(...newTopics.map(t => t.topicId));
        if (firstNewId !== expectedNextId) {
          console.error(`\n❌ Topic ID mismatch!`);
          console.error(`   Expected next topic ID: ${expectedNextId}`);
          console.error(`   First new topic ID in Sanity: ${firstNewId}`);
          console.error(`   Please fix Sanity topic IDs to be sequential`);
          process.exit(1);
        }

        // Verify all new IDs are sequential
        const sortedNewIds = newTopics.map(t => t.topicId).sort((a, b) => a - b);
        for (let i = 0; i < sortedNewIds.length; i++) {
          if (sortedNewIds[i] !== expectedNextId + i) {
            console.error(`\n❌ Non-sequential topic IDs detected!`);
            console.error(`   Expected: ${expectedNextId + i}, Got: ${sortedNewIds[i]}`);
            console.error(`   All new topics must have sequential IDs`);
            process.exit(1);
          }
        }
      }

      // Process each Sanity topic
      for (const sanityTopic of sanityTopics) {
        const topicId = sanityTopic.topicId;
        console.log(`\n🔍 Processing topic ${topicId}: "${sanityTopic.title}"`);

        if (backendTopicIds.includes(topicId)) {
          // Topic exists in backend - verify it exists
          const backendTopic = backendTopics.find(t => parseInt(t.topicId) === topicId);
          if (!backendTopic) {
            console.error(`❌ Backend topic ${topicId} not found (unexpected error)`);
            process.exit(1);
          }

          this.verifyTopicExists(sanityTopic, backendTopic);
        } else {
          // Topic doesn't exist in backend - create new topic
          console.log(`🆕 Topic ${topicId} not found in backend, creating new topic...`);
          await this.createTopicFromSanity(sanityTopic);

          // Wait for transaction to be processed
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      console.log('\n🎉 Synchronization completed successfully!');
      console.log('\n📚 Next steps:');
      console.log('   1. Frontend should fetch topics from backend API');
      console.log('   2. For each topic, fetch content (title, description, image) from Sanity using topicId');
      console.log('   3. Combine on-chain data (votes, status) with Sanity content for display');
    } catch (error) {
      console.error('\n💥 Synchronization failed:', error);
      process.exit(1);
    }
  }
}

// Main execution
async function main() {
  const syncService = new SanitySyncService();
  await syncService.syncTopics();
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Script execution failed:', error);
    process.exit(1);
  });
}

export default SanitySyncService; 