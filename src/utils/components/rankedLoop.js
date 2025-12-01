const pLimit = require('p-limit');
const { isOsuJSError, Auth, Client } = require('osu-web.js');

const osuUser = require("../../schemas/osuUser");
const season = require(`../../schemas/season`);

const ranks = require(`../discord/ranks.json`);

const { weeklyRewards } = require("../discord/packs");
const { getPlayerRank } = require("../discord/ranks");
const { getWeeklyRewardsTime } = require("../osu/formatNum");
const { addElo, startingElo, getEloRank } = require("../osu/skillsCalculation");
const { inventoryAddPack } = require("../discord/invAddPack");
const { addCurrecny } = require('../discord/currency');
const { default: mongoose } = require('mongoose');

const { osuId, osuToken } = process.env;

//APIv2
const auth = new Auth(osuId, osuToken);

module.exports = {
    async checkWeeklyRewards(client) {
        let timeTillRewards = await getWeeklyRewardsTime();

        setTimeout(function() {
            // start handling rewards
            //handleWeeklyRewards();
        }, timeTillRewards);

        async function handleWeeklyRewards() {
            var decayDeadline = new Date()

            decayDeadline.setDate(decayDeadline.getDate() - 7);

            const allUsers = await osuUser.find();

            for (const user of allUsers) {
                // ELO DECAY (only for 1v1)
                let userStartingElo = await startingElo(user.osuUserId);
                let isSafeDecay = user.recentMatches.some(match => match.players.length === 2 && match.date - decayDeadline > 0);

                if (!isSafeDecay && userStartingElo < user.elo["1v1"]) await addElo(user.osuUserName, user.elo["1v1"] - 5, 1);

                // PLAYER REWARDS (only if 3 ranked matches found this week)
                let matchCount = 0;

                for (let match of user.recentMatches) {
                    if (match.players.length === 2 || match.players.length === 4) matchCount++;
                    if (matchCount === 3) break;
                }

                if (matchCount === 3) {
                    // give rewards per rank
                    await weeklyRewards(user.discordId); // command to select custom country
                }

                // RESET RECENT MATCHES
                // UPDATE USER
                await osuUser.updateOne({ discordId: user.discordId }, {
                    $set: {
                        recentMatches: []
                    }
                });
            }
        }
    },

    async checkSeasonReset() {
        const seasons = await season.find();
        let currentSeason;

        if (seasons?.length > 0) {
            currentSeason = seasons[seasons.length - 1];
        } else {
            currentSeason = new season({
                _id: new mongoose.Types.ObjectId(),
                seasonNumber: 0,
                startDate: Date()
            });
            await currentSeason.save();
        }

        /*
        // Mock data of 10 users
        const allUsers = [
            { osuUserId: 1, discordId: 'user1', matchRecord: { "1v1": { wins: 10, losses: 5 }, "2v2": { wins: 8, losses: 7 } }, peak: { "1v1": 1500, "2v2": 1400 }, elo: { "1v1": 1450, "2v2": 1350 }, seasons: [] },
            { osuUserId: 2, discordId: 'user2', matchRecord: { "1v1": { wins: 3, losses: 8 }, "2v2": { wins: 2, losses: 9 } }, peak: { "1v1": 1250, "2v2": 1200 }, elo: { "1v1": 1230, "2v2": 1180 }, seasons: [] },
            { osuUserId: 3, discordId: 'user3', matchRecord: { "1v1": { wins: 15, losses: 2 }, "2v2": { wins: 12, losses: 5 } }, peak: { "1v1": 1700, "2v2": 1600 }, elo: { "1v1": 1680, "2v2": 1580 }, seasons: [] },
            { osuUserId: 4, discordId: 'user4', matchRecord: { "1v1": { wins: 0, losses: 12 }, "2v2": { wins: 1, losses: 11 } }, peak: { "1v1": 1100, "2v2": 1150 }, elo: { "1v1": 1080, "2v2": 1120 }, seasons: [] },
            { osuUserId: 5, discordId: 'user5', matchRecord: { "1v1": { wins: 7, losses: 7 }, "2v2": { wins: 6, losses: 8 } }, peak: { "1v1": 1350, "2v2": 1300 }, elo: { "1v1": 1320, "2v2": 1280 }, seasons: [] },
            { osuUserId: 6, discordId: 'user6', matchRecord: { "1v1": { wins: 20, losses: 1 }, "2v2": { wins: 18, losses: 3 } }, peak: { "1v1": 1800, "2v2": 1750 }, elo: { "1v1": 1780, "2v2": 1730 }, seasons: [] },
            { osuUserId: 7, discordId: 'user7', matchRecord: { "1v1": { wins: 4, losses: 9 }, "2v2": { wins: 3, losses: 10 } }, peak: { "1v1": 1200, "2v2": 1250 }, elo: { "1v1": 1180, "2v2": 1230 }, seasons: [] },
            { osuUserId: 8, discordId: 'user8', matchRecord: { "1v1": { wins: 11, losses: 4 }, "2v2": { wins: 9, losses: 6 } }, peak: { "1v1": 1550, "2v2": 1450 }, elo: { "1v1": 1520, "2v2": 1420 }, seasons: [] },
            { osuUserId: 9, discordId: 'user9', matchRecord: { "1v1": { wins: 2, losses: 10 }, "2v2": { wins: 1, losses: 11 } }, peak: { "1v1": 1150, "2v2": 1100 }, elo: { "1v1": 1130, "2v2": 1080 }, seasons: [] },
            { osuUserId: 10, discordId: 'user10', matchRecord: { "1v1": { wins: 14, losses: 3 }, "2v2": { wins: 13, losses: 4 } }, peak: { "1v1": 1650, "2v2": 1550 }, elo: { "1v1": 1620, "2v2": 1520 }, seasons: [] },
        ];
        */
        const allUsers = await osuUser.find();
        
        const totalUsers = allUsers.length;
        console.log(`Starting season reset for ${totalUsers} users...`);

        const BATCH_SIZE = 500;
        const CONCURRENCY = 20;
        const limit = pLimit(CONCURRENCY);

        let bulkOps = [];
        let rewardQueue = [];
        let processedDB = 0;
        let processedRewards = 0;

        for (let i = 0; i < totalUsers; i++) {
            const user = allUsers[i];
            let userSeasons = user.seasons ?? [];

            // Save previous season stats
            userSeasons.push({
                season: currentSeason.seasonNumber,
                matchRecord: {
                    "1v1": user.matchRecord["1v1"],
                    "2v2": user.matchRecord["2v2"]
                },
                peak: {
                    "1v1": user.peak["1v1"] || user.elo["1v1"] || 0,
                    "2v2": user.peak["2v2"] || user.elo["2v2"] || 0
                }
            });

            // ELO reset
            const eloReset = 70;
            const duelMatches = user.matchRecord["1v1"].wins + user.matchRecord["1v1"].losses;
            const duosMatches = user.matchRecord["2v2"].wins + user.matchRecord["2v2"].losses;

            let duelELO = duelMatches > 5 ? Math.min(user.peak["1v1"] - eloReset, 1800) : 0;
            let duosELO = duosMatches > 5 ? Math.min(user.peak["2v2"] - eloReset, 1800) : 0;

            if (duelELO < 1200) duelELO = 0;
            if (duosELO < 1200) duosELO = 0;

            // Prepare bulkWrite operation
            bulkOps.push({
                updateOne: {
                    filter: { osuUserId: user.osuUserId },
                    update: {
                        $set: {
                            elo: { "1v1": duelELO, "2v2": duosELO },
                            matchRecord: {
                                "1v1": { wins: 0, losses: 0 },
                                "2v2": { wins: 0, losses: 0 }
                            },
                            peak: { "1v1": 0, "2v2": 0 },
                            seasons: userSeasons,
                            scoreRewards: [],
                            recentMatchUp: [],
                            recentMatches: []
                        }
                    }
                }
            });

            // Queue reward operation for Discord
            rewardQueue.push(limit(async () => {
                const lastSeason = userSeasons[userSeasons.length - 1];
                let peakElo = lastSeason.peak["1v1"];

                // Next season change for placement matches
                let peakMatches = lastSeason.matchRecord["1v1"].wins + lastSeason.matchRecord["1v1"].losses;

                if (peakMatches < 5 || peakElo < lastSeason.peak["2v2"]) {
                    peakElo = lastSeason.peak["2v2"];
                    peakMatches = lastSeason.matchRecord["2v2"].wins + lastSeason.matchRecord["2v2"].losses;
                }

                await sleep(100); // rate-limit

                //console.log(`Giving rewards to user ${user.osuUserId} for season ${currentSeason.seasonNumber} with peak ELO ${peakElo} over ${peakMatches} matches.`);
                await rankRewards(user.discordId, await getPlayerRank(undefined, undefined, peakElo, peakMatches));

                processedRewards++;
                printProgress(processedRewards, totalUsers, 'Discord Rewards');
            }));

            // Execute bulkWrite in batches
            if (bulkOps.length >= BATCH_SIZE || i === totalUsers - 1) {
                console.log(`Executing bulkWrite for ${bulkOps.length} users...`);
                await osuUser.bulkWrite(bulkOps, { ordered: false });

                processedDB += bulkOps.length;
                printProgress(processedDB, totalUsers, 'DB Updates');
                bulkOps = [];
            }
        }

        // Wait for all reward operations to complete
        await Promise.all(rewardQueue);

        /*
        console.log(`Season simulation process completed for ${totalUsers} users.`);
        return;
        */

        // Start new season
        const newSeason = new season({
            _id: new mongoose.Types.ObjectId(),
            seasonNumber: currentSeason.seasonNumber + 1,
            startDate: Date()
        });

        await newSeason.save();
        console.log("Season reset completed.");

        function sleep(ms) {
            return new Promise(res => setTimeout(res, ms));
        }

        /**
         * Prints progress percentage in console.
         * @param {number} completed 
         * @param {number} total 
         * @param {string} label 
         */
        function printProgress(completed, total, label = '') {
            const percent = ((completed / total) * 100).toFixed(2);
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            process.stdout.write(`${label} Progress: ${completed}/${total} (${percent}%)`);
            if (completed === total) process.stdout.write('\n');
        }

        async function rankRewards(discordId, rank, country) {
            switch(rank) {
                case ranks[0].rank:
                    await addCurrecny(discordId, 10000);
                    break;
                case `${ranks[1].rank} 3`:
                    await addCurrecny(discordId, 8800);
                    break;
                case `${ranks[1].rank} 2`:
                    await addCurrecny(discordId, 8300);
                    break;
                case `${ranks[1].rank} 1`:
                    await addCurrecny(discordId, 8100);
                    break;
                case `${ranks[2].rank} 3`:
                    await addCurrecny(discordId, 6700);
                    break;
                case `${ranks[2].rank} 2`:
                    await addCurrecny(discordId, 6400);
                    break;
                case `${ranks[2].rank} 1`:
                    await addCurrecny(discordId, 6100);
                    break;
                case `${ranks[3].rank} 3`:
                    await addCurrecny(discordId, 5400);
                    break;
                case `${ranks[3].rank} 2`:
                    await addCurrecny(discordId, 4700);
                    break;
                case `${ranks[3].rank} 1`:
                    await addCurrecny(discordId, 4300);
                    break;
                case `${ranks[4].rank} 3`:
                    await addCurrecny(discordId, 3600);
                    break;
                case `${ranks[4].rank} 2`:
                    await addCurrecny(discordId, 3200);
                    break;
                case `${ranks[4].rank} 1`:
                    await addCurrecny(discordId, 2900);
                    break;
                case `${ranks[5].rank} 3`:
                    await addCurrecny(discordId, 2500);
                    break;
                case `${ranks[5].rank} 2`:
                    await addCurrecny(discordId, 2300);
                    break;
                case `${ranks[5].rank} 1`:
                    await addCurrecny(discordId, 2100);
                    break;
                case `${ranks[6].rank} 3`:
                    await addCurrecny(discordId, 1450);
                    break;
                case `${ranks[6].rank} 2`:
                    await addCurrecny(discordId, 1250);
                    break;
                case `${ranks[6].rank} 1`:
                    await addCurrecny(discordId, 1150);
                    break;
                default:
                    if (rank.includes(ranks[7].rank)) {
                        await addCurrecny(discordId, 700);
                    }
                    break;
            }
        }
    }
};